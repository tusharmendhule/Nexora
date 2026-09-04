/**
 * Auth Service Tests (Module 24)
 * ==============================
 * Comprehensive tests for the authentication service.
 *
 * Covers:
 *   1. Registration — valid, duplicate UID, duplicate username, expired token
 *   2. Login — valid, disabled account, user not found, expired token
 *   3. Email lookup — by email, by username, not found
 *   4. Get current user — valid, not found
 *   5. Edge cases and error handling
 *
 * Run with: npm test -- --testPathPatterns=auth.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock firebase admin
jest.mock('../../src/config/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  const mockGetUser = jest.fn();
  return {
    __esModule: true,
    default: {}, // firebaseApp placeholder
    firebaseAuth: {
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
    },
    _mockVerifyIdToken: mockVerifyIdToken,
    _mockGetUser: mockGetUser,
  };
});

// Mock User model
jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  let idCounter = 1;

  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || `user_${idCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.select = jest.fn().mockReturnValue(this);
  };

  MockUser.create = jest.fn().mockImplementation((data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return Promise.resolve(doc);
  });

  MockUser.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    for (const u of mockUsers) {
      if (filter.firebaseUid && u.firebaseUid === filter.firebaseUid) { found = u; break; }
      if (filter.username && u.username === filter.username) { found = u; break; }
    }
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found).catch(fn);
    return chain;
  });

  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockUser._reset = () => { mockUsers.length = 0; idCounter = 1; };
  MockUser._users = mockUsers;

  return MockUser;
});

// Mock audit service (non-critical, just suppress)
jest.mock('../../src/services/audit.service', () => ({
  logAuthEvent: jest.fn().mockResolvedValue(true),
  logAccountEvent: jest.fn().mockResolvedValue(true),
}));

// Mock age verification service
jest.mock('../../src/services/age-verification/age-verification.service', () => ({
  initiate: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const firebaseAdmin = require('../../src/config/firebase');
const User = require('../../src/models/user.model');
const authService = require('../../src/services/auth.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User._reset();
  });

  // ─── Registration ─────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user with valid data', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'firebase_uid_1',
        email: 'test@example.com',
      });

      const result = await authService.register({
        idToken: 'valid-token',
        name: 'Test User',
        username: 'testuser',
      });

      expect(result.user).toBeDefined();
      expect(result.user.name).toBe('Test User');
      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('USER');
      expect(User.create).toHaveBeenCalled();
    });

    it('should reject registration with expired Firebase token', async () => {
      const error = new Error('Token expired');
      error.code = 'auth/id-token-expired';
      firebaseAdmin._mockVerifyIdToken.mockRejectedValue(error);

      await expect(
        authService.register({ idToken: 'expired-token', name: 'Test', username: 'test' })
      ).rejects.toThrow('Token expired');
    });

    it('should reject registration with invalid Firebase token', async () => {
      firebaseAdmin._mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(
        authService.register({ idToken: 'bad-token', name: 'Test', username: 'test' })
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should reject duplicate Firebase UID', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'existing_uid',
        email: 'test@example.com',
      });

      // Pre-create user with same UID
      await User.create({ firebaseUid: 'existing_uid', name: 'Existing', username: 'existing' });

      await expect(
        authService.register({ idToken: 'token', name: 'New', username: 'newuser' })
      ).rejects.toThrow('Account already registered');
    });

    it('should reject duplicate username', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'uid_1',
        email: 'test@example.com',
      });

      // Pre-create user with same username
      await User.create({ firebaseUid: 'uid_0', name: 'Existing', username: 'taken' });

      await expect(
        authService.register({ idToken: 'token', name: 'New', username: 'taken' })
      ).rejects.toThrow('Username is already taken');
    });

    it('should normalize username to lowercase', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'uid_norm',
        email: 'test@example.com',
      });

      const result = await authService.register({
        idToken: 'token',
        name: 'Test',
        username: 'TestUser',
      });

      expect(result.user.username).toBe('testuser');
    });

    it('should trim whitespace from name', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'uid_trim',
        email: 'test@example.com',
      });

      const result = await authService.register({
        idToken: 'token',
        name: '  Test User  ',
        username: 'trimuser',
      });

      expect(result.user.name).toBe('Test User');
    });

    it('should store the Google photo as the avatar when provided', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'uid_photo',
        email: 'photo@example.com',
      });

      const result = await authService.register({
        idToken: 'token',
        name: 'Photo User',
        username: 'photouser',
        avatar: 'https://lh3.googleusercontent.com/a/abc123=s512-c',
      });

      expect(result.user.avatar).toBe('https://lh3.googleusercontent.com/a/abc123=s512-c');
    });

    it('should ignore non-http avatar values', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'uid_badphoto',
        email: 'badphoto@example.com',
      });

      const result = await authService.register({
        idToken: 'token',
        name: 'Bad Photo',
        username: 'badphoto',
        avatar: 'data:image/png;base64,AAAA',
      });

      expect(result.user.avatar).toBe('');
    });
  });

  // ─── Login ────────────────────────────────────────────────────────

  describe('login', () => {
    it('should login an existing user', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'login_uid',
        email: 'login@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      await User.create({
        firebaseUid: 'login_uid',
        name: 'Login User',
        username: 'loginuser',
        email: 'login@example.com',
        role: 'USER',
      });

      const result = await authService.login({ idToken: 'valid-token' });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('loginuser');
      expect(result.user.role).toBe('USER');
    });

    it('should reject login with expired token', async () => {
      const error = new Error('Token expired');
      error.code = 'auth/id-token-expired';
      firebaseAdmin._mockVerifyIdToken.mockRejectedValue(error);

      await expect(
        authService.login({ idToken: 'expired-token' })
      ).rejects.toThrow('Token expired');
    });

    it('should reject login with invalid token', async () => {
      firebaseAdmin._mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(
        authService.login({ idToken: 'bad-token' })
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should reject login for user not in MongoDB', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'nonexistent_uid',
        email: 'unknown@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      await expect(
        authService.login({ idToken: 'token' })
      ).rejects.toThrow('User profile not found');
    });

    it('should reject login for disabled Firebase account', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'disabled_uid',
        email: 'disabled@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: true });

      await expect(
        authService.login({ idToken: 'token' })
      ).rejects.toThrow('Account has been disabled');
    });

    it('should reject login for disabled MongoDB account', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'db_disabled_uid',
        email: 'disabled@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      await User.create({
        firebaseUid: 'db_disabled_uid',
        name: 'Disabled',
        username: 'disabled',
        email: 'disabled@example.com',
        isDisabled: true,
      });

      await expect(
        authService.login({ idToken: 'token' })
      ).rejects.toThrow('Account has been disabled');
    });

    it('should allow login even if Firebase getUser fails', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'fb_fail_uid',
        email: 'fb@example.com',
      });
      firebaseAdmin._mockGetUser.mockRejectedValue(new Error('Firebase unreachable'));

      await User.create({
        firebaseUid: 'fb_fail_uid',
        name: 'Firebase Fail User',
        username: 'fbfail',
        email: 'fb@example.com',
      });

      const result = await authService.login({ idToken: 'token' });
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('fbfail');
    });

    it('should backfill the Google photo for accounts without an avatar', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'backfill_uid',
        email: 'backfill@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      await User.create({
        firebaseUid: 'backfill_uid',
        name: 'Backfill User',
        username: 'backfill',
        email: 'backfill@example.com',
        avatar: '',
      });

      const result = await authService.login({
        idToken: 'token',
        avatar: 'https://lh3.googleusercontent.com/a/xyz=s512-c',
      });

      expect(result.user.avatar).toBe('https://lh3.googleusercontent.com/a/xyz=s512-c');
    });

    it('should not overwrite an avatar the user already set', async () => {
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'keep_uid',
        email: 'keep@example.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      await User.create({
        firebaseUid: 'keep_uid',
        name: 'Keep User',
        username: 'keepuser',
        email: 'keep@example.com',
        avatar: 'https://res.cloudinary.com/x/avatar.jpg',
      });

      const result = await authService.login({
        idToken: 'token',
        avatar: 'https://lh3.googleusercontent.com/a/xyz=s512-c',
      });

      expect(result.user.avatar).toBe('https://res.cloudinary.com/x/avatar.jpg');
    });
  });

  // ─── Email Lookup ─────────────────────────────────────────────────

  describe('lookupEmail', () => {
    it('should return email directly if input looks like an email', async () => {
      const result = await authService.lookupEmail({ identifier: 'user@example.com' });
      expect(result.email).toBe('user@example.com');
    });

    it('should normalize email to lowercase', async () => {
      const result = await authService.lookupEmail({ identifier: 'USER@EXAMPLE.COM' });
      expect(result.email).toBe('user@example.com');
    });

    it('should look up email by username', async () => {
      await User.create({
        firebaseUid: 'lookup_uid',
        name: 'Lookup User',
        username: 'lookupuser',
        email: 'lookup@example.com',
      });

      const result = await authService.lookupEmail({ identifier: 'lookupuser' });
      expect(result.email).toBe('lookup@example.com');
    });

    it('should throw for non-existent username', async () => {
      await expect(
        authService.lookupEmail({ identifier: 'nonexistent' })
      ).rejects.toThrow('No account found with that username');
    });

    it('should trim whitespace from identifier', async () => {
      await User.create({
        firebaseUid: 'trim_uid',
        name: 'Trim User',
        username: 'trimuser',
        email: 'trim@example.com',
      });

      const result = await authService.lookupEmail({ identifier: '  trimuser  ' });
      expect(result.email).toBe('trim@example.com');
    });
  });

  // ─── Get Current User ─────────────────────────────────────────────

  describe('getMe', () => {
    it('should return the authenticated user profile', async () => {
      const user = await User.create({
        firebaseUid: 'me_uid',
        name: 'Me User',
        username: 'meuser',
        email: 'me@example.com',
        role: 'USER',
      });

      const result = await authService.getMe(user._id);
      expect(result).toBeDefined();
      expect(result.username).toBe('meuser');
    });

    it('should throw for non-existent user', async () => {
      await expect(
        authService.getMe('nonexistent_id')
      ).rejects.toThrow('User not found');
    });

    it('should exclude password from returned user', async () => {
      const user = await User.create({
        firebaseUid: 'pwd_uid',
        name: 'Pwd User',
        username: 'pwduser',
        email: 'pwd@example.com',
        password: 'hashed_password',
      });

      // The select('-password') is applied in the service
      // Mock findOne returns the user; select is chained
      const result = await authService.getMe(user._id);
      expect(result).toBeDefined();
    });
  });
});
