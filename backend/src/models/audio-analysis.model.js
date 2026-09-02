const mongoose = require('mongoose');

const spectralFeaturesSchema = new mongoose.Schema(
  {
    centroidMean: { type: Number, default: 0 },
    centroidStd: { type: Number, default: 0 },
    bandwidthMean: { type: Number, default: 0 },
    bandwidthStd: { type: Number, default: 0 },
    rolloffMean: { type: Number, default: 0 },
    rolloffStd: { type: Number, default: 0 },
    flatnessMean: { type: Number, default: 0 },
    flatnessStd: { type: Number, default: 0 },
    zeroCrossingRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const melSpectrogramStatsSchema = new mongoose.Schema(
  {
    energyMean: { type: Number, default: 0 },
    energyStd: { type: Number, default: 0 },
    peakFrequency: { type: Number, default: 0 },
    spectralContrast: { type: Number, default: 0 },
    frequencyRange: { type: Number, default: 0 },
  },
  { _id: false }
);

const audioSegmentSchema = new mongoose.Schema(
  {
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    syntheticScore: { type: Number, default: 0, min: 0, max: 1 },
    manipulationScore: { type: Number, default: 0, min: 0, max: 1 },
    spectralAnomaly: { type: Number, default: 0, min: 0, max: 1 },
  },
  { _id: false }
);

const audioPreprocessingSchema = new mongoose.Schema(
  {
    sampleRate: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    channels: { type: Number, default: 1 },
    format: { type: String, default: 'unknown' },
    fileSize: { type: Number, default: 0 },
    bitDepth: { type: Number, default: 16 },
  },
  { _id: false }
);

const audioAnalysisSchema = new mongoose.Schema(
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

    // Audio preprocessing metadata
    preprocessing: {
      type: audioPreprocessingSchema,
      default: () => ({}),
    },

    // Synthetic speech probability (0-1)
    syntheticSpeechProbability: {
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

    // Spectral feature analysis
    spectralFeatures: {
      type: spectralFeaturesSchema,
      default: () => ({}),
    },

    // Mel-spectrogram statistics
    melSpectrogramStats: {
      type: melSpectrogramStatsSchema,
      default: () => ({}),
    },

    // Per-segment analysis results
    segments: [audioSegmentSchema],

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
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Indexes
audioAnalysisSchema.index({ post: 1 });
audioAnalysisSchema.index({ contentJob: 1 });
audioAnalysisSchema.index({ syntheticSpeechProbability: -1 });
audioAnalysisSchema.index({ manipulationProbability: -1 });

module.exports = mongoose.model('AudioAnalysis', audioAnalysisSchema);
