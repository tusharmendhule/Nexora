/**
 * Account Management Service Tests
 * =================================
 * Tests for phone/email updates, account history, deactivate/reactivate,
 * account deletion, and data export.
 *
 * Run with: npm test -- --testPathPatterns=account.service
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
    const found = mockUsers.find((u) => u._id === id) || null;
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found).catch(fn);
    return chain;
  });

  MockUser.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    for (const u of mockUsers) {
      if (filter.username && u.username === filter.username) { found = u; break; }
      if (filter.email && u.email === filter.email) { found = u; break; }
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

  MockUser.findByIdAndDelete = jest.fn().mockImplementation((id) => {
    const idx = mockUsers.findIndex((u) => u._id === id);
    if (idx !== -1) mockUsers.splice(idx, 1);
    return Promise.resolve(idx !== -1);
  });

  MockUser.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.lean = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve([]).catch(fn);
    return chain;
  });

  MockUser._reset = () => { mockUsers.length = 0; idCounter = 1; };
  MockUser._add = (data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return doc;
  };

  return MockUser;
});

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

jest.mock('../../src/services/audit.service', () => ({
  logAccountEvent: jest.fn().mockResolvedValue(true),
}));

// Generic mock factory for collection models used by delete/export.
// Named with a `mock` prefix so the jest.mock hoist plugin allows it.
const mockModelFactory = () => {
  const fn = jest.fn();
  fn.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  fn.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 0 });
  fn.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.lean = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
    chain.catch = (fn2) => Promise.resolve([]).catch(fn2);
    return chain;
  });
  fn.findOne = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.lean = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(null).then(resolve, reject);
    chain.catch = (fn2) => Promise.resolve(null).catch(fn2);
    return chain;
  });
  fn.countDocuments = jest.fn().mockResolvedValue(0);
  return fn;
};

jest.mock('../../src/models/post.model', () => mockModelFactory());
jest.mock('../../src/models/comment.model', () => mockModelFactory());
jest.mock('../../src/models/like.model', () => mockModelFactory());
jest.mock('../../src/models/saved-post.model', () => mockModelFactory());
jest.mock('../../src/models/follower.model', () => mockModelFactory());
jest.mock('../../src/models/conversation.model', () => mockModelFactory());
jest.mock('../../src/models/message.model', () => mockModelFactory());
jest.mock('../../src/models/notification.model', () => mockModelFactory());
jest.mock('../../src/models/reshare.model', () => mockModelFactory());
jest.mock('../../src/models/block.model', () => mockModelFactory());
jest.mock('../../src/models/settings.model', () => mockModelFactory());
jest.mock('../../src/models/activity.model', () => mockModelFactory());
jest.mock('../../src/models/highlight.model', () => mockModelFactory());
jest.mock('../../src/models/story.model', () => mockModelFactory());
jest.mock('../../src/models/report.model', () => mockModelFactory());

jest.mock('../../src/models/audit-log.model', () => {
  const AUDIT_EVENT_CATEGORY = { ACCOUNT: 'ACCOUNT', AUTH: 'AUTH' };
  const AUDIT_EVENT_TYPE = {
    PROFILE_UPDATED: 'PROFILE_UPDATED',
    PHONE_CHANGED: 'PHONE_CHANGED',
    EMAIL_CHANGED: 'EMAIL_CHANGED',
    ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
    ACCOUNT_REACTIVATED: 'ACCOUNT_REACTIVATED',
    ACCOUNT_DELETED: 'ACCOUNT_DELETED',
    DATA_EXPORT_REQUESTED: 'DATA_EXPORT_REQUESTED',
  };
  const AUDIT_OUTCOME = { SUCCESS: 'SUCCESS' };
  const mockLog = jest.fn();
  mockLog.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve([]).catch(fn);
    return chain;
  });
  mockLog.AUDIT_EVENT_CATEGORY = AUDIT_EVENT_CATEGORY;
  mockLog.AUDIT_EVENT_TYPE = AUDIT_EVENT_TYPE;
  mockLog.AUDIT_OUTCOME = AUDIT_OUTCOME;
  return mockLog;
});

// ─── Imports ──────────────────────────────────────────────────────────

const User = require('../../src/models/user.model');
const bcrypt = require('bcryptjs');
const auditService = require('../../src/services/audit.service');
const userService = require('../../src/services/user.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Account Management Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User._reset();
  });

  // ─── updatePhone ─────────────────────────────────────────────────

  describe('updatePhone', () => {
    it('should store a valid phone number', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', phone: '' });

      const result = await userService.updatePhone('u1', '+1 555 123 4567');

      expect(result.phone).toBe('+1 555 123 4567');
      expect(auditService.logAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PHONE_CHANGED' })
      );
    });

    it('should reject an invalid phone number', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', phone: '' });

      await expect(
        userService.updatePhone('u1', 'not-a-phone!!')
      ).rejects.toThrow('valid phone number');
    });

    it('should throw for non-existent user', async () => {
      await expect(
        userService.updatePhone('ghost', '+1 555 123 4567')
      ).rejects.toThrow('User not found');
    });
  });

  // ─── updateEmail ─────────────────────────────────────────────────

  describe('updateEmail', () => {
    it('should change email for local user with correct password', async () => {
      User._add({
        _id: 'u1',
        name: 'Alice',
        username: 'alice',
        email: 'old@b.com',
        password: 'hash',
        authMethod: 'local',
      });
      bcrypt.compare.mockResolvedValueOnce(true);

      const result = await userService.updateEmail('u1', {
        newEmail: 'new@b.com',
        currentPassword: 'secret',
      });

      expect(result.email).toBe('new@b.com');
      expect(auditService.logAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGED' })
      );
    });

    it('should reject an invalid email format', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', authMethod: 'local', password: 'hash' });

      await expect(
        userService.updateEmail('u1', { newEmail: 'not-an-email', currentPassword: 'x' })
      ).rejects.toThrow('valid email');
    });

    it('should reject wrong current password', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', authMethod: 'local', password: 'hash' });
      bcrypt.compare.mockResolvedValueOnce(false);

      await expect(
        userService.updateEmail('u1', { newEmail: 'new@b.com', currentPassword: 'wrong' })
      ).rejects.toThrow('password is incorrect');
    });

    it('should reject duplicate email', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', authMethod: 'local', password: 'hash' });
      User._add({ _id: 'u2', name: 'Bob', username: 'bob', email: 'taken@b.com' });

      await expect(
        userService.updateEmail('u1', { newEmail: 'taken@b.com', currentPassword: 'secret' })
      ).rejects.toThrow('already exists');
    });

    it('should reject email changes for Firebase accounts', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', authMethod: 'firebase' });

      await expect(
        userService.updateEmail('u1', { newEmail: 'new@b.com' })
      ).rejects.toThrow('Google sign-in');
    });
  });

  // ─── getAccountHistory ───────────────────────────────────────────

  describe('getAccountHistory', () => {
    it('should return the user\'s account history records', async () => {
      const AuditLog = require('../../src/models/audit-log.model');
      const records = [
        { eventType: 'PROFILE_UPDATED', description: 'Profile updated', createdAt: new Date() },
      ];
      AuditLog.find.mockImplementationOnce(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.sort = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.then = (resolve, reject) => Promise.resolve(records).then(resolve, reject);
        chain.catch = (fn) => Promise.resolve(records).catch(fn);
        return chain;
      });

      const history = await userService.getAccountHistory('u1');

      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('PROFILE_UPDATED');
      expect(AuditLog.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'ACCOUNT' })
      );
    });
  });

  // ─── deactivate / reactivate ────────────────────────────────────

  describe('deactivateAccount', () => {
    it('should mark the account as deactivated', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', accountStatus: 'active' });

      const result = await userService.deactivateAccount('u1');

      expect(result.accountStatus).toBe('deactivated');
      expect(result.deactivatedAt).toBeDefined();
      expect(auditService.logAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ACCOUNT_DEACTIVATED' })
      );
    });

    it('should throw for non-existent user', async () => {
      await expect(userService.deactivateAccount('ghost')).rejects.toThrow('User not found');
    });
  });

  describe('reactivateAccount', () => {
    it('should reactivate a deactivated account', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', accountStatus: 'deactivated' });

      const result = await userService.reactivateAccount('u1');

      expect(result.accountStatus).toBe('active');
      expect(result.deactivatedAt).toBeNull();
      expect(auditService.logAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ACCOUNT_REACTIVATED' })
      );
    });

    it('should reject reactivating an active account', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com', accountStatus: 'active' });

      await expect(userService.reactivateAccount('u1')).rejects.toThrow('not deactivated');
    });
  });

  // ─── deleteAccount ──────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('should delete the user and their related data', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com' });

      const Post = require('../../src/models/post.model');
      const Conversation = require('../../src/models/conversation.model');
      const Message = require('../../src/models/message.model');

      // User has one conversation
      Conversation.find.mockImplementationOnce(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.then = (resolve) =>
          Promise.resolve([{ _id: 'conv1' }]).then(resolve);
        chain.catch = () => Promise.resolve([{ _id: 'conv1' }]);
        return chain;
      });

      const result = await userService.deleteAccount('u1');

      expect(result.deleted).toBe(true);
      expect(Post.deleteMany).toHaveBeenCalledWith({ user: 'u1' });
      expect(Message.deleteMany).toHaveBeenCalledWith({
        conversation: { $in: ['conv1'] },
      });
      expect(Conversation.deleteMany).toHaveBeenCalledWith({
        _id: { $in: ['conv1'] },
      });
      expect(auditService.logAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ACCOUNT_DELETED' })
      );
    });

    it('should throw for non-existent user', async () => {
      await expect(userService.deleteAccount('ghost')).rejects.toThrow('User not found');
    });
  });

  // ─── exportData ─────────────────────────────────────────────────

  describe('exportData', () => {
    it('should include the user\'s profile, posts, and settings', async () => {
      User._add({ _id: 'u1', name: 'Alice', username: 'alice', email: 'a@b.com' });

      const Post = require('../../src/models/post.model');
      Post.find.mockImplementationOnce(() => {
        const chain = {};
        chain.lean = jest.fn().mockReturnValue(chain);
        chain.then = (resolve) => Promise.resolve([{ _id: 'p1', text: 'hello' }]).then(resolve);
        chain.catch = () => Promise.resolve([{ _id: 'p1', text: 'hello' }]);
        return chain;
      });

      const Settings = require('../../src/models/settings.model');
      Settings.findOne.mockImplementationOnce(() => {
        const chain = {};
        chain.lean = jest.fn().mockReturnValue(chain);
        chain.then = (resolve) => Promise.resolve({ user: 'u1', darkMode: true }).then(resolve);
        chain.catch = () => Promise.resolve({ user: 'u1', darkMode: true });
        return chain;
      });

      const exportData = await userService.exportData('u1');

      expect(exportData.profile).toBeDefined();
      expect(exportData.profile.username).toBe('alice');
      expect(exportData.posts).toHaveLength(1);
      expect(exportData.settings).toBeDefined();
      expect(exportData.exportedAt).toBeDefined();
      expect(exportData.accountHistory).toBeDefined();
    });
  });
});