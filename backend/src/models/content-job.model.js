const mongoose = require('mongoose');

const contentReferenceSchema = new mongoose.Schema(
  {
    url: { type: String },
    mimeType: { type: String },
    fileSize: { type: Number },
  },
  { _id: false }
);

const contentJobSchema = new mongoose.Schema(
  {
    // Unique job identifier (UUID)
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // The post this job is processing
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },

    // Content type classification
    contentType: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'LINK', 'CLAIM_ENTITY'],
      required: true,
    },

    // Reference to the raw content being processed
    contentReference: {
      type: contentReferenceSchema,
      default: () => ({}),
    },

    // Processing status
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'REVIEW_REQUIRED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },

    // Which AI pipeline this job was routed to
    pipeline: {
      type: String,
      enum: ['nlp', 'image_authenticity', 'video_deepfake', 'audio_authenticity', 'link_extraction', 'claim_entity_extraction'],
      required: true,
    },

    // Model version used for processing
    modelVersion: {
      type: String,
      default: null,
    },

    // Analysis results (populated after processing)
    results: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Error information (populated on failure)
    error: {
      message: { type: String, default: null },
      code: { type: String, default: null },
      stack: { type: String, default: null },
    },

    // Retry tracking
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },

    // Timestamps for pipeline stages
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Indexes
contentJobSchema.index({ post: 1, contentType: 1 });
contentJobSchema.index({ status: 1, createdAt: -1 });
contentJobSchema.index({ jobId: 1 });

module.exports = mongoose.model('ContentJob', contentJobSchema);
