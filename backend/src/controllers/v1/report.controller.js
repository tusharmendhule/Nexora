const reportService = require('../../services/report.service');
const { REPORT_REASON } = require('../../models/report.model');

// ─── User-Facing ─────────────────────────────────────

/**
 * POST /api/v1/posts/:id/report
 *
 * Report a post. Requires authentication.
 * Body: { reason, description? }
 */
exports.createReport = async (req, res, next) => {
  try {
    const { reason, description } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required',
      });
    }

    const report = await reportService.create({
      reporterId: req.user._id,
      targetType: 'Post',
      targetId: req.params.id,
      reason,
      description,
    });

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reports
 *
 * Generic report creation (Post, Comment, or User).
 * Body: { targetType, targetId, reason, description? }
 */
exports.createGenericReport = async (req, res, next) => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'targetType, targetId, and reason are required',
      });
    }

    const report = await reportService.create({
      reporterId: req.user._id,
      targetType,
      targetId,
      reason,
      description,
    });

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Admin/Moderator ─────────────────────────────────

/**
 * GET /api/v1/reports
 *
 * List all reports with filtering. MODERATOR or ADMIN only.
 * Query: ?page=1&limit=20&status=OPEN&reason=MISINFORMATION&targetType=Post
 */
exports.getReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { status, reason, targetType } = req.query;

    const result = await reportService.getAll({ page, limit, status, reason, targetType });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/:id
 *
 * Get a single report by ID. MODERATOR or ADMIN only.
 */
exports.getReportById = async (req, res, next) => {
  try {
    const report = await reportService.getById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/target/:targetType/:targetId
 *
 * Get all reports for a specific target. MODERATOR or ADMIN only.
 */
exports.getReportsByTarget = async (req, res, next) => {
  try {
    const { targetType, targetId } = req.params;

    if (!['Post', 'Comment', 'User'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid targetType',
      });
    }

    const reports = await reportService.getByTarget(targetType, targetId);

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/mine
 *
 * Get the current user's own reports.
 */
exports.getMyReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const result = await reportService.getByReporter(req.user._id, { page, limit });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/reports/:id/status
 *
 * Update a report's status. MODERATOR or ADMIN only.
 * Body: { status, resolutionNote? }
 */
exports.updateReportStatus = async (req, res, next) => {
  try {
    const { status, resolutionNote } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
      });
    }

    const report = await reportService.updateStatus({
      reportId: req.params.id,
      status,
      moderatorId: req.user._id,
      resolutionNote,
    });

    res.status(200).json({
      success: true,
      message: 'Report status updated',
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/stats
 *
 * Get report statistics for the moderation dashboard.
 * MODERATOR or ADMIN only.
 */
exports.getReportStats = async (req, res, next) => {
  try {
    const stats = await reportService.getStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/reasons
 *
 * Get the list of valid report reasons (for UI dropdowns).
 */
exports.getReportReasons = async (_req, res) => {
  res.status(200).json({
    success: true,
    reasons: Object.values(REPORT_REASON),
  });
};
