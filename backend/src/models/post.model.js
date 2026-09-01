const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    // Author of the post
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Post Content & Text
    text: {
      type: String,
      trim: true,
      default: ''
    },

    // Post Content Format (Standard, Reel, Article, Poll)
    postType: {
      type: String,
      enum: ['standard', 'reels', 'article', 'poll'],
      default: 'standard'
    },

    // Multi-Media Attachments
    media: [
      {
        url: {
          type: String,
          required: true
        },
        type: {
          type: String,
          enum: ['image', 'video', 'audio', 'document'],
          default: 'image'
        },
        thumbnailUrl: {
          type: String
        }
      }
    ],

    // Interactive Poll Option
    pollOptions: [
      {
        optionText: { type: String, required: true },
        votes: { type: Number, default: 0 },
        votedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
      }
    ],

    // Tagged Users (@mentions)
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // Hashtags array for trending analytics
    hashtags: [
      {
        type: String,
        lowercase: true,
        trim: true
      }
    ],

    // Location Tagging
    location: {
      name: { type: String },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    },

    // Engagement Metrics
    likesCount: {
      type: Number,
      default: 0
    },
    commentsCount: {
      type: Number,
      default: 0
    },
    sharesCount: {
      type: Number,
      default: 0
    },

    // ==========================================
    // AI Trust Score & Verification Fields
    // ==========================================
    trustScore: {
      type: Number,
      default: 75.0
    },
    trustBadge: {
      type: String,
      enum: ['Green', 'Blue', 'Yellow', 'Red'],
      default: 'Blue'
    },
    trustBreakdown: {
      factualVerification: { type: Number, default: 0 },
      authenticity: { type: Number, default: 0 },
      sourceCredibility: { type: Number, default: 0 },
      modelConfidence: { type: Number, default: 0 }
    },

    // Visibility Settings
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public'
    },

    // Status Flags
    isArchived: {
      type: Boolean,
      default: false
    },
    isPinned: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// ==========================================
// DATABASE INDEXES
// ==========================================
postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ text: 'text', hashtags: 'text' });
postSchema.index({ trustScore: -1 });

module.exports = mongoose.model('Post', postSchema);