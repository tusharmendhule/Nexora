/**
 * Audit Log Model (Module 21)
 * ============================
 * System-wide audit logging for security-sensitive operations.
 *
 * Privacy principles:
 *   - Never stores passwords, tokens, API keys, or raw PII
 *   - Structured event format for consistent querying
 *   - Immutable records — once written, cannot be modified or deleted
 *
 * Event categories:
 *   - AUTH           — login, logout, registration, auth failures
 *   - MODERATION     — post approval, rejection, label overrides
 *   - REPORT         — report creation, resolution, dismissal
 *   - ACCOUNT        — profile changes, password changes, email changes
 *   - ADMIN          — role changes, user disable/enable, system config
 *   - AI_PROCESSING  — pipeline failures, model errors, service outages
 *   - VERIFICATION   — age verification, fact-check, trust score events
 */

const mongoose = require('mongoose');

// ─── Event Categories ─────────────────────────────────────────────────

const AUDIT_EVENT_CATEGORY = {
  AUTH: 'AUTH',
  MODERATION: 'MODERATION',
  REPORT: 'REPORT',
  ACCOUNT: 'ACCOUNT',
  ADMIN: 'ADMIN',
  AI_PROCESSING: 'AI_PROCESSING',
  VERIFICATION: 'VERIFICATION',
};

// ─── Specific Event Types ─────────────────────────────────────────────

const AUDIT_EVENT_TYPE = {
  // AUTH events
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  REGISTER_SUCCESS: 'REGISTER_SUCCESS',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // MODERATION events
  POST_APPROVED: 'POST_APPROVED',
  POST_REJECTED: 'POST_REJECTED',
  POST_FLAGGED: 'POST_FLAGGED',
  LABEL_OVERRIDE: 'LABEL_OVERRIDE',
  CONTENT_REMOVED: 'CONTENT_REMOVED',
  CONTENT_RESTORED: 'CONTENT_RESTORED',

  // REPORT events
  REPORT_CREATED: 'REPORT_CREATED',
  REPORT_RESOLVED: 'REPORT_RESOLVED',
  REPORT_DISMISSED: 'REPORT_DISMISSED',
  REPORT_STATUS_CHANGED: 'REPORT_STATUS_CHANGED',

  // ACCOUNT events
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  AVATAR_CHANGED: 'AVATAR_CHANGED',
  USERNAME_CHANGED: 'USERNAME_CHANGED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  ACCOUNT_ENABLED: 'ACCOUNT_ENABLED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  EMAIL_CHANGED: 'EMAIL_CHANGED',
  PRIVACY_TOGGLED: 'PRIVACY_TOGGLED',

  // ADMIN events
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  SYSTEM_CONFIG_CHANGED: 'SYSTEM_CONFIG_CHANGED',

  // AI_PROCESSING events
  PIPELINE_STARTED: 'PIPELINE_STARTED',
  PIPELINE_COMPLETED: 'PIPELINE_COMPLETED',
  PIPELINE_FAILED: 'PIPELINE_FAILED',
  AI_ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
  TRUST_SCORE_FAILED: 'TRUST_SCORE_FAILED',
  FACT_CHECK_FAILED: 'FACT_CHECK_FAILED',
  MODEL_ERROR: 'MODEL_ERROR',

  // VERIFICATION events
  AGE_VERIFICATION_INITIATED: 'AGE_VERIFICATION_INITIATED',
  AGE_VERIFICATION_SUCCESS: 'AGE_VERIFICATION_SUCCESS',
  AGE_VERIFICATION_FAILED: 'AGE_VERIFICATION_FAILED',
  AGE_VERIFICATION_EXPIRED: 'AGE_VERIFICATION_EXPIRED',
  FACT_CHECK_INITIATED: 'FACT_CHECK_INITIATED',
  TRUST_SCORE_COMPUTED: 'TRUST_SCORE_COMPUTED',
};

// ─── Outcome Values ───────────────────────────────────────────────────

const AUDIT_OUTCOME = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PARTIAL: 'PARTIAL',
};

// ─── Audit Log Schema ─────────────────────────────────────────────────

const auditLogSchema = new mongoose.Schema(
  {
    // ─── Event Identification ──────────────────────────────
    eventType: {
      type: String,
      enum: Object.values(AUDIT_EVENT_TYPE),
      required: true,
      index: true,
    },

    category: {
      type: String,
      enum: Object.values(AUDIT_EVENT_CATEGORY),
      required: true,
      index: true,
    },

    outcome: {
      type: String,
      enum: Object.values(AUDIT_OUTCOME),
      required: true,
    },

    // ─── Actor (who performed the action) ──────────────────
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    actorType: {
      type: String,
      enum: ['USER', 'MODERATOR', 'ADMIN', 'SYSTEM', 'API'],
      required: true,
    },

    // ─── Target (what was acted upon) ──────────────────────
    targetType: {
      type: String,
      enum: ['User', 'Post', 'Comment', 'Report', 'System', null],
      default: null,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    // ─── Description & Context ─────────────────────────────
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ─── Request Context ───────────────────────────────────
    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },

    requestId: {
      type: String,
      default: null,
    },

    // ─── Error Details (for failures) ──────────────────────
    errorCode: {
      type: String,
      default: null,
    },

    errorMessage: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    // ─── Trace / Correlation ───────────────────────────────
    correlationId: {
      type: String,
      default: null,
      index: true,
    },

    // ─── Integrity ─────────────────────────────────────────
    // Hash of the document content to detect tampering
    checksum: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────
auditLogSchema.index({ eventType: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1, createdAt: -1 });
auditLogSchema.index({ correlationId: 1 });
auditLogSchema.index({ createdAt: -1 }); // For time-range queries

// ─── Immutability Guards ──────────────────────────────────────────────
// Prevent updates and deletes to audit log records

auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable and cannot be modified');
});

auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

auditLogSchema.pre('deleteMany', function () {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

// Override save to prevent updates on existing documents
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    throw new Error('Audit logs are immutable and cannot be modified after creation');
  }
  next();
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
module.exports.AUDIT_EVENT_CATEGORY = AUDIT_EVENT_CATEGORY;
module.exports.AUDIT_EVENT_TYPE = AUDIT_EVENT_TYPE;
module.exports.AUDIT_OUTCOME = AUDIT_OUTCOME;
