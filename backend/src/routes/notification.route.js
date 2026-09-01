const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. GET ALL NOTIFICATIONS FOR LOGGED IN USER
// ==========================================
// @route   GET /api/notifications
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    const notifications = await Notification.find({ recipient: currentUserId })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. MARK ALL NOTIFICATIONS AS READ
// ==========================================
// @route   PUT /api/notifications/read-all
// @access  Private
router.put('/read-all', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    await Notification.updateMany(
      { recipient: currentUserId, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;