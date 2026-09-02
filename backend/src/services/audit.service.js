/**
 * Audit Service (Module 21)
 * =========================
 * System-wide audit logging service for security-sensitive operations.
 *
 * Privacy principles:
 *   - Never stores passwords, tokens, API keys, or raw PII
 *   - Sanitizes sensitive fields before logging
 *   - Masks user identifiers (uses MongoDB ObjectId, never emails)
 *   - Structured event format for consistent querying
 *   - All audit records are immutable once written
 *
 * Usage:
 *   const auditService = require('./audit.service');
 *   await auditService.logAuthEvent({ ... });
 *   await auditService.logModerationEvent({ ... });
 */

const crypto = require('crypto');
const AuditLog = require('../models/audit-log.model');
const {
  AUDIT_EVENT_CATEGORY,
  AUDIT_EVENT_TYPE,
  AUDIT_OUTCOME,
} = require('../models/audit-log.model');

class AuditService {
  // ─── Core Logging Methods ──────────────────────────────────────────

  /**
   * Create an audit log entry.
   *
   * @param {Object} params
   * @param {string} params.eventType    — One of AUDIT_EVENT_TYPE
   * @param {string} params.category     — One of AUDIT_EVENT_CATEGORY
   * @param {string} params.outcome      — SUCCESS, FAILURE, or PARTIAL
   * @param {string} params.description  — Human-readable description
   * @param {Object} [params.actor]      — { id, type } (user who performed action)
   * @param {Object} [params.target]     — { type, id } (resource acted upon)
   * @param {Object} [params.metadata]   — Additional structured data
   * @param {Object} [params.request]    — { ip, userAgent, requestId }
   * @param {Object} [params.error]      — { code, message } for failures
   * @param {string} [params.correlationId] — For correlating related events
   * @returns {Promise<Object>} The created audit log
   */
  async log({
    eventType,
    category,
    outcome,
    description,
    actor = null,
    target = null,
    metadata = null,
    request = null,
    error = null,
    correlationId = null,
  }) {
    // Validate required fields
    if (!eventType || !AUDIT_EVENT_TYPE[eventType]) {
      throw new Error(`Invalid eventType: ${eventType}`);
    }
    if (!category || !AUDIT_EVENT_CATEGORY[category]) {
      throw new Error(`Invalid category: ${category}`);
    }
    if (!outcome || !AUDIT_OUTCOME[outcome]) {
      throw new Error(`Invalid outcome: ${outcome}`);
    }
    if (!description || typeof description !== 'string') {
      throw new Error('Description is required and must be a string');
    }

    // Build the audit log document
    const logData = {
      eventType,
      category,
      outcome,
      description: description.substring(0, 2000).trim(),
      actorId: actor?.id || null,
      actorType: actor?.type || 'SYSTEM',
      targetType: target?.type || null,
      targetId: target?.id || null,
      metadata: metadata ? this._sanitizeMetadata(metadata) : null,
      ip: request?.ip ? this._anonymizeIp(request.ip) : null,
      userAgent: request?.userAgent
        ? request.userAgent.substring(0, 500)
        : null,
      requestId: request?.requestId || null,
      errorCode: error?.code || null,
      errorMessage: error?.message
        ? error.message.substring(0, 1000)
        : null,
      correlationId,
    };

    // Compute integrity checksum (before save)
    logData.checksum = this._computeChecksum(logData);

    const log = await AuditLog.create(logData);

    return log;
  }

  // ─── Convenience Methods by Category ───────────────────────────────

