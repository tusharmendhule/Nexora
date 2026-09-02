const Report = require('../models/report.model');
const { REPORT_REASON, REPORT_STATUS } = require('../models/report.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const User = require('../models/user.model');
const { ApiError } = require('../middleware/error.middleware');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

class ReportService {
  // ─── Create ────────────────────────────────────────

  /**
   * Create a new community report.
   *
   * Anti-abuse protections:
   *  1. Authentication required (handled by route middleware)
   *  2. Duplicate report prevention (unique compound index)
   *  3. Rate limiting (handled by route middleware)
   *  4. Users cannot report their own content
   *  5. Target must exist
   *
   * @param {Object} params
   * @param {string} params.reporterId  — The authenticated user's _id
   * @param {string} params.targetType  — 'Post', 'Comment', or 'User'
   * @param {string} params.targetId    — ObjectId of the target
   * @param {string} params.reason      — One of REPORT_REASON values
   * @param {string} [params.description] — Optional free-text description
   * @returns {Promise<Object>} The created report
   */
  async create({ reporterId, targetType, targetId, reason, description = '' }) {
    // ── Validate reason ────────────────────────────────
    if (!Object.values(REPORT_REASON).includes(reason)) {
      throw new ApiError(
        400,
        `Invalid reason. Must be one of: ${Object.values(REPORT_REASON).join(', ')}`
      );
    }

    // ── Validate targetType ─────────────────────────────
    if (!['Post', 'Comment', 'User'].includes(targetType)) {
      throw new ApiError(400, 'Invalid targetType. Must be Post, Comment, or User');
    }

    // ── Verify target exists ────────────────────────────
    let targetModel;
    switch (targetType) {
      case 'Post':
        targetModel = Post;
        break;
      case 'Comment':
        targetModel = Comment;
        break;
      case 'User':
        targetModel = User;
        break;
    }

    const target = await targetModel.findById(targetId);
    if (!target) {
      throw new ApiError(404, `${targetType} not found`);
    }

    // ── Self-report prevention ──────────────────────────
    const targetOwnerId = targetType === 'User'
      ? target._id.toString()
      : (target.user || target.reporter || target.author || '').toString();

    if (targetOwnerId === reporterId.toString()) {
      throw new ApiError(400, 'You cannot report your own content');
    }

    // ── Create report (duplicate handled by unique index) ──
    try {
      const report = await Report.create({
        reporter: reporterId,
        targetType,
        targetId,
        reason,
        description: description.trim().substring(0, 1000),
        status: REPORT_STATUS.OPEN,
      });

      // Audit: log report creation (non-critical)
      try {
        await auditService.logReportEvent({
          eventType: 'REPORT_CREATED',
          actor: { _id: reporterId, username: null, role: null },
          report: { _id: report._id, targetType, targetId, reason, status: REPORT_STATUS.OPEN },
        });
      } catch (_) { /* audit logging is non-critical */ }

      return report.populate('reporter', 'name username avatar');
    } catch (err) {
      // Mongoose duplicate key error (code 11000) = duplicate report
      if (err.code === 11000) {
        throw new ApiError(409, 'You have already reported this content');
      }
      throw err;
    }
  }

  // ─── Read (Admin/Moderator) ────────────────────────

  /**
   * Get all reports with filtering and pagination.
   * Used by the moderation dashboard.
   *
   * @param {Object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @param {string} [opts.status] — Filter by status
   * @param {string} [opts.reason] — Filter by reason
   * @param {string} [opts.targetType] — Filter by target type
   * @returns {Promise<Object>} Reports + pagination metadata
   */
  async getAll({ page = 1, limit = 20, status, reason, targetType } = {}) {
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status) {
      if (!Object.values(REPORT_STATUS).includes(status)) {
        throw new ApiError(400, `Invalid status filter: ${status}`);
      }
      filter.status = status;
    }
    if (reason) {
      if (!Object.values(REPORT_REASON).includes(reason)) {
        throw new ApiError(400, `Invalid reason filter: ${reason}`);
      }
      filter.reason = reason;
    }
    if (targetType && ['Post', 'Comment', 'User'].includes(targetType)) {
      filter.targetType = targetType;
    }

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reporter', 'name username avatar')
        .populate('targetId')
        .populate('resolvedBy', 'name username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get reports for a specific target.
   *
   * @param {string} targetType — 'Post', 'Comment', or 'User'
   * @param {string} targetId   — The target's _id
   * @returns {Promise<Array>}  Reports for this target
   */
  async getByTarget(targetType, targetId) {
    return Report.find({ targetType, targetId })
      .populate('reporter', 'name username avatar')
      .populate('resolvedBy', 'name username')
      .sort({ createdAt: -1 });
  }

  /**
   * Get all reports by a specific reporter.
   *
   * @param {string} reporterId
   * @param {Object} opts — { page, limit }
   * @returns {Promise<Object>} Reports + pagination
   */
  async getByReporter(reporterId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find({ reporter: reporterId })
        .populate('targetId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments({ reporter: reporterId }),
    ]);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single report by ID.
   *
   * @param {string} reportId
   * @returns {Promise<Object|null>}
   */
  async getById(reportId) {
    return Report.findById(reportId)
      .populate('reporter', 'name username avatar')
      .populate('targetId')
      .populate('resolvedBy', 'name username');
  }

  // ─── Update (Moderation) ───────────────────────────

  /**
   * Update a report's status. Only MODERATOR or ADMIN can do this.
   *
   * @param {Object} params
   * @param {string} params.reportId
   * @param {string} params.status    — New status
   * @param {string} params.moderatorId — Who is updating
   * @param {string} [params.resolutionNote]
   * @returns {Promise<Object>} Updated report
   */
  async updateStatus({ reportId, status, moderatorId, resolutionNote = null }) {
    if (!Object.values(REPORT_STATUS).includes(status)) {
      throw new ApiError(
        400,
        `Invalid status. Must be one of: ${Object.values(REPORT_STATUS).join(', ')}`
      );
    }

    const report = await Report.findById(reportId);
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    report.status = status;
    report.resolvedBy = moderatorId;
    report.resolutionNote = resolutionNote;

    // Set resolvedAt when moving to RESOLVED or DISMISSED
    if (status === REPORT_STATUS.RESOLVED || status === REPORT_STATUS.DISMISSED) {
      report.resolvedAt = new Date();

      // Audit: log report status change to resolved/dismissed (non-critical)
      try {
        await auditService.logReportEvent({
          eventType: status === REPORT_STATUS.RESOLVED ? 'REPORT_RESOLVED' : 'REPORT_DISMISSED',
          actor: { _id: moderatorId, username: null, role: null },
          report: { _id: reportId, targetType: report.targetType, targetId: report.targetId, reason: report.reason, status },
          reason: resolutionNote || null,
        });
      } catch (_) { /* audit logging is non-critical */ }

      // Notify report reporter (non-critical)
      try {
        await notificationService.notifyReportResolution({
          reporterId: report.reporter,
          moderatorId,
          reportId,
          status,
          reason: resolutionNote || null,
        });
      } catch (_) { /* notification is non-critical */ }
    } else {
      // Clear resolution info if moving back to OPEN/UNDER_REVIEW
      report.resolvedAt = null;
      report.resolvedBy = null;
      report.resolutionNote = null;
    }

    await report.save();
    return report.populate('reporter resolvedBy', 'name username avatar');
  }

  // ─── Statistics (Moderation Dashboard) ──────────────

  /**
   * Get report statistics for the moderation dashboard.
   *
   * @returns {Promise<Object>} Aggregate counts
   */
  async getStats() {
    const [statusCounts, reasonCounts, recentCount] = await Promise.all([
      // Counts by status
      Report.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Counts by reason (last 30 days)
      Report.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Reports in last 24 hours
      Report.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    const byStatus = {};
    for (const entry of statusCounts) {
      byStatus[entry._id] = entry.count;
    }

    const byReason = {};
    for (const entry of reasonCounts) {
      byReason[entry._id] = entry.count;
    }

    return {
      byStatus,
      byReason,
      recentCount,
      total: Object.values(byStatus).reduce((sum, c) => sum + c, 0),
    };
  }
}

module.exports = new ReportService();
