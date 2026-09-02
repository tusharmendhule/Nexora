const mongoose = require('mongoose');

/**
 * Age Verification Statuses
 *
 * PENDING        — Verification initiated, awaiting provider response
 * VERIFIED       — Provider confirmed age category
 * FAILED         — Provider rejected the verification attempt
 * REQUIRES_REVIEW — Ambiguous result; needs manual/admin review
 */
const AGE_VERIFICATION_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
};

/**
 * Age Categories
 *
 * Only stored when status is VERIFIED. The application never stores
 * the user's actual date of birth or government-issued documents —
 * only the category required for access control.
 */
const AGE_CATEGORY = {
  ADULT: 'ADULT',       // 18+
  TEEN: 'TEEN',         // 13–17
  MINOR: 'MINOR',       // <13
  UNKNOWN: 'UNKNOWN',   // Could not determine
};

const ageVerificationSchema = new mongoose.Schema(
  {
    // ─── References ──────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ─── Verification State ──────────────────────────────
    status: {
      type: String,
      enum: Object.values(AGE_VERIFICATION_STATUS),
      default: AGE_VERIFICATION_STATUS.PENDING,
      required: true,
    },

    // Only populated when status === VERIFIED
    ageCategory: {
      type: String,
      enum: Object.values(AGE_CATEGORY),
      default: null,
    },

    // ─── Provider Metadata (no PII) ──────────────────────
    // Which provider performed the verification (e.g. "mock", "jumio", "veriff")
    provider: {
      type: String,
      required: true,
      default: 'mock',
    },

    // Opaque reference ID from the provider — used for lookups/callbacks,
    // never contains PII
    providerReferenceId: {
      type: String,
      default: null,
    },

    // ─── Attempt Tracking ────────────────────────────────
    attemptCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    maxAttempts: {
      type: Number,
      default: 3,
    },

    // ─── Timestamps ──────────────────────────────────────
    verifiedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    // Privacy-conscious failure reason (no PII, no raw document details)
    failureReason: {
      type: String,
      default: null,
    },

    // ─── Rejection tracking for REQUIRES_REVIEW ──────────
    reviewNote: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient lookup of pending verifications
ageVerificationSchema.index({ user: 1, status: 1 });
ageVerificationSchema.index({ providerReferenceId: 1 });

// Instance helper: check if verification is still valid
ageVerificationSchema.methods.isValid = function isValid() {
  if (this.status !== AGE_VERIFICATION_STATUS.VERIFIED) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

// Instance helper: check if user can retry
ageVerificationSchema.methods.canRetry = function canRetry() {
  if (this.status === AGE_VERIFICATION_STATUS.VERIFIED) return false;
  if (this.status === AGE_VERIFICATION_STATUS.REQUIRES_REVIEW) return false;
  return this.attemptCount < this.maxAttempts;
};

const AgeVerification = mongoose.model('AgeVerification', ageVerificationSchema);

module.exports = AgeVerification;
module.exports.AGE_VERIFICATION_STATUS = AGE_VERIFICATION_STATUS;
module.exports.AGE_CATEGORY = AGE_CATEGORY;
