const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. CREATE OR GET EXISTING CONVERSATION
// ==========================================
// @route   POST /api/conversations
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user?._id || req.user?.id;

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'Receiver ID is required' });
    }

    if (receiverId === senderId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot create conversation with yourself' });
    }

    // Check if conversation already exists between these two users
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] }
    }).populate('participants', 'username name avatar');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId]
      });
      conversation = await conversation.populate('participants', 'username name avatar');
    }

    res.status(200).json({ success: true, conversation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. GET ALL CONVERSATIONS FOR LOGGED IN USER
// ==========================================
// @route   GET /api/conversations
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const conversations = await Conversation.find({
      participants: userId
    })
      .populate('participants', 'username name avatar')
      .populate('lastMessageSender', 'username name')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, count: conversations.length, conversations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;