/**
 * Audit Controller (Module 21 — V1)
 * ===================================
 * Admin-only endpoints for querying audit logs.
 *
 * All endpoints require ADMIN role.
 */

const auditService = require('../../services/audit.service');

/**
 * GET /api/v1/audit/logs
 * List audit logs with filtering and pagination.
 * Query: ?page=1&limit=20&category=AUTH&eventType=LOGIN_FAILURE&outcome=FAILURE
 */
exports.getLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { category, eventType, outcome, actorId, targetId, startDate, endDate } = req.query;

    const result = await auditService.getLogs({
      page,
      limit,
      category,
      eventType,
      outcome,
      actorId,
      targetId,
      startDate,
      endDate,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/audit/logs/user/:userId
 * Get audit logs for a specific user.
 * Query: ?page=1&limit=20&category=AUTH
 */
exports.getLogsForUser = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { category } = req.query;

    const result = await auditService.getLogsForUser(req.params.userId, {
      page,
      limit,
      category,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/audit/logs/post/:postId
 * Get audit logs for a specific post.
 * Query: ?page=1&limit=20
 */
exports.getLogsForPost = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await auditService.getLogsForPost(req.params.postId, {
      page,
      limit,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/audit/security-summary
 * Get security event summary for the admin dashboard.
 * Query: ?days=7
 */
exports.getSecuritySummary = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 7;

    const result = await auditService.getSecuritySummary({ days });

    res.status(200).json({ success: true, stats: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/audit/event-types
 * List valid event categories, types, and outcomes (for UI).
 */
exports.getEventTypes = async (_req, res) => {
  res.status(200).json({
    success: true,
    ...auditService.getEventTypes(),
  });
};
