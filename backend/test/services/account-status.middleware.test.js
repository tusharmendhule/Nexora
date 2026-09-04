/**
 * Account Status Enforcement Tests
 * ================================
 * Verifies that requireAuth enforces account status:
 *   - deleted    → 401 (no access at all)
 *   - suspended  → 403
 *   - restricted → 403
 *   - deactivated → allowed only on account-recovery endpoints
 *
 * Run with: npm test -- --testPathPatterns=account-status
 */

jest.mock('../../src/config/firebase', () => ({
  firebaseAuth: {
    verifyIdToken: jest.fn().mockRejectedValue(new Error('not a firebase token')),
  },
}));

jest.mock('../../src/utils/generateToken', () => ({
  verifyToken: jest.fn(),
  generateToken: jest.fn(),
}));

jest.mock('../../src/models/user.model', () => {
  const MockUser = function (data) {
    Object.assign(this, data);
  };
  MockUser.findById = jest.fn();
  MockUser.findOne = jest.fn();
  return MockUser;
});

const { verifyToken } = require('../../src/utils/generateToken');
const User = require('../../src/models/user.model');
const { requireAuth } = require('../../src/middleware/auth.middleware');

const buildUser = (overrides = {}) => ({
  _id: 'user_1',
  name: 'Test',
  username: 'testuser',
  email: 'test@example.com',
  isDisabled: false,
  accountStatus: 'active',
  ...overrides,
});

const makeReq = (path = '/api/v1/posts') => ({
  originalUrl: path,
  method: 'GET',
  headers: { authorization: 'Bearer some-token' },
});

describe('Auth middleware — account status enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockReturnValue({ id: 'user_1' });
  });

  it('should allow an active account through', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) => Promise.resolve(buildUser()).then(resolve);
      return chain;
    });

    const req = makeReq();
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user.accountStatus).toBe('active');
  });

  it('should reject a deleted account with 401', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'deleted' })).then(resolve);
      return chain;
    });

    const req = makeReq();
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('should reject a suspended account with 403', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'suspended' })).then(resolve);
      return chain;
    });

    const req = makeReq();
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it('should reject a restricted account with 403', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'restricted' })).then(resolve);
      return chain;
    });

    const req = makeReq();
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it('should block a deactivated account from normal API paths', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'deactivated' })).then(resolve);
      return chain;
    });

    const req = makeReq('/api/v1/posts');
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('deactivated'),
      })
    );
  });

  it('should allow a deactivated account to reactivate', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'deactivated' })).then(resolve);
      return chain;
    });

    const req = makeReq('/api/v1/users/me/reactivate');
    req.method = 'POST';
    const next = jest.fn();
    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user.accountStatus).toBe('deactivated');
  });

  it('should allow a deactivated account to view own profile (GET only)', async () => {
    User.findById.mockImplementation(() => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) =>
        Promise.resolve(buildUser({ accountStatus: 'deactivated' })).then(resolve);
      return chain;
    });

    // GET is allowed
    const getReq = makeReq('/api/v1/users/me');
    const getNext = jest.fn();
    await requireAuth(getReq, {}, getNext);
    expect(getNext).toHaveBeenCalledWith();

    // PATCH (edit) is blocked
    const patchReq = makeReq('/api/v1/users/me');
    patchReq.method = 'PATCH';
    const patchNext = jest.fn();
    await requireAuth(patchReq, {}, patchNext);
    expect(patchNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });
});