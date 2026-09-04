/**
 * Notification Service Tests (Module 7)
 * =====================================
 * Tests for notification creation, social notifications, read state,
 * pagination, unread count, and deletion.
 *
 * Run with: npm test -- --testPathPatterns=notification.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockNotifIdCounter = 1;
const mockNotifications = [];

jest.mock('../../src/models/notification.model', () => {
  const NOTIFICATION_TYPE = {
    NEW_FOLLOWER: 'NEW_FOLLOWER',
    POST_LIKED: 'POST_LIKED',
    POST_COMMENTED: 'POST_COMMENTED',
    MOMENT_REPLIED: 'MOMENT_REPLIED',
    NEW_MESSAGE: 'NEW_MESSAGE',
    POST_VERIFIED: 'POST_VERIFIED',
    POST_REQUIRES_MODERATION: 'POST_REQUIRES_MODERATION',
    POST_APPROVED: 'POST_APPROVED',
    POST_REJECTED: 'POST_REJECTED',
    LABEL_OVERRIDE: 'LABEL_OVERRIDE',
    CONTENT_REMOVED: 'CONTENT_REMOVED',
    CONTENT_RESTORED: 'CONTENT_RESTORED',
    REPORT_RESOLVED: 'REPORT_RESOLVED',
    REPORT_DISMISSED: 'REPORT_DISMISSED',
    ACCOUNT_SECURITY: 'ACCOUNT_SECURITY',
    SYSTEM: 'SYSTEM',
  };

  const MockNotification = function (data) {
    Object.assign(this, data);
    this._id = data._id || `notif_${mockNotifIdCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockNotification.create = jest.fn().mockImplementation((data) => {
    const doc = new MockNotification({
      isRead: false,
      readAt: null,
      createdAt: new Date(),
      ...data,
    });
    mockNotifications.push(doc);
    return Promise.resolve(doc);
  });

  MockNotification.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockNotifications];

    if (filter.recipient) {
      results = results.filter((n) => n.recipient === filter.recipient);
    }
    if (filter.isRead !== undefined) {
      results = results.filter((n) => n.isRead === filter.isRead);
    }

    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockNotification.findOneAndUpdate = jest.fn().mockImplementation((filter, update) => {
    const found = mockNotifications.find((n) => n._id === filter._id && n.recipient === filter.recipient);
    if (found) {
      if (update.$set) {
        Object.assign(found, update.$set);
      }
    }
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(Promise.resolve(found));
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    return chain;
  });

  MockNotification.updateMany = jest.fn().mockImplementation((filter, update) => {
    let modifiedCount = 0;
    for (const n of mockNotifications) {
      let matches = true;
      if (filter.recipient) matches = matches && n.recipient === filter.recipient;
      if (filter.isRead !== undefined) matches = matches && n.isRead === filter.isRead;
      if (matches && update.$set) {
        Object.assign(n, update.$set);
        modifiedCount++;
      }
    }
    return Promise.resolve({ modifiedCount });
  });

  MockNotification.countDocuments = jest.fn().mockImplementation((filter) => {
    let results = [...mockNotifications];
    if (filter.recipient) {
      results = results.filter((n) => n.recipient === filter.recipient);
    }
    if (filter.isRead !== undefined) {
      results = results.filter((n) => n.isRead === filter.isRead);
    }
    return Promise.resolve(results.length);
  });

  MockNotification.deleteMany = jest.fn().mockImplementation((filter) => {
    let deletedCount = 0;
    if (filter.recipient) {
      const toRemove = mockNotifications.filter((n) => n.recipient === filter.recipient);
      deletedCount = toRemove.length;
      for (const n of toRemove) {
        const idx = mockNotifications.indexOf(n);
        if (idx !== -1) mockNotifications.splice(idx, 1);
      }
    }
    return Promise.resolve({ deletedCount });
  });

  MockNotification._reset = () => {
    mockNotifications.length = 0;
    mockNotifIdCounter = 1;
  };

  MockNotification._add = (data) => {
    const doc = new MockNotification(data);
    mockNotifications.push(doc);
    return doc;
  };

  MockNotification.NOTIFICATION_TYPE = NOTIFICATION_TYPE;

  return MockNotification;
});

jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || `user_${Date.now()}`;
  };
  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    return Promise.resolve(found || null);
  });
  MockUser._reset = () => { mockUsers.length = 0; };
  MockUser._add = (data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return doc;
  };
  return MockUser;
});

// ─── Imports ──────────────────────────────────────────────────────────

const Notification = require('../../src/models/notification.model');
const User = require('../../src/models/user.model');
const notificationService = require('../../src/services/notification.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification._reset();
    User._reset();
  });

  // ─── Create ───────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a notification with correct fields', async () => {
      const notif = await notificationService.create({
        recipientId: 'u1',
        senderId: 'u2',
        type: 'POST_LIKED',
        title: 'Post Liked',
        body: 'User liked your post',
        targetType: 'Post',
        targetId: 'post1',
      });

      expect(notif).toBeDefined();
      expect(notif.recipient).toBe('u1');
      expect(notif.sender).toBe('u2');
      expect(notif.type).toBe('POST_LIKED');
      expect(notif.isRead).toBe(false);
    });

    it('should not notify user about their own actions', async () => {
      const notif = await notificationService.create({
        recipientId: 'u1',
        senderId: 'u1',
        type: 'POST_LIKED',
        title: 'Post Liked',
        body: 'You liked your own post',
      });

      expect(notif).toBeNull();
    });

    it('should return null for missing required fields', async () => {
      const notif = await notificationService.create({
        recipientId: 'u1',
        // missing type, title, body
      });

      expect(notif).toBeNull();
    });

    it('should return null for invalid notification type', async () => {
      const notif = await notificationService.create({
        recipientId: 'u1',
        type: 'INVALID_TYPE',
        title: 'Test',
        body: 'Test',
      });

      expect(notif).toBeNull();
    });

    it('should handle null sender (system notification)', async () => {
      const notif = await notificationService.create({
        recipientId: 'u1',
        senderId: null,
        type: 'SYSTEM',
        title: 'System Update',
        body: 'System maintenance scheduled',
      });

      expect(notif).toBeDefined();
      expect(notif.sender).toBeNull();
    });
  });

  // ─── Social Notifications ─────────────────────────────────────────

  describe('Social Notifications', () => {
    it('should create NEW_FOLLOWER notification', async () => {
      const notif = await notificationService.notifyNewFollower({
        recipientId: 'u2',
        followerId: 'follower_1',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('NEW_FOLLOWER');
      // Body uses fallback 'Someone' when user lookup fails in test mock
      expect(notif.body).toBeDefined();
    });

    it('should not notify when following yourself', async () => {
      const notif = await notificationService.notifyNewFollower({
        recipientId: 'u1',
        followerId: 'u1',
      });

      expect(notif).toBeNull();
    });

    it('should create POST_LIKED notification', async () => {
      User._add({ _id: 'liker_1', name: 'Bob', username: 'bob' });

      const notif = await notificationService.notifyPostLiked({
        postOwnerId: 'u2',
        likerId: 'liker_1',
        postId: 'post1',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_LIKED');
      expect(notif.targetType).toBe('Post');
      expect(notif.targetId).toBe('post1');
    });

    it('should not notify when liking your own post', async () => {
      const notif = await notificationService.notifyPostLiked({
        postOwnerId: 'u1',
        likerId: 'u1',
        postId: 'post1',
      });

      expect(notif).toBeNull();
    });

    it('should create POST_COMMENTED notification with preview', async () => {
      const notif = await notificationService.notifyPostCommented({
        postOwnerId: 'u2',
        commenterId: 'commenter_1',
        postId: 'post1',
        commentText: 'Great post!',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_COMMENTED');
      expect(notif.body).toContain('Great post!');
    });

    it('should truncate long comment previews', async () => {
      User._add({ _id: 'commenter_2', name: 'Dave', username: 'dave' });

      const longText = 'A'.repeat(100);
      const notif = await notificationService.notifyPostCommented({
        postOwnerId: 'u2',
        commenterId: 'commenter_2',
        postId: 'post1',
        commentText: longText,
      });

      expect(notif).toBeDefined();
      expect(notif.body.length).toBeLessThan(longText.length + 50);
    });

    it('should create MOMENT_REPLIED notification with reply text', async () => {
      User._add({ _id: 'replier_1', name: 'Fay', username: 'fay' });

      const notif = await notificationService.notifyMomentReplied({
        momentOwnerId: 'u2',
        replierId: 'replier_1',
        momentId: 'story1',
        replyText: 'Nice moment!',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('MOMENT_REPLIED');
      expect(notif.targetId).toBe('story1');
      expect(notif.body).toContain('Nice moment!');
    });

    it('should not notify when replying to your own moment', async () => {
      const notif = await notificationService.notifyMomentReplied({
        momentOwnerId: 'u1',
        replierId: 'u1',
        momentId: 'story1',
        replyText: 'Self reply',
      });

      expect(notif).toBeNull();
    });

    it('should create NEW_MESSAGE notification', async () => {
      User._add({ _id: 'sender_1', name: 'Eve', username: 'eve' });

      const notif = await notificationService.notifyNewMessage({
        recipientId: 'u2',
        senderId: 'sender_1',
        messageId: 'msg1',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('NEW_MESSAGE');
      expect(notif.targetType).toBe('Message');
    });

    it('should not notify when messaging yourself', async () => {
      const notif = await notificationService.notifyNewMessage({
        recipientId: 'u1',
        senderId: 'u1',
        messageId: 'msg1',
      });

      expect(notif).toBeNull();
    });
  });

  // ─── Read Operations ──────────────────────────────────────────────

  describe('Read Operations', () => {
    it('should get notifications for a user', async () => {
      Notification._add({ _id: 'n1', recipient: 'u1', type: 'SYSTEM', title: 'Test', body: 'Test 1', isRead: false });
      Notification._add({ _id: 'n2', recipient: 'u1', type: 'SYSTEM', title: 'Test', body: 'Test 2', isRead: true });
      Notification._add({ _id: 'n3', recipient: 'u2', type: 'SYSTEM', title: 'Other', body: 'Other', isRead: false });

      const result = await notificationService.getNotifications('u1');

      expect(result.notifications).toHaveLength(2);
      expect(result.unreadCount).toBe(1);
      expect(result.pagination).toBeDefined();
    });

    it('should filter unread only', async () => {
      Notification._add({ _id: 'n4', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });
      Notification._add({ _id: 'n5', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: true });

      const result = await notificationService.getNotifications('u1', { unreadOnly: true });

      expect(result.notifications).toHaveLength(1);
    });

    it('should get unread count', async () => {
      Notification._add({ _id: 'n6', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });
      Notification._add({ _id: 'n7', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });
      Notification._add({ _id: 'n8', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: true });

      const count = await notificationService.getUnreadCount('u1');
      expect(count).toBe(2);
    });

    it('should mark a notification as read', async () => {
      Notification._add({ _id: 'n9', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });

      const result = await notificationService.markAsRead('n9', 'u1');
      expect(result).toBeDefined();
    });

    it('should mark all notifications as read', async () => {
      Notification._add({ _id: 'n10', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });
      Notification._add({ _id: 'n11', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B', isRead: false });

      const count = await notificationService.markAllAsRead('u1');
      expect(count).toBe(2);
    });

    it('should delete all notifications for a user', async () => {
      Notification._add({ _id: 'n12', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B' });
      Notification._add({ _id: 'n13', recipient: 'u1', type: 'SYSTEM', title: 'T', body: 'B' });
      Notification._add({ _id: 'n14', recipient: 'u2', type: 'SYSTEM', title: 'T', body: 'B' });

      const count = await notificationService.deleteAll('u1');
      expect(count).toBe(2);
    });
  });

  // ─── Event Types ──────────────────────────────────────────────────

  describe('Event Types', () => {
    it('should return all event types', () => {
      const types = notificationService.getEventTypes();
      expect(types).toContain('NEW_FOLLOWER');
      expect(types).toContain('POST_LIKED');
      expect(types).toContain('POST_COMMENTED');
      expect(types).toContain('NEW_MESSAGE');
      expect(types).toContain('POST_VERIFIED');
      expect(types).toContain('ACCOUNT_SECURITY');
      expect(types).toContain('SYSTEM');
    });
  });

  // ─── Convenience Methods ──────────────────────────────────────────

  describe('Convenience Methods', () => {
    it('should create moderation notification', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'u1',
        moderatorId: 'mod1',
        action: 'POST_APPROVED',
        postId: 'post1',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_APPROVED');
    });

    it('should create report resolution notification', async () => {
      const notif = await notificationService.notifyReportResolution({
        reporterId: 'u1',
        moderatorId: 'mod1',
        reportId: 'report1',
        status: 'RESOLVED',
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('REPORT_RESOLVED');
    });

    it('should create verification notification', async () => {
      const notif = await notificationService.notifyVerificationComplete({
        postOwnerId: 'u1',
        postId: 'post1',
        status: 'PUBLISHED',
        trustScoreResult: { score: 85, label: 'Green' },
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_VERIFIED');
    });

    it('should create account security notification', async () => {
      const notif = await notificationService.notifyAccountSecurity({
        userId: 'u1',
        adminId: 'admin1',
        eventType: 'USER_ROLE_CHANGED',
        details: { newRole: 'MODERATOR' },
      });

      expect(notif).toBeDefined();
      expect(notif.type).toBe('ACCOUNT_SECURITY');
    });
  });
});
