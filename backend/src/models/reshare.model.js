const mongoose = require('mongoose');

const reshareSchema = new mongoose.Schema(
  {
    // The user who reshares the post
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // The original post being reshared
    originalPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    }
  },
  { timestamps: true }
);

// A user can reshare the same post at most once
reshareSchema.index({ user: 1, originalPost: 1 }, { unique: true });

module.exports = mongoose.model('Reshare', reshareSchema);