const express = require('express');
const router = express.Router();
const Activity = require('../models/activity.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// GET GLOBAL ACTIVITY TIMELINE
// ==========================================
// @route   GET /api/activities
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const feed = await Activity.find()
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(30);

    res.status(200).json({
      success: true,
      count: feed.length,
      feed
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;