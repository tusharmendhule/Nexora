/**
 * Age Verification Service (Module 18)
 *
 * Orchestrates the age-verification lifecycle:
 *   1. initiate  — create a PENDING record and delegate to the provider
 *   2. poll      — check status with the provider and update the record
 *   3. retry     — allow re-attempts within the allowed limit
 *   4. getStatus — return the current verification state for a user
 *   5. isVerified — quick boolean check for gating logic
 *
 * Privacy principles:
 *   - Never stores DOB, government IDs, or biometrics
 *   - Stores only the age CATEGORY (ADULT / TEEN / MINOR / UNKNOWN)
 *   - All logging is privacy-conscious (masked user IDs, no PII)
 *   - Provider abstraction keeps external-service details isolated
 */

const AgeVerification = require('../../models/age-verification.model');
const {
  AGE_VERIFICATION_STATUS,
  AGE_CATEGORY,
} = require('../../models/age-verification.model');
const { getProvider } = require('./age-verification-provider.factory');
const {
  AGE_VERIFICATION_EVENTS,
  logAgeVerificationEvent,
  logAgeVerificationError,
} = require('./age-verification-logger');
const auditService = require('../audit.service');

class AgeVerificationService {
  /**
   * Initiate age verification for a user.
   *
   * @param {Object} params
   * @param {string} params.userId — MongoDB User _id
   * @returns {Promise<{verificationId: string, providerReferenceId: string, status: string}>}
   */
  async initiate({ userId }) {
    if (!userId) {
      throw new Error('userId is required');
    }

    // ── Check existing verification ─────────────────────
    const existing = await AgeVerification.findOne({
      user: userId,
      status: { $in: [AGE_VERIFICATION_STATUS.PENDING, AGE_VERIFICATION_STATUS.VERIFIED] },
    });

    if (existing && existing.status === AGE_VERIFICATION_STATUS.VERIFIED && existing.isValid()) {
      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.INITIATED, {
        userId,
        status: 'already_verified',
      });
      return {
        verificationId: existing._id.toString(),
        providerReferenceId: existing.providerReferenceId,
        status: existing.status,
        ageCategory: existing.ageCategory,
      };
    }

    // If there's a PENDING verification, check its current status first
    if (existing && existing.status === AGE_VERIFICATION_STATUS.PENDING) {
      const provider = await getProvider();
      try {
        const providerResult = await provider.checkStatus({
          providerReferenceId: existing.providerReferenceId,
        });
        if (providerResult.status !== 'PENDING') {
          await this._processResult(existing, providerResult);
          return {
            verificationId: existing._id.toString(),
            providerReferenceId: existing.providerReferenceId,
            status: existing.status,
            ageCategory: existing.ageCategory,
          };
        }
      } catch (err) {
        logAgeVerificationError(AGE_VERIFICATION_EVENTS.PROVIDER_ERROR, err, { userId });
      }
      // Still pending — return existing
      return {
        verificationId: existing._id.toString(),
        providerReferenceId: existing.providerReferenceId,
        status: existing.status,
      };
    }

