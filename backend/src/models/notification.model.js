/**
 * Notification Model (Module 22)
 * ==============================
 * Stores notifications for security-sensitive and content-related events.
 *
 * Event types:
 *   - POST_VERIFIED            — Post verification completed
 *   - POST_REQUIRES_MODERATION — Post requires human review
 *   - POST_APPROVED            — Moderation approved user's post
 *   - POST_REJECTED            — Moderation rejected user's post
 *   - LABEL_OVERRIDE           — Trust label overridden on user's post
 *   - REPORT_RESOLVED          — Report filed by user was resolved
 *   - REPORT_DISMISSED         — Report filed by user was dismissed
 *   - ACCOUNT_SECURITY         — Security event (role change, disable, etc.)
 *   - SYSTEM                   — System-wide announcements
 *
 * Privacy: Notifications never contain passwords, tokens, or raw PII.
 */

const mongoose = require('mongoose');

const NOTIFICATION_TYPE = {
  POST_VERIFIED: 'POST_VERIFIED',
  POST_REQUIRES_MODERATION: 'POST_REQUIRES_MODERATION',
  POST_APPROVED: 'POST_APPROVED',
  POST_REJECTED: 'POST_REJECTED',
  LABEL_OVERRIDE: 'LABEL_OVERRIDE',
  CONTENT_REMOVED: 'CONTENT_REMOVED',
  CONTENT_RESTORED: 'CONTENT_RESTORED',
  REPORT_RESOLVED: 'REPORT_RESOLVED',
  REPORT_DISMISSED: 'REPORT_DISMISSED',
  ACCOUNT_SECURITY: 'ACCOUNT_SECURITY',
  SYSTEM: 'SYSTEM',
};

const notificationSchema = new mongoose.Schema(
  {
    // ─── Recipient ──────────────────────────────────────
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ─── Sender (who triggered the event) ───────────────
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for SYSTEM notifications
    },

    // ─── Event Type ─────────────────────────────────────
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
      index: true,
    },

    // ─── Title & Body ───────────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // ─── Target Reference ───────────────────────────────
    targetType: {
      type: String,
      enum: ['Post', 'Report', 'User', 'System', null],
      default: null,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ─── Metadata ───────────────────────────────────────
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ─── Read State ─────────────────────────────────────
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ targetType: 1, targetId: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPE = NOTIFICATION_TYPE;
