const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    claimType: { type: String, default: null },
    subject: { type: String, default: null },
    predicate: { type: String, default: null },
    object: { type: String, default: null },
    misinformationProbability: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
  },
  { _id: false }
);

const entitySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    label: { type: String, required: true }, // PERSON, ORG, GPE, DATE, etc.
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
  },
  { _id: false }
);

const textAnalysisSchema = new mongoose.Schema(
  {
    // Reference to the content job (null for direct text analysis)
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
      required: true,
      index: true,
    },

    // Original input text
    inputText: {
      type: String,
      required: true,
    },

    // Text preprocessing results
    preprocessing: {
      characterCount: { type: Number, default: 0 },
      wordCount: { type: Number, default: 0 },
      sentenceCount: { type: Number, default: 0 },
      language: { type: String, default: 'unknown' },
      languageConfidence: { type: Number, default: 0 },
      cleanedText: { type: String, default: '' },
    },

    // Misinformation classification
    misinformationProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // AI-generated text likelihood
    aiGeneratedProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Extracted claims
    claims: [claimSchema],

    // Named entities
    entities: [entitySchema],

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

    // Raw model outputs for debugging / reprocessing
    rawOutputs: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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
textAnalysisSchema.index({ post: 1 });
textAnalysisSchema.index({ contentJob: 1 });
textAnalysisSchema.index({ misinformationProbability: -1 });
textAnalysisSchema.index({ aiGeneratedProbability: -1 });

module.exports = mongoose.model('TextAnalysis', textAnalysisSchema);
