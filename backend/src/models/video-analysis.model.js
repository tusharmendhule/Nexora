const mongoose = require('mongoose');

const frameResultSchema = new mongoose.Schema(
  {
    frameIndex: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    facesDetected: { type: Number, default: 0 },
    hasFace: { type: Boolean, default: false },
    manipulationScore: { type: Number, default: 0, min: 0, max: 1 },
    frequencyAnomaly: { type: Number, default: 0, min: 0, max: 1 },
    colorAnomaly: { type: Number, default: 0, min: 0, max: 1 },
    overallFrameScore: { type: Number, default: 0, min: 0, max: 1 },
  },
  { _id: false }
);

const temporalConsistencySchema = new mongoose.Schema(
  {
    interFrameVariance: { type: Number, default: 0 },
    temporalCoherence: { type: Number, default: 1 },
    flickerScore: { type: Number, default: 0 },
    consistentManipulation: { type: Boolean, default: false },
  },
  { _id: false }
);

const videoAnalysisSchema = new mongoose.Schema(
  {
    // Unique job ID for async polling
    jobId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },

    // Processing status for async job tracking
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      index: true,
    },

    // Composite trust score (0-100)
    finalScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    // Reference to the content job (null for direct analysis)
    contentJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContentJob',
      required: false,
      default: null,
      index: true,
    },

    // Reference to the post (null for standalone analysis without a post)
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false,
      default: null,
      index: true,
    },

    // Original input media URL
    mediaUrl: {
      type: String,
      required: true,
    },

    // Deepfake probability (0-1)
    deepfakeProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Manipulation probability (0-1)
    manipulationProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Total frames in video
    frameCount: {
      type: Number,
      required: true,
    },

    // Number of frames actually analyzed
    analyzedFrames: {
      type: Number,
      required: true,
    },

    // Per-frame analysis results
    frames: [frameResultSchema],

    // Temporal consistency metrics
    temporalConsistency: temporalConsistencySchema,

    // Face detection rate across frames (0-1)
    faceDetectionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    // Overall confidence in the analysis (0-1)
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

    // Video metadata captured during analysis
    videoMetadata: {
      fps: { type: Number },
      width: { type: Number },
      height: { type: Number },
      duration: { type: Number },
    },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Indexes
videoAnalysisSchema.index({ post: 1 });
videoAnalysisSchema.index({ contentJob: 1 });
videoAnalysisSchema.index({ deepfakeProbability: -1 });
videoAnalysisSchema.index({ manipulationProbability: -1 });

module.exports = mongoose.model('VideoAnalysis', videoAnalysisSchema);