    // ── Check provider availability ─────────────────────
    const provider = await getProvider();
    const available = await provider.isAvailable();
    if (!available) {
      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.PROVIDER_UNAVAILABLE, { userId });
      throw new Error('Age verification provider is currently unavailable');
    }

    // ── Create PENDING record ──────────────────────────
    const verification = await AgeVerification.create({
      user: userId,
      status: AGE_VERIFICATION_STATUS.PENDING,
      provider: provider.name,
      attemptCount: 1,
    });

    logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.INITIATED, {
      userId,
      provider: provider.name,
      attempt: 1,
    });

    // Audit: log age verification initiation (non-critical)
    try {
      await auditService.logVerificationEvent({
        eventType: 'AGE_VERIFICATION_INITIATED',
        actor: { _id: userId },
        target: { userId, verificationId: verification._id },
        metadata: { provider: provider.name, attempt: 1 },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // ── Delegate to provider ───────────────────────────
    try {
      const result = await provider.initiate({
        userId: userId.toString(),
        referenceId: verification._id.toString(),
      });

      verification.providerReferenceId = result.providerReferenceId;
      await verification.save();

      // Some providers (and the isolated test provider) return a terminal
      // status directly from initiate() — settle the record immediately
      // instead of leaving it PENDING until a later status poll.
      if (result.status && result.status !== AGE_VERIFICATION_STATUS.PENDING) {
        await this._processResult(verification, result);
      }

      return {
        verificationId: verification._id.toString(),
        providerReferenceId: result.providerReferenceId,
        status: verification.status,
        ageCategory: verification.ageCategory || null,
        sessionUrl: result.sessionUrl || null,
      };
    } catch (err) {
      verification.status = AGE_VERIFICATION_STATUS.FAILED;
      verification.failureReason = 'Provider initiation failed';
      await verification.save();

      logAgeVerificationError(AGE_VERIFICATION_EVENTS.PROVIDER_ERROR, err, { userId });

      // Audit: log age verification failure (non-critical)
      try {
        await auditService.logVerificationEvent({
          eventType: 'AGE_VERIFICATION_FAILED',
          actor: { _id: userId },
          target: { userId, verificationId: verification._id },
          metadata: { provider: provider.name, failureReason: 'Provider initiation failed' },
          error: { code: 'PROVIDER_ERROR', message: err.message },
        });
      } catch (_) { /* audit logging is non-critical */ }

      throw new Error('Failed to initiate age verification');
    }
  }

  /**
   * Poll / check the current status of a verification.
   *
   * @param {Object} params
   * @param {string} params.userId — MongoDB User _id
   * @returns {Promise<{status: string, ageCategory?: string}>}
   */
  async getStatus({ userId }) {
    if (!userId) throw new Error('userId is required');

    const verification = await AgeVerification.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    if (!verification) {
      return { status: 'NOT_STARTED' };
    }

    // If still pending, poll the provider
    if (verification.status === AGE_VERIFICATION_STATUS.PENDING && verification.providerReferenceId) {
      const provider = await getProvider();
      try {
        const providerResult = await provider.checkStatus({
          providerReferenceId: verification.providerReferenceId,
        });
        if (providerResult.status !== 'PENDING') {
          await this._processResult(verification, providerResult);
        }
      } catch (err) {
        logAgeVerificationError(AGE_VERIFICATION_EVENTS.PROVIDER_ERROR, err, { userId });
      }
    }

    // Check if verified but expired
    if (
      verification.status === AGE_VERIFICATION_STATUS.VERIFIED &&
      verification.expiresAt &&
      verification.expiresAt < new Date()
    ) {
      verification.status = AGE_VERIFICATION_STATUS.FAILED;
      verification.failureReason = 'Verification expired';
      await verification.save();

      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.EXPIRED, {
        userId,
        provider: verification.provider,
      });

      // Audit: log age verification expiry (non-critical)
      try {
        await auditService.logVerificationEvent({
          eventType: 'AGE_VERIFICATION_EXPIRED',
          actor: { _id: userId },
          target: { userId, verificationId: verification._id },
          metadata: { provider: verification.provider },
        });
      } catch (_) { /* audit logging is non-critical */ }
    }

    return {
      status: verification.status,
      ageCategory: verification.ageCategory,
      verifiedAt: verification.verifiedAt,
      attemptCount: verification.attemptCount,
      canRetry: verification.canRetry(),
    };
  }

  /**
   * Retry a failed verification.
   *
   * @param {Object} params
   * @param {string} params.userId — MongoDB User _id
   * @returns {Promise<{verificationId: string, providerReferenceId: string, status: string}>}
   */
  async retry({ userId }) {
    if (!userId) throw new Error('userId is required');

    const existing = await AgeVerification.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    if (!existing) {
      throw new Error('No verification record found — use initiate instead');
    }

    if (existing.status === AGE_VERIFICATION_STATUS.VERIFIED) {
      throw new Error('Verification already completed');
    }

    if (existing.status === AGE_VERIFICATION_STATUS.REQUIRES_REVIEW) {
      throw new Error('Verification requires manual review — cannot retry');
    }

    if (!existing.canRetry()) {
      throw new Error(
        `Maximum retry attempts (${existing.maxAttempts}) exceeded`
      );
    }

    logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.RETRY, {
      userId,
      provider: existing.provider,
      attempt: existing.attemptCount + 1,
    });

    // ── Check provider availability ─────────────────────
    const provider = await getProvider();
    const available = await provider.isAvailable();
    if (!available) {
      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.PROVIDER_UNAVAILABLE, { userId });
      throw new Error('Age verification provider is currently unavailable');
    }

    // ── Update attempt count and re-initiate ────────────
    existing.attemptCount += 1;
    existing.status = AGE_VERIFICATION_STATUS.PENDING;
    existing.failureReason = null;

    try {
      const result = await provider.initiate({
        userId: userId.toString(),
        referenceId: existing._id.toString(),
      });

      existing.providerReferenceId = result.providerReferenceId;
      await existing.save();

      // Settle immediately when the provider returns a terminal status
      // (same contract as initiate()).
      if (result.status && result.status !== AGE_VERIFICATION_STATUS.PENDING) {
        await this._processResult(existing, result);
      }

      return {
        verificationId: existing._id.toString(),
        providerReferenceId: result.providerReferenceId,
        status: existing.status,
        ageCategory: existing.ageCategory || null,
        sessionUrl: result.sessionUrl || null,
      };
    } catch (err) {
      existing.status = AGE_VERIFICATION_STATUS.FAILED;
      existing.failureReason = 'Provider retry failed';
      await existing.save();

      logAgeVerificationError(AGE_VERIFICATION_EVENTS.PROVIDER_ERROR, err, { userId });

      throw new Error('Failed to retry age verification');
    }
  }

  /**
   * Quick boolean check: is this user verified and not expired?
   *
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async isVerified(userId) {
    if (!userId) return false;

    const verification = await AgeVerification.findOne({
      user: userId,
      status: AGE_VERIFICATION_STATUS.VERIFIED,
    }).sort({ createdAt: -1 });

    if (!verification) return false;
    return verification.isValid();
  }

  /**
   * Get the age category for a verified user.
   *
   * @param {string} userId
   * @returns {Promise<string|null>} — AGE_CATEGORY value or null
   */
  async getAgeCategory(userId) {
    if (!userId) return null;

    const verification = await AgeVerification.findOne({
      user: userId,
      status: AGE_VERIFICATION_STATUS.VERIFIED,
    }).sort({ createdAt: -1 });

    if (!verification || !verification.isValid()) return null;
    return verification.ageCategory;
  }

  // ─── Private Helpers ──────────────────────────────────

  /**
   * Process a provider result and update the verification record + user model.
   */
  async _processResult(verification, providerResult) {
    verification.status = providerResult.status;

    if (providerResult.status === AGE_VERIFICATION_STATUS.VERIFIED) {
      verification.ageCategory = providerResult.ageCategory || AGE_CATEGORY.UNKNOWN;
      verification.verifiedAt = new Date();
      // Verifications expire after 1 year by default
      verification.expiresAt = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      );

      // Update user model
      const User = require('../../models/user.model');
      await User.findByIdAndUpdate(verification.user, {
        ageVerificationStatus: AGE_VERIFICATION_STATUS.VERIFIED,
        ageCategory: providerResult.ageCategory || AGE_CATEGORY.UNKNOWN,
      });

      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.VERIFIED, {
        userId: verification.user,
        ageCategory: verification.ageCategory,
        provider: verification.provider,
      });

      // Audit: log age verification success (non-critical)
      try {
        await auditService.logVerificationEvent({
          eventType: 'AGE_VERIFICATION_SUCCESS',
          actor: { _id: verification.user },
          target: { userId: verification.user, verificationId: verification._id },
          metadata: { provider: verification.provider, ageCategory: verification.ageCategory },
        });
      } catch (_) { /* audit logging is non-critical */ }
    } else if (providerResult.status === AGE_VERIFICATION_STATUS.FAILED) {
      verification.failureReason = providerResult.failureReason || 'Verification failed';

      // Update user model
      const User = require('../../models/user.model');
      await User.findByIdAndUpdate(verification.user, {
        ageVerificationStatus: AGE_VERIFICATION_STATUS.FAILED,
      });

      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.FAILED, {
        userId: verification.user,
        failureReason: verification.failureReason,
        provider: verification.provider,
      });

      // Audit: log age verification failure (non-critical)
      try {
        await auditService.logVerificationEvent({
          eventType: 'AGE_VERIFICATION_FAILED',
          actor: { _id: verification.user },
          target: { userId: verification.user, verificationId: verification._id },
          metadata: { provider: verification.provider, failureReason: verification.failureReason },
        });
      } catch (_) { /* audit logging is non-critical */ }
    } else if (providerResult.status === AGE_VERIFICATION_STATUS.REQUIRES_REVIEW) {
      verification.reviewNote = providerResult.failureReason || 'Requires manual review';

      const User = require('../../models/user.model');
      await User.findByIdAndUpdate(verification.user, {
        ageVerificationStatus: AGE_VERIFICATION_STATUS.REQUIRES_REVIEW,
      });

      logAgeVerificationEvent(AGE_VERIFICATION_EVENTS.REVIEW_REQUIRED, {
        userId: verification.user,
        provider: verification.provider,
      });
    }

    await verification.save();
  }
}

module.exports = new AgeVerificationService();
