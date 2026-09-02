/**
 * AgeVerificationProvider Factory
 *
 * Returns the active provider based on the AGE_VERIFICATION_PROVIDER
 * environment variable. Defaults to "mock" for development.
 *
 * Adding a new provider:
 *  1. Create a new provider class extending AgeVerificationProvider
 *  2. Import it here
 *  3. Add a case to the switch statement
 */

const MockAgeVerificationProvider = require('./mock.provider');

let _instance = null;

/**
 * Get or create the singleton provider instance.
 *
 * @returns {Promise<import('./age-verification-provider')>}
 */
async function getProvider() {
  if (_instance) return _instance;

  const providerName = (process.env.AGE_VERIFICATION_PROVIDER || 'mock').toLowerCase();

  switch (providerName) {
    case 'mock':
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
      break;

    // ─── Add new providers here ──────────────────────────
    // case 'jumio':
    //   const JumioProvider = require('./jumio.provider');
    //   _instance = new JumioProvider({ ... });
    //   break;

    default:
      console.warn(
        `[AgeVerification] Unknown provider "${providerName}", falling back to mock`
      );
      _instance = new MockAgeVerificationProvider();
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

module.exports = { getProvider, resetProvider };
