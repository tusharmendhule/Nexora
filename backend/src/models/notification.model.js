const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['LIKE', 'POLL_VOTE', 'MESSAGE'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId // Dynamically links to either a Story ID or Message ID
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Automatically deletes the notification document after 30 days (in seconds)
  }
});

module.exports = mongoose.model('Notification', notificationSchema);