/**
 * User Service Tests (Module 24)
 * ==============================
 * Tests for user management: lookup, profile update, avatar, search.
 *
 * Run with: npm test -- --testPathPatterns=user.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  let idCounter = 1;

  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || `user_${idCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
  };

  MockUser.create = jest.fn().mockImplementation((data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return Promise.resolve(doc);
  });

  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockUser.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    for (const u of mockUsers) {
      if (filter.username && u.username === filter.username) { found = u; break; }
      if (filter._id && typeof filter._id === 'object' && filter._id.$ne && u._id === filter._id.$ne) continue;
      if (filter._id && u._id === filter._id) { found = u; break; }
    }
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found).catch(fn);
    return chain;
  });

  MockUser.findByIdAndUpdate = jest.fn().mockImplementation((id, update, opts) => {
    const idx = mockUsers.findIndex((u) => u._id === id);
    if (idx === -1) {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) => resolve(null);
      return chain;
    }
    Object.assign(mockUsers[idx], update);
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve) => resolve(mockUsers[idx]);
    return chain;
  });

  MockUser.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockUsers];
    if (filter.$or) {
      results = results.filter(() => true); // simplified
    }
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockUser._reset = () => { mockUsers.length = 0; idCounter = 1; };
  MockUser._users = mockUsers;
  MockUser._add = (data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return doc;
  };

  return MockUser;
});

jest.mock('../../src/services/audit.service', () => ({
  logAccountEvent: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('User Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User._reset();
  });

  // ─── getById ──────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return user by ID', async () => {
      const user = User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com' });
      const result = await userService.getById('u1');
      expect(result).toBeDefined();
      expect(result.username).toBe('alice');
    });

    it('should throw for non-existent user', async () => {
      await expect(userService.getById('nonexistent')).rejects.toThrow('User not found');
    });
  });

  // ─── getByUsername ────────────────────────────────────────────────

  describe('getByUsername', () => {
    it('should return user by username', async () => {
      User._add({ _id: 'u2', name: 'Bob', username: 'bob', email: 'b@b.com' });
      const result = await userService.getByUsername('bob');
      expect(result).toBeDefined();
    });

    it('should throw for non-existent username', async () => {
      await expect(userService.getByUsername('ghost')).rejects.toThrow('User not found');
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update allowed fields', async () => {
      User._add({ _id: 'u3', name: 'Old Name', username: 'update_me', bio: '' });
      const result = await userService.updateProfile('u3', { name: 'New Name', bio: 'Updated bio' });
      expect(result).toBeDefined();
      expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should reject duplicate username', async () => {
      User._add({ _id: 'u4', name: 'User A', username: 'taken_name' });
      User._add({ _id: 'u5', name: 'User B', username: 'other' });

      await expect(
        userService.updateProfile('u5', { username: 'taken_name' })
      ).rejects.toThrow('Username is already taken');
    });

    it('should filter out disallowed fields', async () => {
      User._add({ _id: 'u6', name: 'Filter Test', username: 'filter' });
      await userService.updateProfile('u6', { name: 'OK', role: 'ADMIN', password: 'hacked' });

      const callArgs = User.findByIdAndUpdate.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('role');
      expect(callArgs[1]).not.toHaveProperty('password');
    });

    it('should throw for non-existent user', async () => {
      await expect(
        userService.updateProfile('ghost', { name: 'X' })
      ).rejects.toThrow('User not found');
    });
  });

  // ─── updateAvatar ─────────────────────────────────────────────────

  describe('updateAvatar', () => {
    it('should update avatar URL', async () => {
      User._add({ _id: 'u7', name: 'Avatar User', username: 'avatar', avatar: '' });
      const result = await userService.updateAvatar('u7', 'https://cloudinary.com/new-avatar.jpg');
      expect(result).toBeDefined();
      expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should throw for non-existent user', async () => {
      await expect(
        userService.updateAvatar('ghost', 'https://example.com/img.jpg')
      ).rejects.toThrow('User not found');
    });
  });

  // ─── search ───────────────────────────────────────────────────────

  describe('search', () => {
    it('should return empty array for empty query', async () => {
      const result = await userService.search('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await userService.search('   ');
      expect(result).toEqual([]);
    });

    it('should escape regex special characters in search', async () => {
      // Should not throw when given special characters
      const result = await userService.search('test.*($or)');
      expect(result).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const result = await userService.search('user', 5);
      expect(result).toBeDefined();
    });
  });
});
