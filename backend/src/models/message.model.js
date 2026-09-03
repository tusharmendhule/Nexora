const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  // Delivery status: 'sent', 'delivered', 'read'
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  // Backward-compatible read flags
  read: {
    type: Boolean,
    default: false
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  // Soft Delete / Clear Conversation System
  deletedBySender: {
    type: Boolean,
    default: false
  },
  deletedByRecipient: {
    type: Boolean,
    default: false
  },
  // Idempotency key to prevent duplicate messages
  idempotencyKey: {
    type: String,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for fast queries
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, sender: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ idempotencyKey: 1 }, { sparse: true });

module.exports = mongoose.model('Message', messageSchema);