/**
 * Moderation Service (Module 20)
 * ==============================
 * Complete moderator workflow for reviewing flagged content.
 *
 * Every action creates an audit log entry in ModerationLog.
 *
 * Moderator capabilities:
 *   - View flagged posts (REVIEW_REQUIRED, under_review, flagged)
 *   - View reports on posts
 *   - Inspect Trust Score, AI results, claims, evidence, fact-check sources
 *   - Assign final decision (approve / reject)
 *   - Override trust label (ADMIN only)
 *   - Add moderation reason
 *   - Resolve / dismiss reports
 */

const ModerationLog = require('../models/moderationLog.model');
const { MODERATION_ACTION } = require('../models/moderationLog.model');
const Post = require('../models/post.model');
const Report = require('../models/report.model');
const { REPORT_STATUS } = require('../models/report.model');
const TrustScore = require('../models/trust-score.model');
const TextAnalysis = require('../models/text-analysis.model');
const ClaimEntity = require('../models/claim-entity.model');
const Evidence = require('../models/evidence.model');
const { ApiError } = require('../middleware/error.middleware');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

class ModerationService {
  // ─── View Flagged Posts ───────────────────────────────

  /**
   * Get posts that need moderation review.
   *
   * @param {Object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @param {string} [opts.status] — Filter by verificationStatus or moderationStatus
   * @returns {Promise<Object>} Posts + pagination
   */
  async getFlaggedPosts({ page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;

    // Posts needing review: REVIEW_REQUIRED, under_review, flagged, rejected
    const filter = {
      $or: [
        { verificationStatus: 'REVIEW_REQUIRED' },
        { moderationStatus: 'under_review' },
        { moderationStatus: 'flagged' },
        { moderationStatus: 'rejected' },
        { moderationStatus: 'pending' },
      ],
    };

    if (status) {
      // Override with specific status filter
      delete filter.$or;
      filter.$or = [
        { verificationStatus: status },
        { moderationStatus: status },
      ];
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('user', 'name username avatar role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Inspect Post Details ─────────────────────────────

  /**
   * Get the full moderation context for a post:
   *   - Post content
   *   - Trust Score
   *   - AI text analysis (claims, entities)
   *   - Evidence items
   *   - Reports filed against it
   *   - Previous moderation logs
   *
   * @param {string} postId
   * @returns {Promise<Object>} Full context
   */
  async getPostInspection(postId) {
    const post = await Post.findById(postId).populate('user', 'name username avatar role');
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const [trustScore, textAnalysis, claims, evidence, reports, moderationLogs] =
      await Promise.all([
        TrustScore.findOne({ post: postId }),
        TextAnalysis.findOne({ post: postId }),
        ClaimEntity.find({ post: postId }).sort({ createdAt: -1 }),
        Evidence.find({ post: postId }).sort({ createdAt: -1 }),
        Report.find({ targetId: postId, targetType: 'Post' })
          .populate('reporter', 'name username')
          .sort({ createdAt: -1 }),
        ModerationLog.find({ postId }).populate('moderatorId', 'name username').sort({ createdAt: -1 }),
      ]);

    return {
      post,
      trustScore: trustScore
        ? {
            score: trustScore.score,
            label: trustScore.label,
            authenticity: trustScore.authenticity,
            factualVerification: trustScore.factualVerification,
            sourceCredibility: trustScore.sourceCredibility,
            modelConfidence: trustScore.modelConfidence,
            explanation: trustScore.explanation,
            isOverrideApplied: trustScore.isOverrideApplied,
            evidenceRefs: trustScore.evidenceRefs,
          }
        : null,
      textAnalysis: textAnalysis
        ? {
            misinformationProbability: textAnalysis.misinformationProbability,
            aiGeneratedProbability: textAnalysis.aiGeneratedProbability,
            claims: textAnalysis.claims,
            entities: textAnalysis.entities,
            confidence: textAnalysis.confidence,
          }
        : null,
      claims: claims.map((c) => ({
        claims: c.claims,
        entities: c.entities,
        verificationScore: c.verificationScore,
        status: c.status,
      })),
      evidence: evidence.map((e) => ({
        claim: e.claim,
        aggregateVerdict: e.aggregateVerdict,
        weightedConfidence: e.weightedConfidence,
        sourceCount: e.sourceCount,
        evidenceItems: e.evidenceItems.map((item) => ({
          source: item.source,
          sourceType: item.sourceType,
          verdict: item.verdict,
          confidence: item.confidence,
          url: item.url,
        })),
      })),
      reports,
      moderationLogs,
      currentLabel: post.trustBadge || 'None',
      currentStatus: post.moderationStatus,
    };
  }

  // ─── Approve Content ──────────────────────────────────

  /**
   * Approve a post and mark it as published.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async approvePost({ postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.moderationStatus = 'approved';
    post.verificationStatus = 'PUBLISHED';
    post.trustBadge = 'Green'; // Approved content gets Green
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.APPROVE,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'approved',
      previousLabel,
      newLabel: 'Green',
    });

    // Audit: log moderation action (non-critical — never block the main operation)
    try {
      await auditService.logModerationEvent({
        eventType: 'POST_APPROVED',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: 'Green', previousStatus, newStatus: 'approved' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyModerationAction({
        postOwnerId: post.user,
        moderatorId,
        action: 'POST_APPROVED',
        postId,
        reason: reason.trim(),
        changes: { previousLabel, newLabel: 'Green', previousStatus, newStatus: 'approved' },
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Reject Content ───────────────────────────────────

  /**
   * Reject a post.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async rejectPost({ postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.moderationStatus = 'rejected';
    post.verificationStatus = 'REJECTED';
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.REJECT,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'rejected',
      previousLabel,
      newLabel: previousLabel, // Label stays the same, status changes
    });

    // Audit: log moderation action (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'POST_REJECTED',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'rejected' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyModerationAction({
        postOwnerId: post.user,
        moderatorId,
        action: 'POST_REJECTED',
        postId,
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'rejected' },
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Override Label (ADMIN only) ──────────────────────

  /**
   * Override the trust label for a post. Only ADMIN can do this.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @param {string} params.newLabel — New trust label
   * @returns {Promise<Object>} Audit log entry
   */
  async overrideLabel({ postId, moderatorId, reason, newLabel }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const validLabels = ['Green', 'Blue', 'Purple', 'Orange', 'Red'];
    if (!validLabels.includes(newLabel)) {
      throw new ApiError(400, `Invalid label. Must be one of: ${validLabels.join(', ')}`);
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.trustBadge = newLabel;
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.OVERRIDE_LABEL,
      reason: reason.trim(),
      previousStatus,
      newStatus: post.moderationStatus,
      previousLabel,
      newLabel,
    });

    // Audit: log label override (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'LABEL_OVERRIDE',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel, previousStatus, newStatus: post.moderationStatus },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyModerationAction({
        postOwnerId: post.user,
        moderatorId,
        action: 'LABEL_OVERRIDE',
        postId,
        reason: reason.trim(),
        changes: { previousLabel, newLabel, previousStatus, newStatus: post.moderationStatus },
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Flag for Review ──────────────────────────────────

  /**
   * Flag a post for further review.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async flagForReview({ postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.moderationStatus = 'flagged';
    post.verificationStatus = 'REVIEW_REQUIRED';
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.FLAG_FOR_REVIEW,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'flagged',
      previousLabel,
      newLabel: previousLabel,
    });

    // Audit: log moderation action (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'POST_FLAGGED',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'flagged' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    return log;
  }

  // ─── User-Requested Review ────────────────────────────

  /**
   * Create a real moderation-review request from a regular user
   * (the "Request Moderator Review" action in the app).
   *
   * The request:
   *   - stores the requester + reason,
   *   - snapshots the current AI analysis (TrustScore + AI detection),
   *   - moves the post into the moderator queue.
   *
   * The AI result is never overwritten — a human moderator decision is
   * recorded separately on top of it.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.requesterId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async requestUserReview({ postId, requesterId, reason }) {
    if (!postId) {
      throw new ApiError(400, 'Post ID is required');
    }
    if (!requesterId) {
      throw new ApiError(401, 'Requester is not authenticated');
    }
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Snapshot the real AI analysis so the moderator can inspect exactly
    // what the pipeline produced when the request was filed.
    const [trustScore, textAnalysis] = await Promise.all([
      TrustScore.findOne({ post: postId }),
      (async () => {
        try {
          return await TextAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
        } catch {
          try {
            return await TextAnalysis.findOne({ post: postId });
          } catch {
            return null; // snapshot is best-effort, never fatal
          }
        }
      })(),
    ]);

    const analysisSnapshot = {
      trustScore: trustScore
        ? {
            score: trustScore.score,
            label: trustScore.label,
            authenticity: trustScore.authenticity,
            factualVerification: trustScore.factualVerification,
            sourceCredibility: trustScore.sourceCredibility,
            modelConfidence: trustScore.modelConfidence,
            explanation: trustScore.explanation,
            modelVersion: trustScore.modelVersion,
            ruleVersion: trustScore.ruleVersion,
          }
        : null,
      aiDetection: textAnalysis
        ? {
            aiGeneratedProbability: textAnalysis.aiGeneratedProbability,
            misinformationProbability: textAnalysis.misinformationProbability,
            modelVersion: textAnalysis.modelVersion,
            confidence: textAnalysis.confidence,
          }
        : null,
    };

    // Move the post into the moderator queue for review.
    post.moderationStatus = 'flagged';
    post.verificationStatus = 'REVIEW_REQUIRED';
    await post.save();

    // Create audit log entry with the snapshot.
    const log = await ModerationLog.create({
      postId,
      moderatorId: requesterId,
      action: MODERATION_ACTION.REVIEW_REQUESTED,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'flagged',
      previousLabel,
      newLabel: previousLabel,
      metadata: {
        reviewType: 'USER_REQUESTED',
        analysisSnapshot,
      },
    });

    // Audit: log the review request (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'REVIEW_REQUESTED',
        moderator: { _id: requesterId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'flagged' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    return log;
  }

  // ─── Remove Content ───────────────────────────────────

  /**
   * Remove content (soft-delete by setting moderationStatus).
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async removeContent({ postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.moderationStatus = 'rejected';
    post.verificationStatus = 'REJECTED';
    post.isArchived = true;
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.REMOVE_CONTENT,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'rejected',
      previousLabel,
      newLabel: previousLabel,
    });

    // Audit: log moderation action (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'CONTENT_REMOVED',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'rejected' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyModerationAction({
        postOwnerId: post.user,
        moderatorId,
        action: 'CONTENT_REMOVED',
        postId,
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'rejected' },
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Restore Content ──────────────────────────────────

  /**
   * Restore previously removed content.
   *
   * @param {Object} params
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async restoreContent({ postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const previousStatus = post.moderationStatus;
    const previousLabel = post.trustBadge || 'None';

    // Update post
    post.moderationStatus = 'approved';
    post.verificationStatus = 'PUBLISHED';
    post.isArchived = false;
    await post.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId,
      moderatorId,
      action: MODERATION_ACTION.RESTORE_CONTENT,
      reason: reason.trim(),
      previousStatus,
      newStatus: 'approved',
      previousLabel,
      newLabel: previousLabel,
    });

    // Audit: log moderation action (non-critical)
    try {
      await auditService.logModerationEvent({
        eventType: 'CONTENT_RESTORED',
        moderator: { _id: moderatorId, username: null, role: null },
        post: { _id: postId, trustBadge: previousLabel, moderationStatus: previousStatus },
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'approved' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyModerationAction({
        postOwnerId: post.user,
        moderatorId,
        action: 'CONTENT_RESTORED',
        postId,
        reason: reason.trim(),
        changes: { previousLabel, newLabel: previousLabel, previousStatus, newStatus: 'approved' },
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Resolve Report ───────────────────────────────────

  /**
   * Resolve a community report and create an audit log.
   *
   * @param {Object} params
   * @param {string} params.reportId
   * @param {string} params.postId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async resolveReport({ reportId, postId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const report = await Report.findById(reportId);
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Update report status
    report.status = REPORT_STATUS.RESOLVED;
    report.resolvedBy = moderatorId;
    report.resolvedAt = new Date();
    report.resolutionNote = reason.trim();
    await report.save();

    // Get post state for audit log
    const post = postId ? await Post.findById(postId) : null;
    const previousStatus = post ? post.moderationStatus : null;
    const previousLabel = post ? (post.trustBadge || 'None') : null;

    // Create audit log
    const log = await ModerationLog.create({
      postId: postId || report.targetId,
      moderatorId,
      action: MODERATION_ACTION.RESOLVE_REPORT,
      reason: reason.trim(),
      previousStatus,
      newStatus: previousStatus,
      previousLabel,
      newLabel: previousLabel,
      reportId,
    });

    // Audit: log report resolution (non-critical)
    try {
      await auditService.logReportEvent({
        eventType: 'REPORT_RESOLVED',
        actor: { _id: moderatorId, username: null, role: null },
        report: { _id: reportId, targetType: report.targetType, targetId: report.targetId, reason: report.reason, status: 'RESOLVED' },
        reason: reason.trim(),
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify report reporter (non-critical)
    try {
      await notificationService.notifyReportResolution({
        reporterId: report.reporter,
        moderatorId,
        reportId,
        status: 'RESOLVED',
        reason: reason.trim(),
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Dismiss Report ───────────────────────────────────

  /**
   * Dismiss a community report (no violation found).
   *
   * @param {Object} params
   * @param {string} params.reportId
   * @param {string} params.moderatorId
   * @param {string} params.reason
   * @returns {Promise<Object>} Audit log entry
   */
  async dismissReport({ reportId, moderatorId, reason }) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Moderation reason is required');
    }

    const report = await Report.findById(reportId);
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Update report status
    report.status = REPORT_STATUS.DISMISSED;
    report.resolvedBy = moderatorId;
    report.resolvedAt = new Date();
    report.resolutionNote = reason.trim();
    await report.save();

    // Create audit log
    const log = await ModerationLog.create({
      postId: report.targetId,
      moderatorId,
      action: MODERATION_ACTION.DISMISS_REPORT,
      reason: reason.trim(),
      previousStatus: null,
      newStatus: null,
      previousLabel: null,
      newLabel: null,
      reportId,
    });

    // Audit: log report dismissal (non-critical)
    try {
      await auditService.logReportEvent({
        eventType: 'REPORT_DISMISSED',
        actor: { _id: moderatorId, username: null, role: null },
        report: { _id: reportId, targetType: report.targetType, targetId: report.targetId, reason: report.reason, status: 'DISMISSED' },
        reason: reason.trim(),
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify report reporter (non-critical)
    try {
      await notificationService.notifyReportResolution({
        reporterId: report.reporter,
        moderatorId,
        reportId,
        status: 'DISMISSED',
        reason: reason.trim(),
      });
    } catch (_) { /* notification is non-critical */ }

    return log;
  }

  // ─── Get Audit Logs ───────────────────────────────────

  /**
   * Get moderation audit logs for a post.
   *
   * @param {string} postId
   * @returns {Promise<Array>}
   */
  async getLogsForPost(postId) {
    return ModerationLog.find({ postId })
      .populate('moderatorId', 'name username avatar')
      .sort({ createdAt: -1 });
  }

  /**
   * Get all moderation logs with filtering.
   *
   * @param {Object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @param {string} [opts.action]
   * @param {string} [opts.moderatorId]
   * @returns {Promise<Object>} Logs + pagination
   */
  async getLogs({ page = 1, limit = 20, action, moderatorId } = {}) {
    const skip = (page - 1) * limit;

    const filter = {};
    if (action) filter.action = action;
    if (moderatorId) filter.moderatorId = moderatorId;

    const [logs, total] = await Promise.all([
      ModerationLog.find(filter)
        .populate('moderatorId', 'name username avatar')
        .populate('postId', 'text trustBadge moderationStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ModerationLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Moderation Stats ─────────────────────────────────

  /**
   * Get moderation dashboard statistics.
   *
   * @returns {Promise<Object>}
   */
  async getStats() {
    const [actionCounts, flaggedCount, totalLogs] = await Promise.all([
      ModerationLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
      Post.countDocuments({
        $or: [
          { verificationStatus: 'REVIEW_REQUIRED' },
          { moderationStatus: 'under_review' },
          { moderationStatus: 'flagged' },
        ],
      }),
      ModerationLog.countDocuments(),
    ]);

    const byAction = {};
    for (const entry of actionCounts) {
      byAction[entry._id] = entry.count;
    }

    return {
      byAction,
      flaggedCount,
      totalLogs,
    };
  }
}

module.exports = new ModerationService();
