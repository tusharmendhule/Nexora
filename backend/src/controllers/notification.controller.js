const Notification = require("../models/Notification");

// @desc    Get all notifications for the logged-in user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ receiver: req.user.id })
      .populate("sender", "name avatar")
      .populate("post", "image caption")
      .sort({ createdAt: -1 }); // Newest alerts first

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Mark notifications as read
// @route   PUT /api/notifications/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { receiver: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getNotifications,
  markAsRead
};