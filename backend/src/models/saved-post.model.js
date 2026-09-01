const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    }
  },
  { timestamps: true }
);

// Prevent duplicate bookmarks per user
savedPostSchema.index({ user: 1, post: 1 }, { unique: true });

module.exports = mongoose.model('SavedPost', savedPostSchema);