  /**
   * Log an authentication event (login, logout, failures).
   *
   * @param {Object} params
   * @param {string} params.eventType   — LOGIN_SUCCESS, LOGIN_FAILURE, etc.
   * @param {Object} [params.user]      — { _id, username } (never email/password)
   * @param {string} params.outcome     — SUCCESS or FAILURE
   * @param {Object} [params.request]   — { ip, userAgent }
   * @param {Object} [params.error]     — { code, message } for failures
   * @param {string} [params.reason]    — Failure reason
   */
  async logAuthEvent({ eventType, user, outcome, request, error, reason }) {
    const actorType = user ? 'USER' : 'SYSTEM';
    const description = this._buildAuthDescription(eventType, user, outcome, reason);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.AUTH,
      outcome,
      description,
      actor: user ? { id: user._id, type: actorType } : null,
      target: user ? { type: 'User', id: user._id } : null,
      metadata: {
        username: user?.username || null,
        reason: reason || null,
      },
      request: request || null,
      error: error || null,
    });
  }

  /**
   * Log a moderation event (approve, reject, label override, etc.).
   *
   * @param {Object} params
   * @param {string} params.eventType   — POST_APPROVED, POST_REJECTED, etc.
   * @param {Object} params.moderator   — { _id, username, role }
   * @param {Object} params.post        — { _id, trustBadge, moderationStatus }
   * @param {string} params.reason      — Moderation reason
   * @param {Object} [params.changes]   — { previousLabel, newLabel, previousStatus, newStatus }
   * @param {string} [params.correlationId]
   */
  async logModerationEvent({ eventType, moderator, post, reason, changes, correlationId }) {
    const description = this._buildModerationDescription(eventType, post, reason, changes);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.MODERATION,
      outcome: AUDIT_OUTCOME.SUCCESS,
      description,
      actor: {
        id: moderator._id,
        type: moderator.role === 'ADMIN' ? 'ADMIN' : 'MODERATOR',
      },
      target: { type: 'Post', id: post._id },
      metadata: {
        reason: reason?.trim() || null,
        previousLabel: changes?.previousLabel || null,
        newLabel: changes?.newLabel || null,
        previousStatus: changes?.previousStatus || null,
        newStatus: changes?.newStatus || null,
        postTrustBadge: post.trustBadge || null,
      },
      correlationId,
    });
  }

  /**
   * Log a report event (create, resolve, dismiss).
   *
   * @param {Object} params
   * @param {string} params.eventType   — REPORT_CREATED, REPORT_RESOLVED, etc.
   * @param {Object} [params.actor]     — { _id, username, role }
   * @param {Object} params.report      — { _id, targetType, targetId, reason, status }
   * @param {string} [params.reason]    — Resolution/dismissal reason
   */
  async logReportEvent({ eventType, actor, report, reason }) {
    const description = this._buildReportDescription(eventType, report, reason);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.REPORT,
      outcome: AUDIT_OUTCOME.SUCCESS,
      description,
      actor: actor
        ? {
            id: actor._id,
            type: actor.role === 'ADMIN'
              ? 'ADMIN'
              : actor.role === 'MODERATOR'
                ? 'MODERATOR'
                : 'USER',
          }
        : null,
      target: { type: 'Report', id: report._id },
      metadata: {
        reportReason: report.reason || null,
        targetType: report.targetType || null,
        targetId: report.targetId || null,
        status: report.status || null,
        resolutionReason: reason || null,
      },
    });
  }

  /**
   * Log an account change event (profile update, role change, etc.).
   *
   * @param {Object} params
   * @param {string} params.eventType   — PROFILE_UPDATED, ROLE_CHANGED, etc.
   * @param {Object} params.actor       — { _id, role } (who made the change)
   * @param {Object} params.target      — { _id, username } (affected user)
   * @param {Object} [params.changes]   — Changed fields (sanitized, no sensitive data)
   * @param {Object} [params.request]   — { ip, userAgent }
   */
  async logAccountEvent({ eventType, actor, target, changes, request }) {
    const description = this._buildAccountDescription(eventType, target, changes);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.ACCOUNT,
      outcome: AUDIT_OUTCOME.SUCCESS,
      description,
      actor: {
        id: actor._id,
        type: actor.role === 'ADMIN' ? 'ADMIN' : actor.role === 'MODERATOR' ? 'MODERATOR' : 'USER',
      },
      target: { type: 'User', id: target._id },
      metadata: {
        targetUsername: target.username || null,
        changedFields: changes || null,
      },
      request: request || null,
    });
  }

  /**
   * Log an admin action (role change, user disable/enable).
   *
   * @param {Object} params
   * @param {string} params.eventType   — USER_ROLE_CHANGED, USER_DISABLED, etc.
   * @param {Object} params.admin       — { _id, username }
   * @param {Object} params.target      — { _id, username }
   * @param {Object} [params.details]   — Action-specific details
   * @param {Object} [params.request]   — { ip, userAgent }
   */
  async logAdminEvent({ eventType, admin, target, details, request }) {
    const description = this._buildAdminDescription(eventType, target, details);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.ADMIN,
      outcome: AUDIT_OUTCOME.SUCCESS,
      description,
      actor: { id: admin._id, type: 'ADMIN' },
      target: { type: 'User', id: target._id },
      metadata: {
        targetUsername: target.username || null,
        details: details || null,
      },
      request: request || null,
    });
  }

  /**
   * Log an AI processing event (pipeline failures, model errors).
   *
   * @param {Object} params
   * @param {string} params.eventType   — PIPELINE_FAILED, AI_ANALYSIS_FAILED, etc.
   * @param {Object} [params.target]    — { postId, pipelineId }
   * @param {Object} params.error       — { code, message }
   * @param {Object} [params.metadata]  — Pipeline-specific details
   */
  async logAIProcessingEvent({ eventType, target, error, metadata }) {
    const description = this._buildAIProcessingDescription(eventType, target, error);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.AI_PROCESSING,
      outcome: AUDIT_OUTCOME.FAILURE,
      description,
      actor: { id: null, type: 'SYSTEM' },
      target: target?.postId
        ? { type: 'Post', id: target.postId }
        : null,
      metadata: {
        pipelineId: target?.pipelineId || null,
        stage: metadata?.stage || null,
        retryCount: metadata?.retryCount || 0,
        ...metadata,
      },
      error: error || null,
    });
  }

  /**
   * Log a verification event (age verification, fact-check, trust score).
   *
   * @param {Object} params
   * @param {string} params.eventType   — AGE_VERIFICATION_SUCCESS, etc.
   * @param {Object} [params.actor]     — { _id } (if user-initiated)
   * @param {Object} [params.target]    — { userId, verificationId }
   * @param {Object} [params.metadata]  — Verification-specific details
   * @param {Object} [params.error]     — { code, message } for failures
   */
  async logVerificationEvent({ eventType, actor, target, metadata, error }) {
    const description = this._buildVerificationDescription(eventType, target, metadata);

    return this.log({
      eventType,
      category: AUDIT_EVENT_CATEGORY.VERIFICATION,
      outcome: error ? AUDIT_OUTCOME.FAILURE : AUDIT_OUTCOME.SUCCESS,
      description,
      actor: actor ? { id: actor._id, type: 'USER' } : { id: null, type: 'SYSTEM' },
      target: target?.userId
        ? { type: 'User', id: target.userId }
        : null,
      metadata: {
        verificationId: target?.verificationId || null,
        provider: metadata?.provider || null,
        ageCategory: metadata?.ageCategory || null,
        failureReason: metadata?.failureReason || null,
        ...metadata,
      },
      error: error || null,
    });
  }

  // ─── Query Methods ─────────────────────────────────────────────────

  /**
   * Get audit logs with filtering and pagination.
   *
   * @param {Object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @param {string} [opts.category]     — Filter by category
   * @param {string} [opts.eventType]    — Filter by event type
   * @param {string} [opts.outcome]      — Filter by outcome
   * @param {string} [opts.actorId]      — Filter by actor
   * @param {string} [opts.targetId]     — Filter by target
   * @param {Date} [opts.startDate]      — Filter from date
   * @param {Date} [opts.endDate]        — Filter to date
   * @returns {Promise<Object>} Audit logs + pagination
   */
  async getLogs({
    page = 1,
    limit = 20,
    category,
    eventType,
    outcome,
    actorId,
    targetId,
    startDate,
    endDate,
  } = {}) {
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (category) filter.category = category;
    if (eventType) filter.eventType = eventType;
    if (outcome) filter.outcome = outcome;
    if (actorId) filter.actorId = actorId;
    if (targetId) filter.targetId = targetId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name username role')
        .populate('targetId', 'name username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
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

  /**
   * Get audit logs for a specific user (as actor or target).
   *
   * @param {string} userId
   * @param {Object} opts — { page, limit, category }
   * @returns {Promise<Object>} Audit logs + pagination
   */
  async getLogsForUser(userId, { page = 1, limit = 20, category } = {}) {
    const skip = (page - 1) * limit;

    const filter = {
      $or: [{ actorId: userId }, { targetId: userId }],
    };
    if (category) filter.category = category;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name username role')
        .populate('targetId', 'name username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
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

  /**
   * Get audit logs for a specific post.
   *
   * @param {string} postId
   * @param {Object} opts — { page, limit }
   * @returns {Promise<Object>}
   */
  async getLogsForPost(postId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    const filter = { targetId: postId };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name username role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
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

  /**
   * Get security event summary (admin dashboard).
   *
   * @param {Object} opts — { days (default 7) }
   * @returns {Promise<Object>}
   */
  async getSecuritySummary({ days = 7 } = {}) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      categoryCounts,
      outcomeCounts,
      authFailures,
      recentFailures,
      topActors,
    ] = await Promise.all([
      // Counts by category
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      // Counts by outcome
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
      // Auth failures in period
      AuditLog.countDocuments({
        category: 'AUTH',
        outcome: 'FAILURE',
        createdAt: { $gte: startDate },
      }),
      // Recent failures (last 24h)
      AuditLog.countDocuments({
        outcome: 'FAILURE',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      // Top actors by event count
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: startDate }, actorId: { $ne: null } } },
        { $group: { _id: '$actorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const byCategory = {};
    for (const entry of categoryCounts) {
      byCategory[entry._id] = entry.count;
    }

    const byOutcome = {};
    for (const entry of outcomeCounts) {
      byOutcome[entry._id] = entry.count;
    }

    return {
      period: `${days} days`,
      byCategory,
      byOutcome,
      authFailures,
      recentFailures,
      topActors,
      totalEvents: Object.values(byOutcome).reduce((sum, c) => sum + c, 0),
    };
  }

  /**
   * Get audit log event types (for UI dropdowns).
   */
  getEventTypes() {
    return {
      categories: Object.values(AUDIT_EVENT_CATEGORY),
      eventTypes: Object.values(AUDIT_EVENT_TYPE),
      outcomes: Object.values(AUDIT_OUTCOME),
    };
  }

  // ─── Privacy / Sanitization Helpers ────────────────────────────────

  /**
   * Sanitize metadata to remove sensitive information.
   * Never log: passwords, tokens, API keys, DOB, government IDs, etc.
   *
   * @param {Object} metadata
   * @returns {Object} Sanitized metadata
   */
  _sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return metadata;

    const sanitized = { ...metadata };

    // Fields to always remove
    const forbidden = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'dob',
      'dateOfBirth',
      'governmentId',
      'ssn',
      'creditCard',
      'bankAccount',
      'rawMedia',
      'privateMediaUrl',
    ];

    for (const field of forbidden) {
      if (sanitized[field] !== undefined) {
        delete sanitized[field];
      }
    }

    // Mask any string values that look like tokens (long hex/base64)
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string' && value.length > 64) {
        sanitized[key] = value.substring(0, 8) + '...[redacted]';
      }
    }

    return sanitized;
  }

  /**
   * Anonymize IP address for privacy.
   * In production, truncate to /24 for IPv4 or /64 for IPv6.
   * In development, keep full IP for debugging.
   */
  _anonymizeIp(ip) {
    if (!ip) return null;

    // If IPv6 mapped IPv4, extract the IPv4 part
    const v4Mapped = ip.replace(/^::ffff:/, '');
    if (v4Mapped !== ip) return this._anonymizeIp(v4Mapped);

    // IPv4: zero out last octet
    if (v4Mapped.includes('.')) {
      const parts = v4Mapped.split('.');
      if (parts.length === 4) {
        parts[3] = '0';
        return parts.join('.');
      }
    }

    // IPv6: zero out last 64 bits
    if (v4Mapped.includes(':')) {
      const parts = v4Mapped.split(':');
      if (parts.length >= 4) {
        for (let i = Math.floor(parts.length / 2); i < parts.length; i++) {
          parts[i] = '0';
        }
        return parts.join(':');
      }
    }

    return ip;
  }

  /**
   * Compute a simple checksum for audit log integrity.
   * This is not cryptographic — it's a lightweight tamper-detection mechanism.
   */
  _computeChecksum(data) {
    const content = JSON.stringify({
      eventType: data.eventType,
      category: data.category,
      outcome: data.outcome,
      actorId: data.actorId,
      targetId: data.targetId,
      description: data.description,
      createdAt: data.createdAt || new Date().toISOString(),
    });

    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // ─── Description Builders ──────────────────────────────────────────

  _buildAuthDescription(eventType, user, outcome, reason) {
    const username = user?.username || 'unknown';
    switch (eventType) {
      case 'LOGIN_SUCCESS':
        return `User "${username}" logged in successfully`;
      case 'LOGIN_FAILURE':
        return `Login attempt failed for "${username}"${reason ? `: ${reason}` : ''}`;
      case 'REGISTER_SUCCESS':
        return `User "${username}" registered successfully`;
      case 'LOGOUT':
        return `User "${username}" logged out`;
      case 'TOKEN_REFRESH':
        return `Token refreshed for user "${username}"`;
      case 'TOKEN_REVOKED':
        return `Token revoked for user "${username}"`;
      case 'ACCOUNT_LOCKED':
        return `Account locked for user "${username}"`;
      default:
        return `Auth event "${eventType}" for "${username}"`;
    }
  }

  _buildModerationDescription(eventType, post, reason, changes) {
    const postId = post?._id || 'unknown';
    const reasonText = reason ? ` (reason: "${reason.substring(0, 100)}")` : '';

    switch (eventType) {
      case 'POST_APPROVED':
        return `Post ${postId} approved${reasonText}`;
      case 'POST_REJECTED':
        return `Post ${postId} rejected${reasonText}`;
      case 'POST_FLAGGED':
        return `Post ${postId} flagged for review${reasonText}`;
      case 'LABEL_OVERRIDE':
        return `Trust label overridden for post ${postId} from "${changes?.previousLabel}" to "${changes?.newLabel}"${reasonText}`;
      case 'CONTENT_REMOVED':
        return `Content removed for post ${postId}${reasonText}`;
      case 'CONTENT_RESTORED':
        return `Content restored for post ${postId}${reasonText}`;
      default:
        return `Moderation event "${eventType}" on post ${postId}`;
    }
  }

  _buildReportDescription(eventType, report, reason) {
    const reportId = report?._id || 'unknown';
    const reasonText = reason ? ` (reason: "${reason.substring(0, 100)}")` : '';

    switch (eventType) {
      case 'REPORT_CREATED':
        return `Report ${reportId} created against ${report?.targetType || 'unknown'} target`;
      case 'REPORT_RESOLVED':
        return `Report ${reportId} resolved${reasonText}`;
      case 'REPORT_DISMISSED':
        return `Report ${reportId} dismissed${reasonText}`;
      case 'REPORT_STATUS_CHANGED':
        return `Report ${reportId} status changed to "${report?.status || 'unknown'}"`;
      default:
        return `Report event "${eventType}" on report ${reportId}`;
    }
  }

  _buildAccountDescription(eventType, target, changes) {
    const username = target?.username || 'unknown';

    switch (eventType) {
      case 'PROFILE_UPDATED':
        return `Profile updated for user "${username}"`;
      case 'AVATAR_CHANGED':
        return `Avatar changed for user "${username}"`;
      case 'USERNAME_CHANGED':
        return `Username changed for user "${username}"`;
      case 'ACCOUNT_DISABLED':
        return `Account disabled for user "${username}"`;
      case 'ACCOUNT_ENABLED':
        return `Account enabled for user "${username}"`;
      case 'ROLE_CHANGED':
        return `Role changed for user "${username}" to "${changes?.newRole || 'unknown'}"`;
      case 'EMAIL_CHANGED':
        return `Email changed for user "${username}"`;
      case 'PRIVACY_TOGGLED':
        return `Privacy setting toggled for user "${username}"`;
      default:
        return `Account event "${eventType}" for user "${username}"`;
    }
  }

  _buildAdminDescription(eventType, target, details) {
    const username = target?.username || 'unknown';

    switch (eventType) {
      case 'USER_ROLE_CHANGED':
        return `Admin changed role for user "${username}" to "${details?.newRole || 'unknown'}"`;
      case 'USER_DISABLED':
        return `Admin disabled user "${username}"`;
      case 'USER_ENABLED':
        return `Admin enabled user "${username}"`;
      case 'SYSTEM_CONFIG_CHANGED':
        return `System configuration changed`;
      default:
        return `Admin event "${eventType}" targeting "${username}"`;
    }
  }

  _buildAIProcessingDescription(eventType, target, error) {
    const postId = target?.postId || 'unknown';

    switch (eventType) {
      case 'PIPELINE_STARTED':
        return `Verification pipeline started for post ${postId}`;
      case 'PIPELINE_COMPLETED':
        return `Verification pipeline completed for post ${postId}`;
      case 'PIPELINE_FAILED':
        return `Verification pipeline failed for post ${postId}: ${error?.message || 'unknown error'}`;
      case 'AI_ANALYSIS_FAILED':
        return `AI analysis failed for post ${postId}: ${error?.message || 'unknown error'}`;
      case 'TRUST_SCORE_FAILED':
        return `Trust score computation failed for post ${postId}: ${error?.message || 'unknown error'}`;
      case 'FACT_CHECK_FAILED':
        return `Fact check failed for post ${postId}: ${error?.message || 'unknown error'}`;
      case 'MODEL_ERROR':
        return `AI model error for post ${postId}: ${error?.message || 'unknown error'}`;
      default:
        return `AI processing event "${eventType}" for post ${postId}`;
    }
  }

  _buildVerificationDescription(eventType, target, metadata) {
    const userId = target?.userId || 'unknown';

    switch (eventType) {
      case 'AGE_VERIFICATION_INITIATED':
        return `Age verification initiated for user ${userId}`;
      case 'AGE_VERIFICATION_SUCCESS':
        return `Age verification succeeded for user ${userId} (category: ${metadata?.ageCategory || 'unknown'})`;
      case 'AGE_VERIFICATION_FAILED':
        return `Age verification failed for user ${userId}: ${metadata?.failureReason || 'unknown reason'}`;
      case 'AGE_VERIFICATION_EXPIRED':
        return `Age verification expired for user ${userId}`;
      case 'FACT_CHECK_INITIATED':
        return `Fact check initiated`;
      case 'TRUST_SCORE_COMPUTED':
        return `Trust score computed (score: ${metadata?.score || 'unknown'}, label: ${metadata?.label || 'unknown'})`;
      default:
        return `Verification event "${eventType}" for user ${userId}`;
    }
  }
}

module.exports = new AuditService();
