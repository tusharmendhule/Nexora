const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // ─── Notifications ─────────────────────────────────
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    likesAndComments: {
      type: Boolean,
      default: true,
    },
    newFollowers: {
      type: Boolean,
      default: true,
    },
    messages: {
      type: Boolean,
      default: true,
    },
    mentions: {
      type: Boolean,
      default: true,
    },
    moments: {
      type: Boolean,
      default: true,
    },
    clips: {
      type: Boolean,
      default: true,
    },

    // ─── Privacy ───────────────────────────────────────
    isPrivateAccount: {
      type: Boolean,
      default: false,
    },
    activityStatus: {
      type: Boolean,
      default: true,
    },
    readReceipts: {
      type: Boolean,
      default: true,
    },
    personalizedContent: {
      type: Boolean,
      default: true,
    },
    allowDirectMessagesFrom: {
      type: String,
      enum: ['everyone', 'followers', 'none'],
      default: 'everyone',
    },
    blockedAccounts: [{ type: String }],
    mutedAccounts: [{ type: String }],

    // ─── Security ──────────────────────────────────────
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    authenticationMethod: {
      type: String,
      enum: ['Authentication App', 'SMS', 'Security Key'],
      default: 'Authentication App',
    },

    // ─── Appearance ────────────────────────────────────
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'dark',
    },
    darkMode: {
      type: Boolean,
      default: true,
    },
    reduceAnimations: {
      type: Boolean,
      default: false,
    },
    selectedGradient: {
      type: Number,
      default: 0,
    },
    textSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },

    // ─── Language ──────────────────────────────────────
    language: {
      type: String,
      default: 'English',
    },

    // ─── Content Preferences ───────────────────────────
    hiddenWords: [{ type: String }],
    followedCreators: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);