/**
 * Notification Service Tests (Module 22)
 * ========================================
 * Comprehensive tests for the notification system.
 *
 * Run with: npm test -- --testPathPatterns=notification.service
 */

// ─── Mock Notification Model ─────────────────────────────────────────

jest.mock('../../src/models/notification.model', () => {
  const mockNotifications = [];
  let idCounter = 1;

  const NOTIFICATION_TYPE = {
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
    this._id = data._id || 'notif_' + idCounter++;
    this.createdAt = data.createdAt || new Date();
    this.isNew = true;
    this.save = jest.fn().mockImplementation(function () {
      this.isNew = false;
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockNotification.create = jest.fn().mockImplementation((data) => {
    const doc = new MockNotification(data);
    doc.isNew = false;
    mockNotifications.push(doc);
    return Promise.resolve(doc);
  });

  MockNotification.find = jest.fn().mockImplementation((filter) => {
    filter = filter || {};
    let results = [...mockNotifications];
    if (filter.recipient) results = results.filter((n) => n.recipient === filter.recipient);
    if (filter.isRead !== undefined) results = results.filter((n) => n.isRead === filter.isRead);
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockNotification.findOneAndUpdate = jest.fn().mockImplementation((filter) => {
    const found = mockNotifications.find((n) => n._id === filter._id && n.recipient === filter.recipient);
    if (found) {
      found.populate = jest.fn().mockReturnValue(Promise.resolve(found));
      return Promise.resolve(found);
    }
    return Promise.resolve(null);
  });

  MockNotification.updateMany = jest.fn().mockImplementation((filter) => {
    let count = 0;
    for (const n of mockNotifications) {
      if (n.recipient === filter.recipient && n.isRead === false) {
        n.isRead = true;
        count++;
      }
    }
    return Promise.resolve({ modifiedCount: count });
  });

  MockNotification.deleteMany = jest.fn().mockImplementation((filter) => {
    const before = mockNotifications.length;
    for (let i = mockNotifications.length - 1; i >= 0; i--) {
      if (mockNotifications[i].recipient === filter.recipient) {
        mockNotifications.splice(i, 1);
      }
    }
    return Promise.resolve({ deletedCount: before - mockNotifications.length });
  });

  MockNotification.countDocuments = jest.fn().mockImplementation((filter) => {
    filter = filter || {};
    let results = [...mockNotifications];
    if (filter.recipient) results = results.filter((n) => n.recipient === filter.recipient);
    if (filter.isRead !== undefined) results = results.filter((n) => n.isRead === filter.isRead);
    return Promise.resolve(results.length);
  });

  MockNotification._reset = () => { mockNotifications.length = 0; idCounter = 1; };
  MockNotification._notifications = mockNotifications;
  MockNotification._add = (data) => {
    const doc = new MockNotification(data);
    doc.isNew = false;
    mockNotifications.push(doc);
    return doc;
  };
  MockNotification.NOTIFICATION_TYPE = NOTIFICATION_TYPE;

  return MockNotification;
});

// ─── Imports ─────────────────────────────────────────────────────────

const Notification = require('../../src/models/notification.model');
const notificationService = require('../../src/services/notification.service');

function createTestNotif(overrides) {
  overrides = overrides || {};
  return Notification._add({
    _id: overrides._id || 'notif_test_1',
    recipient: overrides.recipient || 'user_1',
    sender: overrides.sender || 'user_2',
    type: overrides.type || 'POST_APPROVED',
    title: overrides.title || 'Test Notification',
    body: overrides.body || 'This is a test notification',
    targetType: overrides.targetType || 'Post',
    targetId: overrides.targetId || 'post_1',
    isRead: overrides.isRead || false,
    readAt: overrides.readAt || null,
    metadata: overrides.metadata || null,
    createdAt: overrides.createdAt || new Date(),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Notification Service (Module 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification._reset();
  });

  describe('Notification creation', () => {
    it('should create a notification with valid data', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1',
        senderId: 'user_2',
        type: 'POST_APPROVED',
        title: 'Post Approved',
        body: 'Your post has been approved.',
        targetType: 'Post',
        targetId: 'post_1',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_APPROVED');
      expect(notif.title).toBe('Post Approved');
      expect(Notification.create).toHaveBeenCalled();
    });

    it('should return null for missing required fields', async () => {
      const notif = await notificationService.create({ recipientId: 'user_1', type: 'POST_APPROVED' });
      expect(notif).toBeNull();
    });

    it('should return null for invalid type', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', type: 'INVALID', title: 'T', body: 'B',
      });
      expect(notif).toBeNull();
    });

    it('should prevent self-notification', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', senderId: 'user_1', type: 'POST_APPROVED', title: 'T', body: 'B',
      });
      expect(notif).toBeNull();
    });

    it('should allow system notification (null sender)', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', senderId: null, type: 'SYSTEM', title: 'System', body: 'Notice',
      });
      expect(notif).toBeDefined();
    });

    it('should truncate long titles', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', type: 'POST_APPROVED', title: 'A'.repeat(300), body: 'B',
      });
      expect(notif.title.length).toBeLessThanOrEqual(200);
    });

    it('should truncate long bodies', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', type: 'POST_APPROVED', title: 'T', body: 'B'.repeat(600),
      });
      expect(notif.body.length).toBeLessThanOrEqual(500);
    });
  });

  describe('Moderation notifications', () => {
    it('should notify post owner on approval', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'author_1', moderatorId: 'mod_1', action: 'POST_APPROVED',
        postId: 'post_1', reason: 'Verified',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_APPROVED');
      expect(notif.recipient).toBe('author_1');
    });

    it('should notify post owner on rejection', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'author_1', moderatorId: 'mod_1', action: 'POST_REJECTED',
        postId: 'post_2', reason: 'Misinfo',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_REJECTED');
    });

    it('should notify on label override', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'author_1', moderatorId: 'admin_1', action: 'LABEL_OVERRIDE',
        postId: 'post_3', changes: { newLabel: 'Purple' },
      });
      expect(notif).toBeDefined();
      expect(notif.body).toContain('Purple');
    });

    it('should notify on content removal', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'author_1', moderatorId: 'mod_1', action: 'CONTENT_REMOVED',
        postId: 'post_4', reason: 'Violation',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('CONTENT_REMOVED');
    });

    it('should notify on content restoration', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'author_1', moderatorId: 'mod_1', action: 'CONTENT_RESTORED',
        postId: 'post_5',
      });
      expect(notif).toBeDefined();
      expect(notif.body).toContain('restored');
    });
  });

  describe('Report resolution notifications', () => {
    it('should notify reporter when resolved', async () => {
      const notif = await notificationService.notifyReportResolution({
        reporterId: 'reporter_1', moderatorId: 'mod_1',
        reportId: 'report_1', status: 'RESOLVED',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('REPORT_RESOLVED');
      expect(notif.recipient).toBe('reporter_1');
    });

    it('should notify reporter when dismissed', async () => {
      const notif = await notificationService.notifyReportResolution({
        reporterId: 'reporter_1', moderatorId: 'mod_1',
        reportId: 'report_2', status: 'DISMISSED',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('REPORT_DISMISSED');
    });
  });

  describe('Verification notifications', () => {
    it('should notify on PUBLISHED', async () => {
      const notif = await notificationService.notifyVerificationComplete({
        postOwnerId: 'author_1', postId: 'post_1', status: 'PUBLISHED',
        trustScoreResult: { score: 85, label: 'Green' },
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_VERIFIED');
    });

    it('should notify on REVIEW_REQUIRED', async () => {
      const notif = await notificationService.notifyVerificationComplete({
        postOwnerId: 'author_1', postId: 'post_2', status: 'REVIEW_REQUIRED',
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('POST_REQUIRES_MODERATION');
    });

    it('should notify on REJECTED', async () => {
      const notif = await notificationService.notifyVerificationComplete({
        postOwnerId: 'author_1', postId: 'post_3', status: 'REJECTED',
      });
      expect(notif).toBeDefined();
      expect(notif.body).toContain('did not pass');
    });
  });

  describe('Account security notifications', () => {
    it('should notify on role change', async () => {
      const notif = await notificationService.notifyAccountSecurity({
        userId: 'user_1', adminId: 'admin_1', eventType: 'USER_ROLE_CHANGED',
        details: { newRole: 'MODERATOR' },
      });
      expect(notif).toBeDefined();
      expect(notif.type).toBe('ACCOUNT_SECURITY');
      expect(notif.body).toContain('MODERATOR');
    });

    it('should notify on disable', async () => {
      const notif = await notificationService.notifyAccountSecurity({
        userId: 'user_1', adminId: 'admin_1', eventType: 'USER_DISABLED',
      });
      expect(notif).toBeDefined();
      expect(notif.title).toBe('Account Disabled');
    });

    it('should notify on enable', async () => {
      const notif = await notificationService.notifyAccountSecurity({
        userId: 'user_1', adminId: 'admin_1', eventType: 'USER_ENABLED',
      });
      expect(notif).toBeDefined();
      expect(notif.title).toBe('Account Re-enabled');
    });
  });

  describe('Get notifications', () => {
    it('should return notifications with pagination', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      createTestNotif({ _id: 'n2', recipient: 'user_1', isRead: true });
      createTestNotif({ _id: 'n3', recipient: 'user_2', isRead: false });
      const result = await notificationService.getNotifications('user_1');
      expect(result.notifications).toBeDefined();
      expect(result.unreadCount).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('should filter unread only', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      createTestNotif({ _id: 'n2', recipient: 'user_1', isRead: true });
      const result = await notificationService.getNotifications('user_1', { unreadOnly: true });
      expect(result.notifications).toBeDefined();
    });
  });

  describe('Unread count', () => {
    it('should return correct unread count', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      createTestNotif({ _id: 'n2', recipient: 'user_1', isRead: true });
      createTestNotif({ _id: 'n3', recipient: 'user_1', isRead: false });
      const count = await notificationService.getUnreadCount('user_1');
      expect(count).toBe(2);
    });

    it('should return 0 when no unread', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: true });
      const count = await notificationService.getUnreadCount('user_1');
      expect(count).toBe(0);
    });
  });

  describe('Mark as read', () => {
    it('should mark a single notification as read', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      const result = await notificationService.markAsRead('n1', 'user_1');
      expect(result).toBeDefined();
      expect(Notification.findOneAndUpdate).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      Notification.findOneAndUpdate.mockResolvedValueOnce(null);
      const result = await notificationService.markAsRead('nonexistent', 'user_1');
      expect(result).toBeNull();
    });

    it('should mark all as read', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      createTestNotif({ _id: 'n2', recipient: 'user_1', isRead: false });
      await notificationService.markAllAsRead('user_1');
      expect(Notification.updateMany).toHaveBeenCalled();
    });
  });

  describe('Delete all', () => {
    it('should delete all notifications for a user', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1' });
      createTestNotif({ _id: 'n2', recipient: 'user_1' });
      await notificationService.deleteAll('user_1');
      expect(Notification.deleteMany).toHaveBeenCalled();
    });
  });

  describe('Event types', () => {
    it('should return all notification types', () => {
      const types = notificationService.getEventTypes();
      expect(types).toContain('POST_VERIFIED');
      expect(types).toContain('POST_REQUIRES_MODERATION');
      expect(types).toContain('ACCOUNT_SECURITY');
      expect(types).toContain('SYSTEM');
    });
  });

  describe('Controller validation', () => {
    const ctrl = require('../../src/controllers/v1/notification.controller');

    it('should handle getNotifications', async () => {
      const req = { user: { _id: 'user_1' }, query: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      await ctrl.getNotifications(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getUnreadCount', async () => {
      const req = { user: { _id: 'user_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await ctrl.getUnreadCount(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle markAsRead', async () => {
      createTestNotif({ _id: 'n1', recipient: 'user_1', isRead: false });
      const req = { user: { _id: 'user_1' }, params: { id: 'n1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await ctrl.markAsRead(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle markAllAsRead', async () => {
      const req = { user: { _id: 'user_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await ctrl.markAllAsRead(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle deleteAll', async () => {
      const req = { user: { _id: 'user_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await ctrl.deleteAll(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getTypes', async () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      ctrl.getTypes({}, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, types: expect.arrayContaining(['POST_VERIFIED']) })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle null sender', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', senderId: null, type: 'SYSTEM', title: 'T', body: 'B',
      });
      expect(notif).toBeDefined();
      expect(notif.sender).toBeNull();
    });

    it('should handle empty recipientId', async () => {
      const notif = await notificationService.create({
        recipientId: null, type: 'POST_APPROVED', title: 'T', body: 'B',
      });
      expect(notif).toBeNull();
    });

    it('should handle metadata', async () => {
      const notif = await notificationService.create({
        recipientId: 'user_1', type: 'POST_APPROVED', title: 'T', body: 'B',
        metadata: { trustScore: 85 },
      });
      expect(notif).toBeDefined();
      expect(notif.metadata.trustScore).toBe(85);
    });

    it('should prevent self-notification in moderation', async () => {
      const notif = await notificationService.notifyModerationAction({
        postOwnerId: 'mod_1', moderatorId: 'mod_1', action: 'POST_APPROVED', postId: 'p1',
      });
      expect(notif).toBeNull();
    });
  });
});
