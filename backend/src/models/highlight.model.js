const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    coverImage: {
      type: String,
      default: ''
    },
    stories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story'
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Highlight', highlightSchema);