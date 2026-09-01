const mongoose = require('mongoose');

const moderationSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      enum: ['LABEL_OVERRIDE', 'CONTENT_REMOVED', 'DISMISSED', 'FLAGGED_FOR_REVIEW'],
      required: true
    },
    previousLabel: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red', 'None'],
      default: 'None'
    },
    updatedLabel: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red', 'None'],
      default: 'None'
    },
    reason: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Moderation', moderationSchema);