const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { getReports } = require('../../controllers/v1/report.controller');

// GET /api/v1/reports
// Only MODERATOR and ADMIN can view the reports list
router.get('/', protect, requireRole('MODERATOR', 'ADMIN'), getReports);

module.exports = router;
