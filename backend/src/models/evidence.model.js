const mongoose = require('mongoose');

// ─── Evidence Item Schema ─────────────────────────────────────────────

const evidenceItemSchema = new mongoose.Schema(
  {
    // Who or what produced this evidence
    source: {
      type: String,
      required: true,
      trim: true,
    },

    // Category of source (fact-check API, AI detector, user report, etc.)
    sourceType: {
      type: String,
      required: true,
      enum: [
        'fact_check_api',
        'ai_detector',
        'source_analysis',
        'claim_extraction',
        'model_confidence',
        'content_metadata',
        'manual_review',
        'custom', // extensible for future providers
      ],
    },

    // The claim this evidence relates to
    claim: {
      type: String,
      required: true,
      trim: true,
    },

    // Normalized verdict: what this evidence says about the claim
    verdict: {
      type: String,
      required: true,
      enum: ['supports', 'refutes', 'mixed', 'insufficient', 'unknown'],
    },

    // Confidence in this evidence item (0.0 - 1.0)
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // How relevant this evidence is to the claim (0.0 - 1.0)
    relevance: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Reliability score of the source (0.0 - 1.0)
    sourceReliability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // When this evidence was collected
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // URL or reference to the original source (if applicable)
    url: {
      type: String,
      default: null,
      trim: true,
    },

    // Evidence classification for aggregation
    evidenceCategory: {
      type: String,
      required: true,
      enum: ['positive', 'negative', 'conflicting', 'insufficient'],
    },

    // Raw data from the source provider (for debugging / reprocessing)
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Version of the normalization logic used
    normalizationVersion: {
      type: String,
      default: 'v1.0',
    },
  },
  { _id: true, timestamps: true }
);

// ─── Main Schema ──────────────────────────────────────────────────────

const evidenceSchema = new mongoose.Schema(
  {
    // Reference to the post being analyzed
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },

    // Reference to the content job (if part of a pipeline)
    contentJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContentJob',
      required: false,
      default: null,
      index: true,
    },

    // The claim being evaluated
    claim: {
      type: String,
      required: true,
      trim: true,
    },

    // Normalized evidence items from various sources
    evidenceItems: [evidenceItemSchema],

    // Aggregated evidence classification
    aggregateVerdict: {
      type: String,
      required: true,
      enum: ['supports', 'refutes', 'mixed', 'insufficient', 'unknown'],
    },

    // Evidence category distribution
    evidenceSummary: {
      positive: { type: Number, default: 0 },
      negative: { type: Number, default: 0 },
      conflicting: { type: Number, default: 0 },
      insufficient: { type: Number, default: 0 },
    },

    // Weighted confidence score (0.0 - 1.0)
    weightedConfidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Number of sources that provided evidence
    sourceCount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Overall evidence quality score (0.0 - 1.0)
    evidenceQuality: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // Processing metadata
    processingTimeMs: {
      type: Number,
      default: 0,
    },

    // Normalization version used
    normalizationVersion: {
      type: String,
      default: 'v1.0',
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────

evidenceSchema.index({ post: 1, claim: 1 });
evidenceSchema.index({ post: 1, createdAt: -1 });
evidenceSchema.index({ contentJob: 1 });
evidenceSchema.index({ aggregateVerdict: 1 });

module.exports = mongoose.model('Evidence', evidenceSchema);
