/**
 * AgeVerificationProvider Factory
 *
 * Returns the active provider based on the AGE_VERIFICATION_PROVIDER
 * environment variable.
 *
 * Configuration rules (integrity / no fake verification):
 *  - No silent fallback: an unknown provider name is a hard error.
 *  - The "mock" (test) provider is ONLY usable where it cannot be mistaken
 *    for production verification:
 *      * NODE_ENV is not "production", OR
 *      * NODE_ENV === "production" AND AGE_VERIFICATION_TEST_MODE === "true"
 *        (explicit, loud opt-in — never for real users).
 *  - In production with no real provider configured, both
 *    assertProviderConfigured() (called at server startup) and
 *    getProvider() fail loudly instead of silently "verifying" users
 *    with a fake provider.
 *
 * Adding a new provider:
 *  1. Create a new provider class extending AgeVerificationProvider
 *  2. Import it here
 *  3. Add a case to the switch statement below and register its name in
 *     AVAILABLE_PROVIDERS
 */

const MockAgeVerificationProvider = require('./mock.provider');

let _instance = null;

/** Provider names that have a registered implementation. */
const AVAILABLE_PROVIDERS = ['mock'];

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function testModeExplicitlyEnabled() {
  return process.env.AGE_VERIFICATION_TEST_MODE === 'true';
}

/**
 * Validate the provider configuration without building a provider.
 *
 * Throws a descriptive Error when the active configuration would let a
 * mock/test provider act as production verification, or when the
 * configured provider is not implemented. Call once at server startup so
 * misconfiguration fails fast instead of degrading silently.
 */
function assertProviderConfigured() {
  const providerName = (process.env.AGE_VERIFICATION_PROVIDER || '')
    .trim()
    .toLowerCase();

  if (!providerName) {
    if (isProduction()) {
      throw new Error(
        '[AgeVerification] AGE_VERIFICATION_PROVIDER is not set. Production requires a real provider; the mock (test) provider is not allowed.'
      );
    }
    // Non-production: development default handled by getProvider().
    return;
  }

  if (providerName === 'mock') {
    if (isProduction() && !testModeExplicitlyEnabled()) {
      throw new Error(
        '[AgeVerification] The mock provider cannot be used as production verification. ' +
          'Configure a real provider via AGE_VERIFICATION_PROVIDER, or explicitly opt in to ' +
          'test mode with AGE_VERIFICATION_TEST_MODE=true (never for real users).'
      );
    }
    return;
  }

  if (!AVAILABLE_PROVIDERS.includes(providerName)) {
    throw new Error(
      `[AgeVerification] Unknown provider "${providerName}". Available providers: ${AVAILABLE_PROVIDERS.join(', ')}`
    );
  }
}

/**
 * Get or create the singleton provider instance.
 *
 * @returns {Promise<import('./age-verification-provider')>}
 */
async function getProvider() {
  if (_instance) return _instance;

  // Fail loudly on any configuration that could fake verification.
  assertProviderConfigured();

  const providerName = (process.env.AGE_VERIFICATION_PROVIDER || 'mock')
    .trim()
    .toLowerCase();

  if (providerName === '' || providerName === 'mock') {
    if (isProduction() && !testModeExplicitlyEnabled()) {
      // assertProviderConfigured above already rejected this; keep as a
      // defensive second gate.
      throw new Error(
        '[AgeVerification] mock provider is not allowed in production without AGE_VERIFICATION_TEST_MODE=true'
      );
    }
    _instance = new MockAgeVerificationProvider({
      available: process.env.AGE_VERIFICATION_MOCK_UNAVAILABLE !== 'true',
      failFor: (process.env.AGE_VERIFICATION_MOCK_FAIL_FOR || '')
        .split(',')
        .filter(Boolean),
      reviewFor: (process.env.AGE_VERIFICATION_MOCK_REVIEW_FOR || '')
        .split(',')
        .filter(Boolean),
      defaultCategory: process.env.AGE_VERIFICATION_MOCK_DEFAULT_CATEGORY || 'ADULT',
      latencyMs: parseInt(process.env.AGE_VERIFICATION_MOCK_LATENCY_MS || '0', 10),
    });
    if (isProduction()) {
      console.warn(
        '[AgeVerification] TEST MODE mock provider enabled explicitly ' +
          '(AGE_VERIFICATION_TEST_MODE=true). This must never be used for real users.'
      );
    }
  } else {
    switch (providerName) {
      // ─── Add new providers here ──────────────────────────
      // case 'veriff':
      //   const VeriffProvider = require('./veriff.provider');
      //   _instance = new VeriffProvider({ apiKey: process.env.AGE_ASSURANCE_API_KEY, ... });
      //   break;

      default:
        // assertProviderConfigured() rejects unknown names first; this is
        // unreachable unless a provider was added to AVAILABLE_PROVIDERS
        // without a factory case (or vice versa).
        throw new Error(
          `[AgeVerification] Unknown provider "${providerName}". Available providers: ${AVAILABLE_PROVIDERS.join(', ')}`
        );
    }
  }

  console.log(`[AgeVerification] Provider initialized: ${_instance.name}`);
  return _instance;
}

/**
 * Reset the singleton (useful in tests).
 */
function resetProvider() {
  _instance = null;
}

module.exports = { getProvider, resetProvider, assertProviderConfigured };
