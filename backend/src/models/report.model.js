const mongoose = require('mongoose');

// ─── Report Reason Categories (Module 19) ─────────────
const REPORT_REASON = {
  MISINFORMATION: 'MISINFORMATION',
  HARASSMENT: 'HARASSMENT',
  HARMFUL_CONTENT: 'HARMFUL_CONTENT',
  IMPERSONATION: 'IMPERSONATION',
  MANIPULATED_MEDIA: 'MANIPULATED_MEDIA',
  SPAM: 'SPAM',
  OTHER: 'OTHER',
};

// ─── Report Statuses ──────────────────────────────────
const REPORT_STATUS = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
};

const reportSchema = new mongoose.Schema(
  {
    // ─── References ───────────────────────────────────
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['Post', 'Comment', 'User'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType',
    },

    // ─── Report Details ────────────────────────────────
    reason: {
      type: String,
      enum: Object.values(REPORT_REASON),
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    // ─── Workflow Status ───────────────────────────────
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.OPEN,
    },

    // ─── Resolution Tracking ───────────────────────────
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────
// Prevent duplicate reports from same user on same target
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true }
);
// Fast lookup by status for moderation dashboard
reportSchema.index({ status: 1, createdAt: -1 });
// Fast lookup by target
reportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// Fast lookup by reporter
reportSchema.index({ reporter: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.REPORT_REASON = REPORT_REASON;
module.exports.REPORT_STATUS = REPORT_STATUS;