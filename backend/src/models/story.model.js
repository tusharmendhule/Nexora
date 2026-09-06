const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    // Author of the story
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Media file path/URL
    mediaUrl: {
      type: String,
      required: true
    },

    // Type of media (Image or Video)
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image'
    },

    // Content type: 'moment' (stories, shown in the Moments viewer / home
    // story row) or 'clip' (reels-style videos, shown in the Clips tab only).
    storyType: {
      type: String,
      enum: ['moment', 'clip'],
      default: 'moment'
    },

    // Story text caption or overlay
    caption: {
      type: String,
      trim: true,
      default: ''
    },

    // Audience viewers tracking array
    views: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        viewedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // Users who liked the story
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // Replies (comments) viewers left on the story
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        text: {
          type: String,
          trim: true,
          default: ''
        },
        createdAt: {
          type: Date,
          default: Date.now
        },
        replies: [
          {
            user: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User'
            },
            text: {
              type: String,
              trim: true,
              default: ''
            },
            createdAt: {
              type: Date,
              default: Date.now
            }
          }
        ]
      }
    ],

    // Story creation timestamp
    createdAt: {
      type: Date,
      default: Date.now
    }
  }
);

// ==========================================
// ⚡ AUTOMATED EXPIRATION (PARTIAL TTL INDEX)
// ==========================================
// Moments are ephemeral like Instagram Stories: MongoDB automatically deletes
// them 24 hours (86400 seconds) after creation.
//
// Clips are Reels-style content and must NOT expire — the partial filter
// restricts the TTL to `storyType: 'moment'` documents, so clip documents
// (storyType: 'clip') persist until the owner explicitly deletes them.
storySchema.index(
  { createdAt: 1 },
  {
    // Name matches backend/scripts/sync-story-ttl.js so a restart (mongoose
    // autoIndex) reuses the same index instead of creating a duplicate.
    name: 'createdAt_1_moments_only',
    expireAfterSeconds: 86400,
    partialFilterExpression: { storyType: 'moment' },
  }
);

// Compound Index for fetching active stories per user fast
storySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Story', storySchema);