const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation.model');
const { protect } = require('../middleware/auth.middleware');
const { validateObjectId, sanitizeBody } = require('../middleware/validate.middleware');
const { ApiError } = require('../middleware/error.middleware');

// ==========================================
// 1. CREATE OR GET EXISTING CONVERSATION
// ==========================================
// @route   POST /api/conversations
// @access  Private
router.post('/', protect, sanitizeBody(['receiverId']), async (req, res, next) => {
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
      participants: { $all: [senderId, receiverId], $size: 2 }
    }).populate('participants', 'username name avatar');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId]
      });
      conversation = await conversation.populate('participants', 'username name avatar');
    }

    res.status(200).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. GET ALL CONVERSATIONS FOR LOGGED IN USER
// ==========================================
// @route   GET /api/conversations
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const conversations = await Conversation.find({
      participants: userId
    })
      .populate('participants', 'username name avatar')
      .populate('lastMessageSender', 'username name')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    res.status(200).json({ success: true, count: conversations.length, conversations });
  } catch (error) {
    next(error);
  }
});

module.exports = router;