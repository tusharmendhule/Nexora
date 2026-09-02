const express = require('express');
const router = express.Router();
const Settings = require('../models/settings.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. GET LOGGED-IN USER'S SETTINGS
// ==========================================
// @route   GET /api/settings
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    let settings = await Settings.findOne({ user: currentUserId });

    // Auto-create default settings if none exist yet for the user
    if (!settings) {
      settings = await Settings.create({ user: currentUserId });
    }

    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. UPDATE USER SETTINGS
// ==========================================
// @route   PUT /api/settings
// @access  Private
router.put('/', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const { isPrivateAccount, notificationsEnabled, theme, allowDirectMessagesFrom } = req.body;

    let settings = await Settings.findOne({ user: currentUserId });

    if (!settings) {
      settings = new Settings({ user: currentUserId });
    }

    if (isPrivateAccount !== undefined) settings.isPrivateAccount = isPrivateAccount;
    if (notificationsEnabled !== undefined) settings.notificationsEnabled = notificationsEnabled;
    if (theme !== undefined) settings.theme = theme;
    if (allowDirectMessagesFrom !== undefined) settings.allowDirectMessagesFrom = allowDirectMessagesFrom;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;