/**
 * Age Verification Service Tests (Module 18)
 * ===========================================
 * Comprehensive tests for the privacy-preserving age assurance system.
 *
 * Covers:
 *   1. Successful verification
 *   2. Failed verification
 *   3. Provider unavailable
 *   4. Retry logic
 *   5. Invalid response handling
 *   6. Account creation after verification
 *   7. Provider abstraction (swappability)
 *   8. Privacy-conscious logging
 *   9. Age gate middleware
 *  10. Edge cases and boundary conditions
 *
 * Run with: npm test -- --testPathPatterns=age-verification
 */

// ─── Constants (exported from mock so imports work) ──────────────────

const AGE_VERIFICATION_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
};

const AGE_CATEGORY = {
  ADULT: 'ADULT',
  TEEN: 'TEEN',
  MINOR: 'MINOR',
  UNKNOWN: 'UNKNOWN',
};

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock the AgeVerification model (avoid real MongoDB)
jest.mock('../../src/models/age-verification.model', () => {
  const MockDoc = function (data) {
    Object.assign(this, data);
    this._id = 'mock_av_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    this.save = jest.fn().mockResolvedValue(this);
  };
  MockDoc.prototype.isValid = function () {
    if (this.status !== 'VERIFIED') return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
  };
  MockDoc.prototype.canRetry = function () {
    if (this.status === 'VERIFIED') return false;
    if (this.status === 'REQUIRES_REVIEW') return false;
    return this.attemptCount < this.maxAttempts;
  };

  // Chainable query mock: .findOne({...}).sort({...}) returns a thenable
  const createChainable = (resolveWith) => {
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => {
      return Promise.resolve(resolveWith).then(resolve, reject);
    };
    chain.catch = (fn) => {
      return Promise.resolve(resolveWith).catch(fn);
    };
    return chain;
  };

  const mockFindOne = jest.fn().mockImplementation(() => createChainable(null));
  const mockCreate = jest.fn();
  const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});

  MockDoc.findOne = mockFindOne;
  MockDoc.create = mockCreate;
  MockDoc.findByIdAndUpdate = mockFindByIdAndUpdate;

  // Export constants alongside the mock model
  MockDoc.AGE_VERIFICATION_STATUS = AGE_VERIFICATION_STATUS;
  MockDoc.AGE_CATEGORY = AGE_CATEGORY;

  return MockDoc;
});

// Mock the User model
jest.mock('../../src/models/user.model', () => {
  const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
  return { findByIdAndUpdate: mockFindByIdAndUpdate };
});

// Mock the provider factory
jest.mock('../../src/services/age-verification/age-verification-provider.factory', () => {
  const mockProvider = {
    name: 'mock',
    initiate: jest.fn(),
    checkStatus: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
  };

  return {
    getProvider: jest.fn().mockResolvedValue(mockProvider),
    resetProvider: jest.fn(),
  };
});

// ─── Imports ──────────────────────────────────────────────────────────

const AgeVerification = require('../../src/models/age-verification.model');
const User = require('../../src/models/user.model');
const { getProvider } = require('../../src/services/age-verification/age-verification-provider.factory');
const ageVerificationService = require('../../src/services/age-verification/age-verification.service');
const { requireAgeVerification, requireAdult } = require('../../src/middleware/age-gate.middleware');

// Get reference to the mocked provider
const mockProvider = {
  name: 'mock',
  initiate: jest.fn(),
  checkStatus: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
};

