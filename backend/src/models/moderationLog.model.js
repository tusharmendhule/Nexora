const mongoose = require('mongoose');

// ─── Moderation Actions ──────────────────────────────────────────────
const MODERATION_ACTION = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  FLAG_FOR_REVIEW: 'FLAG_FOR_REVIEW',
  OVERRIDE_LABEL: 'OVERRIDE_LABEL',
  RESOLVE_REPORT: 'RESOLVE_REPORT',
  DISMISS_REPORT: 'DISMISS_REPORT',
  REMOVE_CONTENT: 'REMOVE_CONTENT',
  RESTORE_CONTENT: 'RESTORE_CONTENT',
  // A regular user requested that a moderator re-review a post's analysis.
  REVIEW_REQUESTED: 'REVIEW_REQUESTED',
};

// ─── Moderation Log Schema ───────────────────────────────────────────
const moderationLogSchema = new mongoose.Schema(
  {
    // ─── References ───────────────────────────────────────
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },

    moderatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ─── Action Details ───────────────────────────────────
    action: {
      type: String,
      enum: Object.values(MODERATION_ACTION),
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // ─── State Transitions ────────────────────────────────
    previousStatus: {
      type: String,
      default: null,
    },

    newStatus: {
      type: String,
      default: null,
    },

    previousLabel: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red', 'None', null],
      default: null,
    },

    newLabel: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red', 'None', null],
      default: null,
    },

    // ─── Report Reference (if resolving a report) ─────────
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report',
      default: null,
    },

    // ─── Metadata ─────────────────────────────────────────
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────────
moderationLogSchema.index({ postId: 1, createdAt: -1 });
moderationLogSchema.index({ moderatorId: 1, createdAt: -1 });
moderationLogSchema.index({ action: 1, createdAt: -1 });
moderationLogSchema.index({ reportId: 1 });

const ModerationLog = mongoose.model('ModerationLog', moderationLogSchema);

module.exports = ModerationLog;
module.exports.MODERATION_ACTION = MODERATION_ACTION;
