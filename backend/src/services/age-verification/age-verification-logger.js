/**
 * Age Verification Privacy-Conscious Logger
 *
 * Logs only what is necessary for debugging and auditing while
 * ensuring no PII, biometrics, or government ID data is ever written.
 *
 * What IS logged:
 *   - Masked user ID (last 4 chars)
 *   - Event type (initiated, verified, failed, retry, provider_error, etc.)
 *   - Status transitions
 *   - Provider name (not credentials)
 *   - Timestamps
 *   - Attempt counts
 *
 * What is NEVER logged:
 *   - Raw biometric data
 *   - Government ID images or numbers
 *   - Full user IDs in plain text (masked in production)
 *   - Date of birth
 *   - Selfie or liveness data
 *   - Provider API keys or secrets
 */

const AGE_VERIFICATION_EVENTS = {
  INITIATED: 'age_verify.initiated',
  STATUS_CHECK: 'age_verify.status_check',
  VERIFIED: 'age_verify.verified',
  FAILED: 'age_verify.failed',
  RETRY: 'age_verify.retry',
  PROVIDER_ERROR: 'age_verify.provider_error',
  PROVIDER_UNAVAILABLE: 'age_verify.provider_unavailable',
  REVIEW_REQUIRED: 'age_verify.review_required',
  ACCOUNT_GATED: 'age_verify.account_gated',
  EXPIRED: 'age_verify.expired',
};

/**
 * Mask a user ID for privacy-safe logging.
 * In production, shows only last 4 characters.
 * In development, shows the full ID for easier debugging.
 */
function maskUserId(userId) {
  if (!userId) return '[null]';
  const str = userId.toString();
  if (process.env.NODE_ENV === 'production') {
    if (str.length <= 4) return '****';
    return '*'.repeat(str.length - 4) + str.slice(-4);
  }
  return str;
}

/**
 * Log an age verification event.
 *
 * @param {string} event     — One of AGE_VERIFICATION_EVENTS
 * @param {Object} data      — Event-specific data (PII-safe)
 */
function logAgeVerificationEvent(event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    userId: maskUserId(data.userId),
    status: data.status || null,
    provider: data.provider || null,
    attempt: data.attempt || null,
  };

  // Add optional fields (all privacy-safe)
  if (data.ageCategory) entry.ageCategory = data.ageCategory;
  if (data.failureReason) entry.failureReason = data.failureReason;
  if (data.providerReferenceId) {
    // Only log that a reference exists, not the full value in production
    entry.hasProviderRef = true;
    if (process.env.NODE_ENV !== 'production') {
      entry.providerReferenceId = data.providerReferenceId;
    }
  }

  // Use structured logging (JSON in production, readable in dev)
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({ module: 'age_verification', ...entry }));
  } else {
    console.log(
      `[AgeVerification] ${event} | user=${entry.userId} | status=${entry.status || '-'} | provider=${entry.provider || '-'}`
    );
  }
}

/**
 * Log an age verification error (privacy-safe).
 *
 * @param {string} event
 * @param {Error|Object} error
 * @param {Object} context
 */
function logAgeVerificationError(event, error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    userId: maskUserId(context.userId),
    error: error?.message || String(error),
    // Never log stack traces with PII in production
    ...(process.env.NODE_ENV !== 'production' ? { stack: error?.stack } : {}),
  };

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify({ module: 'age_verification', ...entry }));
  } else {
    console.error(
      `[AgeVerification] ERROR ${event} | user=${entry.userId} | err=${entry.error}`
    );
  }
}

module.exports = {
  AGE_VERIFICATION_EVENTS,
  logAgeVerificationEvent,
  logAgeVerificationError,
  maskUserId,
};