// Helper: make findOne resolve with a specific doc
function mockFindOneWith(doc) {
  AgeVerification.findOne.mockImplementation(() => {
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => {
      return Promise.resolve(doc).then(resolve, reject);
    };
    chain.catch = (fn) => {
      return Promise.resolve(doc).catch(fn);
    };
    return chain;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Age Verification Service (Module 18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);
    mockProvider.initiate.mockResolvedValue({
      providerReferenceId: 'mock_ref_123',
    });
    mockProvider.checkStatus.mockResolvedValue({
      status: 'PENDING',
    });
    // Default: findOne resolves with null
    mockFindOneWith(null);
  });

  // ─── 1. Successful Verification ──────────────────────────────────

  describe('Successful verification', () => {
    it('should initiate verification and create a PENDING record', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);

      const result = await ageVerificationService.initiate({ userId: 'user_123' });

      expect(result.status).toBe('PENDING');
      expect(result.verificationId).toBeDefined();
      expect(result.providerReferenceId).toBe('mock_ref_123');
      expect(mockProvider.initiate).toHaveBeenCalledWith({
        userId: 'user_123',
        referenceId: expect.any(String),
      });
    });

    it('should process a successful provider result and update user', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_123',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'VERIFIED',
        ageCategory: 'ADULT',
      });

      const result = await ageVerificationService.getStatus({ userId: 'user_123' });

      expect(result.status).toBe('VERIFIED');
      expect(result.ageCategory).toBe('ADULT');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_123', {
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'ADULT',
      });
    });

    it('should set expiry date 1 year from now on successful verification', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_123',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'VERIFIED',
        ageCategory: 'ADULT',
      });

      await ageVerificationService.getStatus({ userId: 'user_123' });

      expect(mockDoc.expiresAt).toBeDefined();
      const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(mockDoc.expiresAt.getTime() - oneYearFromNow.getTime());
      expect(diff).toBeLessThan(1000);
    });

    it('should return existing verified status if already verified', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        provider: 'mock',
        providerReferenceId: 'mock_ref_123',
        attemptCount: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.initiate({ userId: 'user_123' });

      expect(result.status).toBe('VERIFIED');
      expect(result.ageCategory).toBe('ADULT');
      expect(mockProvider.initiate).not.toHaveBeenCalled();
    });

    it('should verify isVerified returns true for valid verified record', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.isVerified('user_123');
      expect(result).toBe(true);
    });

    it('should return correct age category', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'VERIFIED',
        ageCategory: 'TEEN',
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.getAgeCategory('user_123');
      expect(result).toBe('TEEN');
    });
  });

  // ─── 2. Failed Verification ──────────────────────────────────────

  describe('Failed verification', () => {
    it('should process a FAILED provider result and update user', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_456',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_456',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'FAILED',
        failureReason: 'Unable to confirm age from provided data',
      });

      const result = await ageVerificationService.getStatus({ userId: 'user_456' });

      expect(result.status).toBe('FAILED');
      expect(mockDoc.failureReason).toBe('Unable to confirm age from provided data');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_456', {
        ageVerificationStatus: 'FAILED',
      });
    });

    it('should not set ageCategory on failed verification', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_456',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_456',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'FAILED',
        failureReason: 'Age could not be determined',
      });

      await ageVerificationService.getStatus({ userId: 'user_456' });

      expect(mockDoc.ageCategory).toBeFalsy();
    });

    it('should process REQUIRES_REVIEW status', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_789',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_789',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'REQUIRES_REVIEW',
      });

      const result = await ageVerificationService.getStatus({ userId: 'user_789' });

      expect(result.status).toBe('REQUIRES_REVIEW');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_789', {
        ageVerificationStatus: 'REQUIRES_REVIEW',
      });
    });

    it('should mark isVerified as false for failed record', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_456',
        status: 'FAILED',
        provider: 'mock',
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.isVerified('user_456');
      expect(result).toBe(false);
    });

    it('should return null ageCategory for unverified user', async () => {
      mockFindOneWith(null);

      const result = await ageVerificationService.getAgeCategory('user_nobody');
      expect(result).toBeNull();
    });
  });

  // ─── 3. Provider Unavailable ─────────────────────────────────────

  describe('Provider unavailable', () => {
    it('should throw when provider is unavailable during initiate', async () => {
      mockProvider.isAvailable.mockResolvedValue(false);
      mockFindOneWith(null);

      await expect(
        ageVerificationService.initiate({ userId: 'user_123' })
      ).rejects.toThrow('Age verification provider is currently unavailable');
    });

    it('should throw when provider is unavailable during retry', async () => {
      mockProvider.isAvailable.mockResolvedValue(false);

      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'FAILED',
        provider: 'mock',
        providerReferenceId: 'mock_ref_123',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      await expect(
        ageVerificationService.retry({ userId: 'user_123' })
      ).rejects.toThrow('Age verification provider is currently unavailable');
    });

    it('should still allow getStatus when provider is unavailable', async () => {
      mockProvider.isAvailable.mockResolvedValue(false);
      mockProvider.checkStatus.mockRejectedValue(new Error('Provider down'));

      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_123',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.getStatus({ userId: 'user_123' });
      expect(result.status).toBe('PENDING');
    });

    it('should handle provider.initiate throwing an error', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);
      mockProvider.initiate.mockRejectedValue(new Error('Network timeout'));

      await expect(
        ageVerificationService.initiate({ userId: 'user_123' })
      ).rejects.toThrow('Failed to initiate age verification');

      expect(mockDoc.status).toBe('FAILED');
      expect(mockDoc.failureReason).toBe('Provider initiation failed');
    });
  });

  // ─── 4. Retry Logic ──────────────────────────────────────────────

  describe('Retry logic', () => {
    it('should allow retry after failed verification', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_retry',
        status: 'FAILED',
        provider: 'mock',
        providerReferenceId: 'mock_ref_old',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_retry',
      });

      const result = await ageVerificationService.retry({ userId: 'user_retry' });

      expect(result.status).toBe('PENDING');
      expect(result.providerReferenceId).toBe('mock_ref_retry');
      expect(mockDoc.attemptCount).toBe(2);
      expect(mockDoc.failureReason).toBeNull();
    });

    it('should reject retry when max attempts exceeded', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_maxed',
        status: 'FAILED',
        provider: 'mock',
        providerReferenceId: 'mock_ref_old',
        attemptCount: 3,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      await expect(
        ageVerificationService.retry({ userId: 'user_maxed' })
      ).rejects.toThrow('Maximum retry attempts (3) exceeded');
    });

    it('should reject retry when verification is already verified', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_done',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      await expect(
        ageVerificationService.retry({ userId: 'user_done' })
      ).rejects.toThrow('Verification already completed');
    });

    it('should reject retry when status is REQUIRES_REVIEW', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_review',
        status: 'REQUIRES_REVIEW',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      await expect(
        ageVerificationService.retry({ userId: 'user_review' })
      ).rejects.toThrow('Verification requires manual review');
    });

    it('should throw when no verification record exists for retry', async () => {
      mockFindOneWith(null);

      await expect(
        ageVerificationService.retry({ userId: 'user_none' })
      ).rejects.toThrow('No verification record found');
    });

    it('should allow retry from PENDING status', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_pending',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_old',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_new',
      });

      const result = await ageVerificationService.retry({ userId: 'user_pending' });

      expect(result.status).toBe('PENDING');
      expect(mockDoc.attemptCount).toBe(2);
    });

    it('should report canRetry correctly based on attempt count', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_retryable',
        status: 'FAILED',
        provider: 'mock',
        attemptCount: 2,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.getStatus({ userId: 'user_retryable' });
      expect(result.canRetry).toBe(true);
    });

    it('should report canRetry as false when max attempts reached', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_no_retry',
        status: 'FAILED',
        provider: 'mock',
        attemptCount: 3,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.getStatus({ userId: 'user_no_retry' });
      expect(result.canRetry).toBe(false);
    });
  });

  // ─── 5. Invalid Response Handling ────────────────────────────────

  describe('Invalid response handling', () => {
    it('should handle provider returning unknown status gracefully', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_unknown',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_unknown',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'INVALID_STATUS',
      });

      const result = await ageVerificationService.getStatus({ userId: 'user_unknown' });
      expect(result.status).toBe('INVALID_STATUS');
    });

    it('should handle provider returning null response', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_null',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_null',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue(null);

      const result = await ageVerificationService.getStatus({ userId: 'user_null' });
      expect(result).toBeDefined();
    });

    it('should handle missing userId parameter', async () => {
      await expect(
        ageVerificationService.initiate({ userId: null })
      ).rejects.toThrow('userId is required');
    });

    it('should handle missing userId in getStatus', async () => {
      await expect(
        ageVerificationService.getStatus({ userId: null })
      ).rejects.toThrow('userId is required');
    });

    it('should handle missing userId in retry', async () => {
      await expect(
        ageVerificationService.retry({ userId: null })
      ).rejects.toThrow('userId is required');
    });

    it('should handle provider.checkStatus throwing an error', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_err',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_err',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockRejectedValue(new Error('Connection refused'));

      const result = await ageVerificationService.getStatus({ userId: 'user_err' });
      expect(result.status).toBe('PENDING');
    });

    it('should handle VERIFIED status with null ageCategory', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_no_cat',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_no_cat',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'VERIFIED',
        ageCategory: null,
      });

      await ageVerificationService.getStatus({ userId: 'user_no_cat' });

      expect(mockDoc.ageCategory).toBe(AGE_CATEGORY.UNKNOWN);
    });
  });

  // ─── 6. Account Creation After Verification ──────────────────────

  describe('Account creation after verification', () => {
    it('should not block registration when age verification initiation fails', async () => {
      mockProvider.isAvailable.mockResolvedValue(false);
      mockFindOneWith(null);

      await expect(
        ageVerificationService.initiate({ userId: 'user_new' })
      ).rejects.toThrow();
    });

    it('should allow isVerified to return false for new users', async () => {
      mockFindOneWith(null);

      const result = await ageVerificationService.isVerified('user_new');
      expect(result).toBe(false);
    });

    it('should allow getAgeCategory to return null for new users', async () => {
      mockFindOneWith(null);

      const result = await ageVerificationService.getAgeCategory('user_new');
      expect(result).toBeNull();
    });

    it('should process initiate and verify a new user successfully', async () => {
      // Step 1: initiate
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_fresh',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_fresh',
      });

      const initResult = await ageVerificationService.initiate({ userId: 'user_fresh' });
      expect(initResult.status).toBe('PENDING');

      // Step 2: poll → verified
      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({
        status: 'VERIFIED',
        ageCategory: 'ADULT',
      });

      const statusResult = await ageVerificationService.getStatus({ userId: 'user_fresh' });
      expect(statusResult.status).toBe('VERIFIED');
      expect(statusResult.ageCategory).toBe('ADULT');

      // Step 3: isVerified should return true
      mockFindOneWith(mockDoc);
      const verified = await ageVerificationService.isVerified('user_fresh');
      expect(verified).toBe(true);
    });
  });

  // ─── 7. Provider Abstraction ─────────────────────────────────────

  describe('Provider abstraction', () => {
    it('should use the provider returned by the factory', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_prov',
        status: 'PENDING',
        provider: 'custom_provider',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);

      const customProvider = {
        name: 'custom_provider',
        initiate: jest.fn().mockResolvedValue({
          providerReferenceId: 'custom_ref_1',
        }),
        checkStatus: jest.fn(),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      getProvider.mockResolvedValue(customProvider);

      const result = await ageVerificationService.initiate({ userId: 'user_prov' });

      expect(result.providerReferenceId).toBe('custom_ref_1');
      expect(customProvider.initiate).toHaveBeenCalled();
      expect(mockDoc.provider).toBe('custom_provider');
    });

    it('should store provider name in the verification record', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_name',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);

      await ageVerificationService.initiate({ userId: 'user_name' });

      expect(mockDoc.provider).toBe('mock');
    });
  });

  // ─── 8. Privacy-Conscious Logging ────────────────────────────────

  describe('Privacy-conscious logging', () => {
    it('should export all required logging events', () => {
      const {
        AGE_VERIFICATION_EVENTS,
      } = require('../../src/services/age-verification/age-verification-logger');

      expect(AGE_VERIFICATION_EVENTS.INITIATED).toBe('age_verify.initiated');
      expect(AGE_VERIFICATION_EVENTS.VERIFIED).toBe('age_verify.verified');
      expect(AGE_VERIFICATION_EVENTS.FAILED).toBe('age_verify.failed');
      expect(AGE_VERIFICATION_EVENTS.RETRY).toBe('age_verify.retry');
      expect(AGE_VERIFICATION_EVENTS.PROVIDER_ERROR).toBe('age_verify.provider_error');
      expect(AGE_VERIFICATION_EVENTS.PROVIDER_UNAVAILABLE).toBe('age_verify.provider_unavailable');
      expect(AGE_VERIFICATION_EVENTS.REVIEW_REQUIRED).toBe('age_verify.review_required');
    });

    it('should mask user IDs in production', () => {
      const { maskUserId } = require('../../src/services/age-verification/age-verification-logger');
      const originalEnv = process.env.NODE_ENV;

      process.env.NODE_ENV = 'production';
      const masked = maskUserId('1234567890abcdef');
      process.env.NODE_ENV = originalEnv;

      expect(masked).toContain('cdef');
      expect(masked).not.toBe('1234567890abcdef');
      expect(masked.startsWith('*')).toBe(true);
    });

    it('should show full user IDs in development', () => {
      const { maskUserId } = require('../../src/services/age-verification/age-verification-logger');
      const originalEnv = process.env.NODE_ENV;

      process.env.NODE_ENV = 'development';
      const masked = maskUserId('1234567890abcdef');
      process.env.NODE_ENV = originalEnv;

      expect(masked).toBe('1234567890abcdef');
    });

    it('should handle null user ID gracefully', () => {
      const { maskUserId } = require('../../src/services/age-verification/age-verification-logger');
      expect(maskUserId(null)).toBe('[null]');
      expect(maskUserId(undefined)).toBe('[null]');
    });
  });

  // ─── 9. Age Gate Middleware ───────────────────────────────────────

  describe('Age gate middleware', () => {
    it('should block access when no verification exists', async () => {
      mockFindOneWith(null);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGE_VERIFICATION_REQUIRED',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access when verified and not expired', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });

      mockFindOneWith(mockDoc);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.userAgeVerification).toBeDefined();
      expect(req.userAgeVerification.ageCategory).toBe('ADULT');
    });

    it('should block access when verification is expired', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        verifiedAt: new Date(Date.now() - 86400000 * 2),
        expiresAt: new Date(Date.now() - 86400000),
      });

      mockFindOneWith(mockDoc);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGE_VERIFICATION_EXPIRED',
        })
      );
    });

    it('should block access when status is PENDING', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'PENDING',
        provider: 'mock',
      });

      mockFindOneWith(mockDoc);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGE_VERIFICATION_PENDING',
        })
      );
    });

    it('should block access when status is FAILED', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'FAILED',
        provider: 'mock',
        attemptCount: 3,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGE_VERIFICATION_FAILED',
          data: expect.objectContaining({ canRetry: false }),
        })
      );
    });

    it('should block access when status is REQUIRES_REVIEW', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_123',
        status: 'REQUIRES_REVIEW',
        provider: 'mock',
      });

      mockFindOneWith(mockDoc);

      const req = { user: { _id: 'user_123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGE_VERIFICATION_REQUIRES_REVIEW',
        })
      );
    });

    it('should return 401 when user is not authenticated', async () => {
      const req = { user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requireAgeVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ─── 10. requireAdult Middleware ──────────────────────────────────

  describe('requireAdult middleware', () => {
    it('should allow ADULT users', () => {
      const req = {
        userAgeVerification: { ageCategory: 'ADULT', status: 'VERIFIED' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdult(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block TEEN users', () => {
      const req = {
        userAgeVerification: { ageCategory: 'TEEN', status: 'VERIFIED' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdult(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AGE_RESTRICTED' })
      );
    });

    it('should block users without age verification info', () => {
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdult(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AGE_VERIFICATION_REQUIRED' })
      );
    });
  });

  // ─── 11. Edge Cases ─────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should return NOT_STARTED for users with no verification', async () => {
      mockFindOneWith(null);

      const result = await ageVerificationService.getStatus({ userId: 'new_user' });
      expect(result.status).toBe('NOT_STARTED');
    });

    it('should handle expired verification in getStatus', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_expired',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
        provider: 'mock',
        providerReferenceId: 'mock_ref_exp',
        attemptCount: 1,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() - 86400000),
      });

      mockFindOneWith(mockDoc);

      const result = await ageVerificationService.getStatus({ userId: 'user_expired' });

      expect(result.status).toBe('FAILED');
      expect(mockDoc.failureReason).toBe('Verification expired');
    });

    it('should handle provider returning PENDING on checkStatus', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_still_pending',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_still',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({ status: 'PENDING' });

      const result = await ageVerificationService.getStatus({ userId: 'user_still_pending' });
      expect(result.status).toBe('PENDING');
    });

    it('should not re-initiate when existing PENDING verification is still pending', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_pending',
        status: 'PENDING',
        provider: 'mock',
        providerReferenceId: 'mock_ref_existing',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.checkStatus.mockResolvedValue({ status: 'PENDING' });

      const result = await ageVerificationService.initiate({ userId: 'user_pending' });

      expect(result.status).toBe('PENDING');
      expect(result.verificationId).toBeDefined();
      expect(mockProvider.initiate).not.toHaveBeenCalled();
    });

    it('should handle isVerified with null userId', async () => {
      const result = await ageVerificationService.isVerified(null);
      expect(result).toBe(false);
    });

    it('should handle getAgeCategory with null userId', async () => {
      const result = await ageVerificationService.getAgeCategory(null);
      expect(result).toBeNull();
    });

    it('should handle retry from provider.initiate throwing error', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_retry_err',
        status: 'FAILED',
        provider: 'mock',
        providerReferenceId: 'mock_ref_old',
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockFindOneWith(mockDoc);
      mockProvider.initiate.mockRejectedValue(new Error('Network error'));

      await expect(
        ageVerificationService.retry({ userId: 'user_retry_err' })
      ).rejects.toThrow('Failed to retry age verification');

      expect(mockDoc.status).toBe('FAILED');
      expect(mockDoc.failureReason).toBe('Provider retry failed');
    });
  });

  // ─── 12. Model Constants ─────────────────────────────────────────

  describe('Model constants', () => {
    it('should have all four verification statuses', () => {
      expect(Object.values(AGE_VERIFICATION_STATUS)).toEqual(
        expect.arrayContaining(['PENDING', 'VERIFIED', 'FAILED', 'REQUIRES_REVIEW'])
      );
    });

    it('should have all four age categories', () => {
      expect(Object.values(AGE_CATEGORY)).toEqual(
        expect.arrayContaining(['ADULT', 'TEEN', 'MINOR', 'UNKNOWN'])
      );
    });

    it('should have exactly 4 verification statuses', () => {
      expect(Object.keys(AGE_VERIFICATION_STATUS)).toHaveLength(4);
    });

    it('should have exactly 4 age categories', () => {
      expect(Object.keys(AGE_CATEGORY)).toHaveLength(4);
    });
  });

  // ─── 13. Immediate Provider Result (initiate settles directly) ────────

  describe('Immediate provider result', () => {
    it('should settle a VERIFIED result returned inline from initiate()', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_instant',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_instant',
        status: 'VERIFIED',
        ageCategory: 'ADULT',
      });

      const result = await ageVerificationService.initiate({ userId: 'user_instant' });

      expect(result.status).toBe('VERIFIED');
      expect(result.ageCategory).toBe('ADULT');
      expect(mockDoc.status).toBe('VERIFIED');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_instant', {
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'ADULT',
      });
    });

    it('should settle a FAILED result returned inline from initiate()', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_instant_fail',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_fail',
        status: 'FAILED',
        failureReason: 'Unable to confirm age',
      });

      const result = await ageVerificationService.initiate({ userId: 'user_instant_fail' });

      expect(result.status).toBe('FAILED');
      expect(mockDoc.status).toBe('FAILED');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_instant_fail', {
        ageVerificationStatus: 'FAILED',
      });
    });

    it('should keep PENDING when initiate() returns no terminal status', async () => {
      mockFindOneWith(null);
      const mockDoc = new AgeVerification({
        user: 'user_interactive',
        status: 'PENDING',
        provider: 'mock',
        attemptCount: 1,
        maxAttempts: 3,
      });
      AgeVerification.create.mockResolvedValue(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_session',
        sessionUrl: 'https://provider.example/session/xyz',
      });

      const result = await ageVerificationService.initiate({ userId: 'user_interactive' });

      expect(result.status).toBe('PENDING');
      expect(result.sessionUrl).toBe('https://provider.example/session/xyz');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should settle a VERIFIED result returned inline from retry()', async () => {
      const mockDoc = new AgeVerification({
        user: 'user_retry_instant',
        status: 'FAILED',
        provider: 'mock',
        providerReferenceId: 'mock_ref_old',
        attemptCount: 1,
        maxAttempts: 3,
        failureReason: 'First attempt failed',
      });

      mockFindOneWith(mockDoc);
      mockProvider.initiate.mockResolvedValue({
        providerReferenceId: 'mock_ref_retry_ok',
        status: 'VERIFIED',
        ageCategory: 'TEEN',
      });

      const result = await ageVerificationService.retry({ userId: 'user_retry_instant' });

      expect(result.status).toBe('VERIFIED');
      expect(result.ageCategory).toBe('TEEN');
      expect(mockDoc.attemptCount).toBe(2);
      expect(mockDoc.failureReason).toBeNull();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_retry_instant', {
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'TEEN',
      });
    });
  });
});
