const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { sanitizeBody } = require('../../middleware/validate.middleware');
const { reportRateLimit, reportListRateLimit } = require('../../middleware/rate-limit.middleware');
const {
  createReport,
  createGenericReport,
  getReports,
  getReportById,
  getReportsByTarget,
  getMyReports,
  updateReportStatus,
  getReportStats,
  getReportReasons,
} = require('../../controllers/v1/report.controller');

// ─── Public (Authenticated) ──────────────────────────

// GET /api/v1/reports/reasons
// List valid report reasons (for UI dropdowns) — must be before /:id
router.get('/reasons', protect, getReportReasons);

// ─── User-Facing ─────────────────────────────────────

// GET /api/v1/reports/mine
// Get current user's own reports
router.get('/mine', protect, reportListRateLimit, getMyReports);

// POST /api/v1/reports
// Generic report creation (Post, Comment, or User)
router.post(
  '/',
  protect,
  reportRateLimit,
  sanitizeBody(['description']),
  createGenericReport
);

// ─── Admin/Moderator ─────────────────────────────────
const modRoutes = express.Router();
modRoutes.use(protect, requireRole('MODERATOR', 'ADMIN'));

// GET /api/v1/reports/stats — dashboard statistics (must be before /:id)
modRoutes.get('/stats', reportListRateLimit, getReportStats);

// GET /api/v1/reports/target/:targetType/:targetId — reports for a specific target
modRoutes.get('/target/:targetType/:targetId', reportListRateLimit, getReportsByTarget);

// GET /api/v1/reports/:id — single report detail
modRoutes.get('/:id', validateObjectId('id'), reportListRateLimit, getReportById);

// PATCH /api/v1/reports/:id/status — update report status
modRoutes.patch(
  '/:id/status',
  validateObjectId('id'),
  sanitizeBody(['resolutionNote']),
  updateReportStatus
);

// GET /api/v1/reports — list all reports (with filters)
modRoutes.get('/', reportListRateLimit, getReports);

router.use(modRoutes);

module.exports = router;
