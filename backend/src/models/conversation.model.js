const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    lastMessage: {
      type: String,
      default: ''
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    // Per-participant unread counts
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  { timestamps: true }
);

// Index for fast lookup of conversations by participant
conversationSchema.index({ participants: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);