const reportService = require('../../services/report.service');

/**
 * POST /api/v1/posts/:id/report
 */
exports.createReport = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required',
      });
    }

    const report = await reportService.create(req.params.id, req.user._id, reason);

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
 * GET /api/v1/reports (admin/moderator)
 */
exports.getReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await reportService.getAll(page, limit);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
