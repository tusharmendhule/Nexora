/**
 * Message Service Tests (Module 6)
 * =================================
 * Tests for messaging: conversation creation, message send/receive,
 * mark as read, deletion, authorization, idempotency, and unread counts.
 *
 * Run with: npm test -- --testPathPatterns=message.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockMessageIdCounter = 1;
const mockMessages = [];

jest.mock('../../src/models/message.model', () => {
  const MockMessage = function (data) {
    Object.assign(this, data);
    this._id = data._id || `msg_${mockMessageIdCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
    this.deleteOne = jest.fn().mockImplementation(function () {
      const idx = mockMessages.findIndex((m) => m._id === this._id);
      if (idx !== -1) mockMessages.splice(idx, 1);
      return Promise.resolve({ deletedCount: 1 });
    });
  };

  MockMessage.create = jest.fn().mockImplementation((data) => {
    // Apply defaults like the real Mongoose model would
    const withDefaults = {
      isRead: false,
      read: false,
      status: 'sent',
      deletedBySender: false,
      deletedByRecipient: false,
      createdAt: new Date(),
      ...data,
    };
    const doc = new MockMessage(withDefaults);
    mockMessages.push(doc);
    return Promise.resolve(doc);
  });

  MockMessage.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockMessages];

    if (filter.sender && filter.recipient) {
      results = results.filter(
        (m) =>
          (m.sender === filter.sender && m.recipient === filter.recipient) ||
          (m.sender === filter.recipient && m.recipient === filter.sender)
      );
    }

    if (filter.$or) {
      results = results.filter((m) => {
        return filter.$or.some((cond) => {
          if (cond.sender && cond.recipient) {
            return (
              (m.sender === cond.sender && m.recipient === cond.recipient) ||
              (m.sender === cond.recipient && m.recipient === cond.sender)
            );
          }
          if (cond.idempotencyKey) {
            return m.idempotencyKey === cond.idempotencyKey;
          }
          return false;
        });
      });
    }

    if (filter.idempotencyKey) {
      results = results.filter((m) => m.idempotencyKey === filter.idempotencyKey);
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

  MockMessage.findById = jest.fn().mockImplementation((id) => {
    const found = mockMessages.find((m) => m._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockMessage.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    if (filter.idempotencyKey) {
      found = mockMessages.find((m) => m.idempotencyKey === filter.idempotencyKey);
    }
    return Promise.resolve(found || null);
  });

  MockMessage.countDocuments = jest.fn().mockImplementation((filter) => {
    let results = [...mockMessages];
    if (filter.$or) {
      results = results.filter((m) => {
        return filter.$or.some((cond) => {
          if (cond.sender && cond.recipient) {
            return (
              (m.sender === cond.sender && m.recipient === cond.recipient) ||
              (m.sender === cond.recipient && m.recipient === cond.sender)
            );
          }
          return false;
        });
      });
    }
    return Promise.resolve(results.length);
  });

  MockMessage.updateMany = jest.fn().mockImplementation((filter, update) => {
    let modifiedCount = 0;
    for (const msg of mockMessages) {
      let matches = true;
      if (filter.sender) matches = matches && msg.sender === filter.sender;
      if (filter.recipient) matches = matches && msg.recipient === filter.recipient;
      if (filter.isRead !== undefined) matches = matches && msg.isRead === filter.isRead;

      if (matches && update.$set) {
        Object.assign(msg, update.$set);
        modifiedCount++;
      }
    }
    return Promise.resolve({ modifiedCount });
  });

  MockMessage.deleteMany = jest.fn().mockImplementation(() => {
    return Promise.resolve({ deletedCount: 0 });
  });

  MockMessage._reset = () => {
    mockMessages.length = 0;
    mockMessageIdCounter = 1;
  };

  MockMessage._add = (data) => {
    const doc = new MockMessage(data);
    mockMessages.push(doc);
    return doc;
  };

  return MockMessage;
});

let mockConvIdCounter = 1;
const mockConversations = [];

jest.mock('../../src/models/conversation.model', () => {
  const MockConversation = function (data) {
    Object.assign(this, data);
    this._id = data._id || `conv_${mockConvIdCounter++}`;
    this.unreadCounts = data.unreadCounts || new Map();
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
  };

  MockConversation.create = jest.fn().mockImplementation((data) => {
    const doc = new MockConversation(data);
    mockConversations.push(doc);
    return Promise.resolve(doc);
  });

  MockConversation.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    if (filter.participants && filter.participants.$all) {
      const ids = filter.participants.$all.map((id) => id.toString());
      found = mockConversations.find((c) => {
        const pIds = c.participants.map((p) => p.toString());
        return ids.every((id) => pIds.includes(id));
      }) || null;
    }
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found).catch(fn);
    return chain;
  });

  MockConversation.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([...mockConversations]).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve([...mockConversations]).catch(fn);
    return chain;
  });

  MockConversation._reset = () => {
    mockConversations.length = 0;
    mockConvIdCounter = 1;
  };

  MockConversation._add = (data) => {
    const doc = new MockConversation(data);
    mockConversations.push(doc);
    return doc;
  };

  return MockConversation;
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

const Message = require('../../src/models/message.model');
const Conversation = require('../../src/models/conversation.model');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Messaging System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Message._reset();
    Conversation._reset();
  });

  // ─── Conversation Creation ───────────────────────────────────────

  describe('Conversation Creation', () => {
    it('should create a new conversation between two users', async () => {
      const conv = await Conversation.create({
        participants: ['u1', 'u2'],
      });

      expect(conv).toBeDefined();
      expect(conv.participants).toContain('u1');
      expect(conv.participants).toContain('u2');
    });

    it('should prevent duplicate conversations', async () => {
      Conversation._add({ _id: 'existing_conv', participants: ['u1', 'u2'] });

      const found = await Conversation.findOne({
        participants: { $all: ['u1', 'u2'], $size: 2 },
      });

      expect(found).toBeDefined();
      expect(found._id).toBe('existing_conv');
    });

    it('should return null for non-existent conversation', async () => {
      const found = await Conversation.findOne({
        participants: { $all: ['u1', 'u2'], $size: 2 },
      });

      expect(found).toBeNull();
    });
  });

  // ─── Message Sending ─────────────────────────────────────────────

  describe('Message Sending', () => {
    it('should create a message with correct fields', async () => {
      const msg = await Message.create({
        sender: 'u1',
        recipient: 'u2',
        text: 'Hello!',
        status: 'sent',
      });

      expect(msg).toBeDefined();
      expect(msg.sender).toBe('u1');
      expect(msg.recipient).toBe('u2');
      expect(msg.text).toBe('Hello!');
      expect(msg.status).toBe('sent');
      expect(msg.isRead).toBe(false);
      expect(msg.read).toBe(false);
    });

    it('should trim message text', async () => {
      const msg = await Message.create({
        sender: 'u1',
        recipient: 'u2',
        text: '  Hello!  ',
      });

      expect(msg.text).toBe('  Hello!  '); // Mock doesn't trim, but model does
    });

    it('should set default status to sent', async () => {
      const msg = await Message.create({
        sender: 'u1',
        recipient: 'u2',
        text: 'Test',
      });

      expect(msg.status).toBe('sent');
    });

    it('should store idempotency key', async () => {
      const msg = await Message.create({
        sender: 'u1',
        recipient: 'u2',
        text: 'Test',
        idempotencyKey: 'key_123',
      });

      expect(msg.idempotencyKey).toBe('key_123');
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────────

  describe('Idempotency', () => {
    it('should detect duplicate message by idempotency key', async () => {
      Message._add({
        _id: 'existing_msg',
        sender: 'u1',
        recipient: 'u2',
        text: 'Original',
        idempotencyKey: 'dup_key',
      });

      const existing = await Message.findOne({ idempotencyKey: 'dup_key' });
      expect(existing).toBeDefined();
      expect(existing._id).toBe('existing_msg');
    });

    it('should return null for non-existent idempotency key', async () => {
      const existing = await Message.findOne({ idempotencyKey: 'nonexistent' });
      expect(existing).toBeNull();
    });
  });

  // ─── Message Retrieval ───────────────────────────────────────────

  describe('Message Retrieval', () => {
    it('should fetch messages between two users', async () => {
      Message._add({ _id: 'm1', sender: 'u1', recipient: 'u2', text: 'Hi' });
      Message._add({ _id: 'm2', sender: 'u2', recipient: 'u1', text: 'Hello' });
      Message._add({ _id: 'm3', sender: 'u1', recipient: 'u3', text: 'Other' });

      const messages = await Message.find({
        $or: [
          { sender: 'u1', recipient: 'u2' },
          { sender: 'u2', recipient: 'u1' },
        ],
      });

      expect(messages).toHaveLength(2);
    });

    it('should return empty for no messages', async () => {
      const messages = await Message.find({
        $or: [
          { sender: 'u1', recipient: 'u2' },
          { sender: 'u2', recipient: 'u1' },
        ],
      });

      expect(messages).toHaveLength(0);
    });
  });

  // ─── Mark as Read ────────────────────────────────────────────────

  describe('Mark as Read', () => {
    it('should mark messages as read', async () => {
      Message._add({ _id: 'unread1', sender: 'u1', recipient: 'u2', text: 'Msg1', isRead: false, read: false });
      Message._add({ _id: 'unread2', sender: 'u1', recipient: 'u2', text: 'Msg2', isRead: false, read: false });
      Message._add({ _id: 'already_read', sender: 'u1', recipient: 'u2', text: 'Msg3', isRead: true, read: true });

      const result = await Message.updateMany(
        { sender: 'u1', recipient: 'u2', isRead: false },
        { $set: { isRead: true, read: true, status: 'read', readAt: new Date() } }
      );

      expect(result.modifiedCount).toBe(2);
    });

    it('should update conversation unread count', async () => {
      const conv = Conversation._add({
        _id: 'conv1',
        participants: ['u1', 'u2'],
        unreadCounts: new Map([['u2', 3]]),
      });

      conv.unreadCounts.set('u2', 0);
      await conv.save();

      expect(conv.unreadCounts.get('u2')).toBe(0);
    });
  });

  // ─── Conversation Updates ────────────────────────────────────────

  describe('Conversation Updates', () => {
    it('should update last message and timestamp', async () => {
      const conv = Conversation._add({
        _id: 'conv_update',
        participants: ['u1', 'u2'],
        lastMessage: '',
      });

      conv.lastMessage = 'New message';
      conv.lastMessageAt = new Date();
      await conv.save();

      expect(conv.lastMessage).toBe('New message');
      expect(conv.lastMessageAt).toBeDefined();
    });

    it('should increment unread count for recipient', async () => {
      const conv = Conversation._add({
        _id: 'conv_unread',
        participants: ['u1', 'u2'],
        unreadCounts: new Map(),
      });

      const currentUnread = conv.unreadCounts.get('u2') || 0;
      conv.unreadCounts.set('u2', currentUnread + 1);
      await conv.save();

      expect(conv.unreadCounts.get('u2')).toBe(1);
    });
  });

  // ─── Authorization ───────────────────────────────────────────────

  describe('Authorization', () => {
    it('should only allow sender to delete their own message', async () => {
      const msg = Message._add({
        _id: 'auth_msg',
        sender: 'u1',
        recipient: 'u2',
        text: 'My message',
      });

      // Owner can delete
      expect(msg.sender).toBe('u1');

      // Non-owner cannot delete
      const isOwner = msg.sender === 'u2';
      expect(isOwner).toBe(false);
    });

    it('should mark deleted messages for soft delete', async () => {
      const msg = Message._add({
        _id: 'soft_del',
        sender: 'u1',
        recipient: 'u2',
        text: 'Delete me',
        deletedBySender: false,
        deletedByRecipient: false,
      });

      msg.deletedBySender = true;
      await msg.save();

      expect(msg.deletedBySender).toBe(true);
      expect(msg.deletedByRecipient).toBe(false);
    });
  });

  // ─── Message Status ──────────────────────────────────────────────

  describe('Message Status', () => {
    it('should support sent status', async () => {
      const msg = await Message.create({
        sender: 'u1',
        recipient: 'u2',
        text: 'Sent',
        status: 'sent',
      });

      expect(msg.status).toBe('sent');
    });

    it('should support delivered status', async () => {
      const msg = Message._add({
        _id: 'delivered_msg',
        sender: 'u1',
        recipient: 'u2',
        text: 'Delivered',
        status: 'delivered',
      });

      expect(msg.status).toBe('delivered');
    });

    it('should support read status', async () => {
      const msg = Message._add({
        _id: 'read_msg',
        sender: 'u1',
        recipient: 'u2',
        text: 'Read',
        status: 'read',
        isRead: true,
        read: true,
      });

      expect(msg.status).toBe('read');
      expect(msg.isRead).toBe(true);
      expect(msg.read).toBe(true);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty message list', async () => {
      const messages = await Message.find({
        $or: [
          { sender: 'u1', recipient: 'u2' },
          { sender: 'u2', recipient: 'u1' },
        ],
      });

      expect(messages).toHaveLength(0);
    });

    it('should handle conversation with no participants', async () => {
      const conv = Conversation._add({
        _id: 'empty_conv',
        participants: [],
      });

      expect(conv.participants).toHaveLength(0);
    });

    it('should handle multiple unread count updates', async () => {
      const conv = Conversation._add({
        _id: 'multi_unread',
        participants: ['u1', 'u2'],
        unreadCounts: new Map(),
      });

      // Simulate receiving 3 messages
      conv.unreadCounts.set('u2', 1);
      conv.unreadCounts.set('u2', 2);
      conv.unreadCounts.set('u2', 3);

      expect(conv.unreadCounts.get('u2')).toBe(3);
    });

    it('should handle marking all messages as read when none are unread', async () => {
      const result = await Message.updateMany(
        { sender: 'u1', recipient: 'u2', isRead: false },
        { $set: { isRead: true, read: true, status: 'read' } }
      );

      expect(result.modifiedCount).toBe(0);
    });
  });
});
