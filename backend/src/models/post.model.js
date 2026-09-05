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

    // Primary content type for the post (text, image, video, audio, link)
    contentType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'link'],
      default: 'text'
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
        },
        altText: {
          type: String,
          default: ''
        },
        fileSize: {
          type: Number
        },
        mimeType: {
          type: String
        }
      }
    ],

    // External link URL (for contentType === 'link')
    linkUrl: {
      type: String,
      trim: true
    },
    linkTitle: {
      type: String,
      trim: true
    },
    linkDescription: {
      type: String,
      trim: true
    },

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

    // Tags — user-defined content tags
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
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
    viewsCount: {
      type: Number,
      default: 0
    },

    // ==========================================
    // AI Trust Score & Verification Fields
    // ==========================================
    // NOTE: No fabricated defaults. A post starts with NO trust score;
    // the AI pipeline computes trustScore/trustBadge and persists them.
    trustScore: {
      type: Number,
      default: null
    },
    trustBadge: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red', null],
      default: null
    },
    trustBreakdown: {
      factualVerification: { type: Number, default: 0 },
      authenticity: { type: Number, default: 0 },
      sourceCredibility: { type: Number, default: 0 },
      modelConfidence: { type: Number, default: 0 }
    },

    // Content verification status — full pipeline lifecycle
    verificationStatus: {
      type: String,
      enum: [
        'PENDING_VERIFICATION',
        'VERIFYING',
        'VERIFIED',
        'REVIEW_REQUIRED',
        'PUBLISHED',
        'REJECTED',
        'FAILED',
        // Legacy values (backward compatibility)
        'unverified',
        'pending',
        'processing',
        'verified',
        'failed',
      ],
      default: 'PENDING_VERIFICATION'
    },

    // Moderation status — content moderation workflow
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged', 'under_review'],
      default: 'pending'
    },

    // Reference to the active pipeline stage tracking document
    pipelineStageRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PipelineStage',
      default: null
    },

    // Overall pipeline completion metadata
    pipelineCompletedAt: {
      type: Date,
      default: null
    },
    pipelineError: {
      message: { type: String, default: null },
      stage: { type: String, default: null }
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
postSchema.index({ text: 'text', hashtags: 'text', tags: 'text' });
postSchema.index({ trustScore: -1 });
postSchema.index({ contentType: 1 });
postSchema.index({ moderationStatus: 1 });
postSchema.index({ verificationStatus: 1 });
postSchema.index({ pipelineStageRef: 1 });

module.exports = mongoose.model('Post', postSchema);