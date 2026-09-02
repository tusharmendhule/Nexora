/**
 * MockAgeVerificationProvider
 *
 * A deterministic, in-memory provider for development and testing.
 *
 * Behavior (configurable via constructor options):
 *  - By default, all verifications succeed with ADULT category.
 *  - Pass { failFor: ['user_id'] } to make specific users fail.
 *  - Pass { reviewFor: ['user_id'] } to make specific users require review.
 *  - Pass { available: false } to simulate provider unavailability.
 *
 * This provider stores nothing externally — the service layer persists
 * results in MongoDB via the AgeVerification model.
 */

const AgeVerificationProvider = require('./age-verification-provider');

class MockAgeVerificationProvider extends AgeVerificationProvider {
  /**
   * @param {Object} [opts]
   * @param {boolean}       [opts.available=true]  — Is the provider online?
   * @param {string[]}      [opts.failFor=[]]      — User IDs that should fail
   * @param {string[]}      [opts.reviewFor=[]]    — User IDs that need review
   * @param {string}        [opts.defaultCategory='ADULT'] — Default age category
   * @param {number}        [opts.latencyMs=50]    — Simulated network latency
   */
  constructor(opts = {}) {
    super();
    this._available = opts.available !== false;
    this._failFor = new Set(opts.failFor || []);
    this._reviewFor = new Set(opts.reviewFor || []);
    this._defaultCategory = opts.defaultCategory || 'ADULT';
    this._latencyMs = opts.latencyMs || 50;
    // In-memory store for reference → result mapping (test use)
    this._results = new Map();
  }

  get name() {
    return 'mock';
  }

  async initiate({ userId, referenceId }) {
    if (!this._available) {
      throw new Error('Mock provider is unavailable');
    }

    // Simulate network latency
    await this._delay();

    const providerReferenceId = `mock_ref_${referenceId || Date.now()}`;

    // Pre-compute the result based on user configuration
    if (this._failFor.has(userId)) {
      this._results.set(providerReferenceId, {
        status: 'FAILED',
        failureReason: 'Age verification failed: unable to confirm age',
      });
    } else if (this._reviewFor.has(userId)) {
      this._results.set(providerReferenceId, {
        status: 'REQUIRES_REVIEW',
        failureReason: null,
      });
    } else {
      this._results.set(providerReferenceId, {
        status: 'VERIFIED',
        ageCategory: this._defaultCategory,
      });
    }

    return { providerReferenceId };
  }

  async checkStatus({ providerReferenceId }) {
    if (!this._available) {
      throw new Error('Mock provider is unavailable');
    }

    await this._delay();

    const result = this._results.get(providerReferenceId);
    if (!result) {
      return { status: 'PENDING' };
    }

    return { ...result };
  }

  async isAvailable() {
    return this._available;
  }

  /**
   * (Test helper) Set a result for a specific provider reference.
   */
  setResult(providerReferenceId, result) {
    this._results.set(providerReferenceId, result);
  }

  /**
   * (Test helper) Reset all stored results.
   */
  reset() {
    this._results.clear();
  }

  async _delay() {
    if (this._latencyMs > 0) {
      return new Promise((resolve) => setTimeout(resolve, this._latencyMs));
    }
  }
}

module.exports = MockAgeVerificationProvider;
