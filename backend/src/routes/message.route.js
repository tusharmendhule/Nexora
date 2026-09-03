const express = require('express');
const router = express.Router();
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');
const { protect } = require('../middleware/auth.middleware');
const { validateObjectId, sanitizeBody } = require('../middleware/validate.middleware');
const { ApiError } = require('../middleware/error.middleware');
const notificationService = require('../services/notification.service');

// Helper: get Socket.IO instance (set on app.locals by app.js)
function getIO(req) {
  return req.app?.locals?.io || null;
}

// Helper: get current user ID safely
function getUserId(req) {
  return req.user?._id || req.user?.id;
}

// ==========================================
// 1. GET ACTIVE CHAT INBOX (Conversations List)
// ==========================================
// @route   GET /api/messages/inbox
// @access  Private
router.get('/inbox', protect, async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);

    // Find all conversations where current user is a participant
    const conversations = await Conversation.find({
      participants: currentUserId
    })
      .populate('participants', 'username name avatar')
      .populate('lastMessageSender', 'username name')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    // Build inbox items with unread counts
    const inbox = conversations.map(conv => {
      const otherParticipant = conv.participants.find(
        p => p._id.toString() !== currentUserId.toString()
      );

      const unreadCount = conv.unreadCounts?.get(currentUserId.toString()) || 0;

      return {
        _id: conv._id,
        contact: otherParticipant || conv.participants[0],
        lastMessagePreview: conv.lastMessage || '',
        lastMessageTime: conv.lastMessageAt || conv.updatedAt,
        unreadCount
      };
    });

    res.status(200).json({
      success: true,
      count: inbox.length,
      inbox
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. SEND DIRECT MESSAGE
// ==========================================
// @route   POST /api/messages
// @access  Private
router.post('/', protect, sanitizeBody(['text']), async (req, res, next) => {
  try {
    const { recipientId, text, idempotencyKey } = req.body;
    const currentUserId = getUserId(req);

    if (!recipientId || !text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Recipient ID and text are required' });
    }

    // Validate recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    // Prevent sending to self
    if (recipientId === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot send message to yourself' });
    }

    // Idempotency: check for duplicate message
    if (idempotencyKey) {
      const existing = await Message.findOne({ idempotencyKey });
      if (existing) {
        return res.status(200).json({ success: true, message: existing });
      }
    }

    // Create the message
    const newMessage = await Message.create({
      sender: currentUserId,
      recipient: recipientId,
      text: text.trim(),
      status: 'sent',
      idempotencyKey: idempotencyKey || undefined
    });

    // Find or create conversation between these two users
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, recipientId], $size: 2 }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUserId, recipientId]
      });
    }

    // Update conversation metadata
    conversation.lastMessage = text.trim();
    conversation.lastMessageSender = currentUserId;
    conversation.lastMessageAt = new Date();

    // Increment unread count for recipient
    const recipientIdStr = recipientId.toString();
    const currentUnread = conversation.unreadCounts?.get(recipientIdStr) || 0;
    if (!conversation.unreadCounts) conversation.unreadCounts = new Map();
    conversation.unreadCounts.set(recipientIdStr, currentUnread + 1);

    await conversation.save();

    // Populate the message for response
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'username name avatar')
      .populate('recipient', 'username name avatar');

    // Notify recipient (fire-and-forget)
    notificationService.notifyNewMessage({
      recipientId,
      senderId: currentUserId,
      messageId: newMessage._id,
    }).catch(() => {});

    // Emit real-time event via Socket.IO
    const io = getIO(req);
    if (io) {
      io.to(`user:${recipientId}`).emit('new_message', {
        message: populatedMessage,
        conversation: {
          _id: conversation._id,
          lastMessage: conversation.lastMessage,
          lastMessageAt: conversation.lastMessageAt
        }
      });
    }

    res.status(201).json({
      success: true,
      message: populatedMessage,
      conversation: {
        _id: conversation._id,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. GET CHAT HISTORY WITH SPECIFIC USER
// ==========================================
// @route   GET /api/messages/:userId
// @access  Private
router.get('/:userId', protect, validateObjectId('userId'), async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const targetUserId = req.params.userId;

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    // Only show non-deleted messages for the current user
    const query = {
      $or: [
        { sender: currentUserId, recipient: targetUserId, deletedBySender: { $ne: true } },
        { sender: targetUserId, recipient: currentUserId, deletedByRecipient: { $ne: true } }
      ]
    };

    const [chatHistory, total] = await Promise.all([
      Message.find(query)
        .populate('sender', 'username name avatar')
        .populate('recipient', 'username name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments(query)
    ]);

    // Return in chronological order (newest first for pagination, but reverse for display)
    res.status(200).json({
      success: true,
      count: chatHistory.length,
      chatHistory: chatHistory.reverse(), // Chronological order for display
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. MARK MESSAGES AS READ
// ==========================================
// @route   PUT /api/messages/:senderId/read
// @access  Private
router.put('/:senderId/read', protect, validateObjectId('senderId'), async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const senderId = req.params.senderId;

    const result = await Message.updateMany(
      { sender: senderId, recipient: currentUserId, isRead: false },
      { $set: { isRead: true, read: true, status: 'read', readAt: new Date() } }
    );

    // Reset unread count in conversation
    const conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, senderId], $size: 2 }
    });

    if (conversation) {
      if (!conversation.unreadCounts) conversation.unreadCounts = new Map();
      conversation.unreadCounts.set(currentUserId.toString(), 0);
      await conversation.save();
    }

    // Emit read receipts via Socket.IO
    const io = getIO(req);
    if (io && result.modifiedCount > 0) {
      io.to(`user:${senderId}`).emit('messages_read', {
        readBy: currentUserId,
        count: result.modifiedCount
      });
    }

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 5. DELETE A SINGLE MESSAGE
// ==========================================
// @route   DELETE /api/messages/:messageId
// @access  Private
router.delete('/:messageId', protect, validateObjectId('messageId'), async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Ensure only the sender can delete their own message
    if (message.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action' });
    }

    await message.deleteOne();

    // Notify recipient via Socket.IO
    const io = getIO(req);
    if (io) {
      io.to(`user:${message.recipient}`).emit('message_deleted', {
        messageId: message._id,
        deletedBy: currentUserId
      });
    }

    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 6. CLEAR ENTIRE CONVERSATION THREAD
// ==========================================
// @route   DELETE /api/messages/thread/:userId
// @access  Private
router.delete('/thread/:userId', protect, validateObjectId('userId'), async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const targetUserId = req.params.userId;

    // Soft delete: mark messages as deleted for this user
    await Message.updateMany(
      { sender: currentUserId, recipient: targetUserId },
      { $set: { deletedBySender: true } }
    );
    await Message.updateMany(
      { sender: targetUserId, recipient: currentUserId },
      { $set: { deletedByRecipient: true } }
    );

    res.status(200).json({ success: true, message: 'Conversation thread cleared successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;