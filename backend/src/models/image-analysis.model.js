const mongoose = require('mongoose');

const imageAnalysisSchema = new mongoose.Schema(
  {
    // Reference to the content job (null for direct analysis)
    contentJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContentJob',
      required: false,
      default: null,
      index: true,
    },

    // Reference to the post
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false,
      default: null,
      index: true,
    },

    // Job tracking for async analysis
    jobId: {
      type: String,
      required: false,
      index: true,
    },

    // Processing status
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },

    // Source image URL
    mediaUrl: {
      type: String,
      required: true,
    },

    // Image metadata
    preprocessing: {
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      channels: { type: Number, default: 3 },
      fileSize: { type: Number, default: 0 },
    },

    // Core analysis results
    manipulationProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    faceManipulationProbability: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    frequencyAnomaly: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    colorAnomaly: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    textureAnomaly: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    // Face detection
    faceDetectionCount: {
      type: Number,
      default: 0,
    },

    hasFace: {
      type: Boolean,
      default: false,
    },

    // Composite trust score
    finalScore: {
      type: Number,
      default: null,
    },

    // Overall confidence in the analysis
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Model version used
    modelVersion: {
      type: String,
      required: true,
    },

    // Processing metadata
    processingTimeMs: {
      type: Number,
      default: 0,
    },

    // Error information if analysis partially failed
    errors: [
      {
        stage: { type: String },
        message: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
imageAnalysisSchema.index({ post: 1 });
imageAnalysisSchema.index({ contentJob: 1 });
imageAnalysisSchema.index({ jobId: 1 });
imageAnalysisSchema.index({ status: 1 });
imageAnalysisSchema.index({ manipulationProbability: -1 });

module.exports = mongoose.model('ImageAnalysis', imageAnalysisSchema);
