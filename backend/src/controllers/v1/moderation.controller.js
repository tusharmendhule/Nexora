/**
 * Moderation Controller (Module 20 — V1)
 *
 * All endpoints require MODERATOR or ADMIN role.
 * Label override requires ADMIN role (enforced at route level).
 */

const moderationService = require('../../services/moderation.service');

// ─── View ────────────────────────────────────────────────

/**
 * GET /api/v1/moderation/posts
 * List posts needing moderation review.
 */
exports.getFlaggedPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { status } = req.query;

    const result = await moderationService.getFlaggedPosts({ page, limit, status });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/moderation/posts/:id
 * Get full inspection context for a post.
 */
exports.inspectPost = async (req, res, next) => {
  try {
    const context = await moderationService.getPostInspection(req.params.id);
    res.status(200).json({ success: true, ...context });
  } catch (error) {
    next(error);
  }
};

// ─── Actions ─────────────────────────────────────────────

/**
 * POST /api/v1/moderation/posts/:id/approve
 * Approve a post.
 */
exports.approvePost = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.approvePost({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Post approved', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/posts/:id/reject
 * Reject a post.
 */
exports.rejectPost = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.rejectPost({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Post rejected', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/posts/:id/override-label
 * Override trust label. ADMIN only.
 */
exports.overrideLabel = async (req, res, next) => {
  try {
    const { reason, label } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    if (!label) {
      return res.status(400).json({ success: false, message: 'Label is required' });
    }

    const log = await moderationService.overrideLabel({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
      newLabel: label,
    });

    res.status(200).json({ success: true, message: 'Label overridden', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/posts/:id/flag
 * Flag a post for further review.
 */
exports.flagForReview = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.flagForReview({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Post flagged for review', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/posts/:id/remove
 * Remove content.
 */
exports.removeContent = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.removeContent({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Content removed', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/posts/:id/restore
 * Restore removed content.
 */
exports.restoreContent = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.restoreContent({
      postId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Content restored', log });
  } catch (error) {
    next(error);
  }
};

// ─── Report Resolution ───────────────────────────────────

/**
 * POST /api/v1/moderation/reports/:id/resolve
 * Resolve a community report.
 */
exports.resolveReport = async (req, res, next) => {
  try {
    const { reason, postId } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.resolveReport({
      reportId: req.params.id,
      postId: postId || null,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Report resolved', log });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/moderation/reports/:id/dismiss
 * Dismiss a community report.
 */
exports.dismissReport = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const log = await moderationService.dismissReport({
      reportId: req.params.id,
      moderatorId: req.user._id,
      reason,
    });

    res.status(200).json({ success: true, message: 'Report dismissed', log });
  } catch (error) {
    next(error);
  }
};

// ─── Audit Logs ──────────────────────────────────────────

/**
 * GET /api/v1/moderation/logs
 * Get all moderation logs with filtering.
 */
exports.getLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { action, moderatorId } = req.query;

    const result = await moderationService.getLogs({ page, limit, action, moderatorId });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/moderation/posts/:id/logs
 * Get audit logs for a specific post.
 */
exports.getLogsForPost = async (req, res, next) => {
  try {
    const logs = await moderationService.getLogsForPost(req.params.id);
    res.status(200).json({ success: true, count: logs.length, logs });
  } catch (error) {
    next(error);
  }
};

// ─── Stats ───────────────────────────────────────────────

/**
 * GET /api/v1/moderation/stats
 * Get moderation dashboard statistics.
 */
exports.getStats = async (req, res, next) => {
  try {
    const stats = await moderationService.getStats();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

// ─── Actions List ────────────────────────────────────────

/**
 * GET /api/v1/moderation/actions
 * List valid moderation actions (for UI).
 */
exports.getActions = async (_req, res) => {
  const { MODERATION_ACTION } = require('../../models/moderationLog.model');
  res.status(200).json({
    success: true,
    actions: Object.values(MODERATION_ACTION),
  });
};
