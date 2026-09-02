const express = require('express');
const router = express.Router();
const Report = require('../models/report.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. SUBMIT A REPORT (POST, COMMENT, OR USER)
// ==========================================
// @route   POST /api/reports
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { targetType, targetId, reason, description } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'targetType, targetId, and reason are required'
      });
    }

    if (!['Post', 'Comment', 'User'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid targetType. Must be Post, Comment, or User'
      });
    }

    const report = await Report.create({
      reporter: currentUserId,
      targetType,
      targetId,
      reason,
      description: (description || '').trim().substring(0, 1000),
    });

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report
    });
  } catch (error) {
    // Handle duplicate report
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already reported this content'
      });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. GET ALL REPORTS (ADMIN / MODERATION)
// ==========================================
// @route   GET /api/reports
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const reports = await Report.find(filter)
      .populate('reporter', 'name avatar email')
      .populate('targetId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;