const mongoose = require('mongoose');

const followerSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Prevent duplicate follow records between the same two users
followerSchema.index({ follower: 1, following: 1 }, { unique: true });

module.exports = mongoose.model('Follower', followerSchema);