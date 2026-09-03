const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate block records between the same two users
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// Fast lookup: "who has blocked this user?"
blockSchema.index({ blocked: 1 });
// Fast lookup: "who has this user blocked?"
blockSchema.index({ blocker: 1 });

module.exports = mongoose.model('Block', blockSchema);
