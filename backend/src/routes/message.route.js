const express = require('express');
const router = express.Router();
const Message = require('../models/message.model');
const User = require('../models/user.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. GET ACTIVE CHAT INBOX (Conversations List)
// ==========================================
// @route   GET /api/messages/inbox
// @access  Private
router.get('/inbox', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    // Find all unique users the current user has exchanged messages with
    const sentMessages = await Message.distinct('recipient', { sender: currentUserId });
    const receivedMessages = await Message.distinct('sender', { recipient: currentUserId });

    // Combine into a unique list of contact IDs, excluding the user themselves
    const contactIds = [...new Set([...sentMessages, ...receivedMessages])]
      .filter(id => id.toString() !== currentUserId.toString());

    // Fetch details of those users for the inbox UI layout
    const activeContacts = await User.find({ _id: { $in: contactIds } })
      .select('name avatar status');

    // Fetch the absolute last message for each contact to show as a preview snippet
    const inbox = await Promise.all(activeContacts.map(async (contact) => {
      const lastMessage = await Message.findOne({
        $or: [
          { sender: currentUserId, recipient: contact._id },
          { sender: contact._id, recipient: currentUserId }
        ]
      })
      .sort({ createdAt: -1 });

      return {
        contact,
        lastMessagePreview: lastMessage ? lastMessage.text : '',
        lastMessageTime: lastMessage ? lastMessage.createdAt : null
      };
    }));

    // Sort inbox conversations so the most recent chat bubbles to the top
    inbox.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

    res.status(200).json({
      success: true,
      count: inbox.length,
      inbox
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. SEND DIRECT MESSAGE
// ==========================================
// @route   POST /api/messages
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { recipientId, text } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (!recipientId || !text) {
      return res.status(400).json({ success: false, message: 'Recipient ID and text are required' });
    }

    const newMessage = await Message.create({
      sender: currentUserId,
      recipient: recipientId,
      text
    });

    res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. GET CHAT HISTORY WITH SPECIFIC USER
// ==========================================
// @route   GET /api/messages/:userId
// @access  Private
router.get('/:userId', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const targetUserId = req.params.userId;

    const chatHistory = await Message.find({
      $or: [
        { sender: currentUserId, recipient: targetUserId },
        { sender: targetUserId, recipient: currentUserId }
      ]
    }).sort({ createdAt: 1 }); // Chronological chat ordering

    res.status(200).json({ success: true, count: chatHistory.length, chatHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. MARK MESSAGES AS READ
// ==========================================
// @route   PUT /api/messages/:senderId/read
// @access  Private
router.put('/:senderId/read', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const senderId = req.params.senderId;

    await Message.updateMany(
      { sender: senderId, recipient: currentUserId, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DELETE A SINGLE MESSAGE
// ==========================================
// @route   DELETE /api/messages/:messageId
// @access  Private
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Ensure only the sender can delete their own message
    if (message.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action' });
    }

    await message.deleteOne();
    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. CLEAR ENTIRE CONVERSATION THREAD
// ==========================================
// @route   DELETE /api/messages/thread/:userId
// @access  Private
router.delete('/thread/:userId', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const targetUserId = req.params.userId;

    // Deletes history flowing both directions between these two individuals
    await Message.deleteMany({
      $or: [
        { sender: currentUserId, recipient: targetUserId },
        { sender: targetUserId, recipient: currentUserId }
      ]
    });

    res.status(200).json({ success: true, message: 'Conversation thread cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;