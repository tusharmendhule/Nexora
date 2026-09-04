const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const Settings = require('../../models/settings.model');

// All allowed settings fields that can be updated
const ALLOWED_FIELDS = [
  // Notifications
  'notificationsEnabled', 'likesAndComments', 'newFollowers',
  'messages', 'mentions', 'moments', 'clips',
  // Privacy
  'isPrivateAccount', 'activityStatus', 'readReceipts',
  'personalizedContent', 'allowDirectMessagesFrom',
  'blockedAccounts', 'mutedAccounts',
  // Security
  'twoFactorEnabled', 'authenticationMethod',
  // Appearance
  'theme', 'darkMode', 'reduceAnimations', 'selectedGradient', 'textSize',
  // Language
  'language',
  // Content Preferences
  'hiddenWords', 'followedCreators',
];

// GET /api/v1/settings — get current user's settings
router.get('/', protect, async (req, res) => {
  try {
    let settings = await Settings.findOne({ user: req.user._id });
    if (!settings) {
      settings = await Settings.create({ user: req.user._id });
    }
    res.status(200).json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/v1/settings — update current user's settings
router.put('/', protect, async (req, res) => {
  try {
    let settings = await Settings.findOne({ user: req.user._id });
    if (!settings) {
      settings = new Settings({ user: req.user._id });
    }

    // Only allow whitelisted fields to be updated
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    }

    await settings.save();

    res.status(200).json({ success: true, message: 'Settings updated', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
