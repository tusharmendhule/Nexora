/**
 * AgeVerificationProvider — Abstract Base Class
 *
 * All age-verification providers must extend this class and implement
 * the three lifecycle methods: initiate, checkStatus, and isAvailable.
 *
 * Design principles:
 *  - Providers never receive or store government IDs or biometrics directly;
 *    that responsibility belongs to the external service.
 *  - The provider returns only an opaque reference ID and a result category.
 *  - Providers are stateless — all persistence is handled by the service layer.
 *
 * To add a new provider:
 *  1. Create a file in this directory (e.g. jumio.provider.js)
 *  2. Extend AgeVerificationProvider
 *  3. Implement initiate(), checkStatus(), isAvailable()
 *  4. Register it in age-verification-provider.factory.js
 */
class AgeVerificationProvider {
  /**
   * Unique identifier for this provider (e.g. "mock", "jumio", "veriff").
   * @returns {string}
   */
  get name() {
    throw new Error('Provider must implement get name()');
  }

  /**
   * Initiate an age verification session.
   *
   * @param {Object} params
   * @param {string} params.userId       — MongoDB user _id (string)
   * @param {string} params.referenceId   — Opaque internal reference to attach
   *
   * @returns {Promise<{providerReferenceId: string, sessionUrl?: string}>}
   *   - providerReferenceId: Opaque ID from the external provider
   *   - sessionUrl: Optional URL to redirect the user to (for web flows)
   */
  async initiate({ userId, referenceId }) {
    throw new Error('Provider must implement initiate()');
  }

  /**
   * Check the status of an in-progress verification.
   *
   * @param {Object} params
   * @param {string} params.providerReferenceId — The reference ID from initiate()
   *
   * @returns {Promise<{
   *   status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REQUIRES_REVIEW',
   *   ageCategory?: 'ADULT' | 'TEEN' | 'MINOR' | 'UNKNOWN',
   *   failureReason?: string
   * }>}
   */
  async checkStatus({ providerReferenceId }) {
    throw new Error('Provider must implement checkStatus()');
  }

  /**
   * Whether this provider is currently available and configured.
   *
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('Provider must implement isAvailable()');
  }
}

module.exports = AgeVerificationProvider;
