/**
 * Age Verification Provider Factory Tests
 * =======================================
 * Verifies the integrity rules that keep the mock/test provider from ever
 * being mistaken for production verification:
 *   1. Development uses the mock provider by default
 *   2. Unknown provider names are a hard error (no silent mock fallback)
 *   3. Production refuses to start without a real provider
 *   4. Production refuses the mock provider unless AGE_VERIFICATION_TEST_MODE=true
 *   5. assertProviderConfigured() fails fast on bad configuration
 *
 * Run with: npm test -- --testPathPatterns=age-verification-provider.factory
 */

const { getProvider, resetProvider, assertProviderConfigured } =
  require('../../src/services/age-verification/age-verification-provider.factory');

// Snapshot the real environment once and restore it after every test.
const ORIGINAL_ENV = { ...process.env };

describe('AgeVerificationProvider factory', () => {
  afterEach(() => {
    resetProvider();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AGE_VERIFICATION_PROVIDER;
    delete process.env.AGE_VERIFICATION_TEST_MODE;
  });

  describe('development / test environments', () => {
    it('defaults to the mock provider when none is configured', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AGE_VERIFICATION_PROVIDER;

      const provider = await getProvider();
      expect(provider.name).toBe('mock');
    });

    it('allows an explicit mock provider outside production', async () => {
      process.env.NODE_ENV = 'development';
      process.env.AGE_VERIFICATION_PROVIDER = 'mock';

      const provider = await getProvider();
      expect(provider.name).toBe('mock');
    });

    it('throws on an unknown provider name instead of falling back to mock', async () => {
      process.env.NODE_ENV = 'development';
      process.env.AGE_VERIFICATION_PROVIDER = 'not-a-real-provider';

      await expect(getProvider()).rejects.toThrow(/Unknown provider/);
    });

    it('caches and reuses a single provider instance per process', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AGE_VERIFICATION_PROVIDER;

      const first = await getProvider();
      const second = await getProvider();
      expect(first).toBe(second);
    });
  });

  describe('production environment', () => {
    it('refuses to run without a configured provider', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AGE_VERIFICATION_PROVIDER;

      await expect(getProvider()).rejects.toThrow(
        /Production requires a real provider/
      );
    });

    it('refuses the mock provider without an explicit test-mode opt-in', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AGE_VERIFICATION_PROVIDER = 'mock';
      delete process.env.AGE_VERIFICATION_TEST_MODE;

      await expect(getProvider()).rejects.toThrow(
        /cannot be used as production verification/
      );
    });

    it('allows the mock provider only with an explicit AGE_VERIFICATION_TEST_MODE=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AGE_VERIFICATION_PROVIDER = 'mock';
      process.env.AGE_VERIFICATION_TEST_MODE = 'true';

      const provider = await getProvider();
      expect(provider.name).toBe('mock');
    });

    it('still rejects unknown providers in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AGE_VERIFICATION_PROVIDER = 'veriff'; // not implemented yet

      await expect(getProvider()).rejects.toThrow(/Unknown provider/);
    });
  });

  describe('assertProviderConfigured()', () => {
    it('passes for the development default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AGE_VERIFICATION_PROVIDER;
      expect(() => assertProviderConfigured()).not.toThrow();
    });

    it('throws when production has no provider configured', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AGE_VERIFICATION_PROVIDER;
      expect(() => assertProviderConfigured()).toThrow(
        /Production requires a real provider/
      );
    });

    it('throws when production uses mock without test mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.AGE_VERIFICATION_PROVIDER = 'mock';
      expect(() => assertProviderConfigured()).toThrow(/mock provider/);
    });

    it('passes when production explicitly opts into test mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.AGE_VERIFICATION_PROVIDER = 'mock';
      process.env.AGE_VERIFICATION_TEST_MODE = 'true';
      expect(() => assertProviderConfigured()).not.toThrow();
    });
  });
});
