const mongoose = require('mongoose');

// ─── Sub-schemas ─────────────────────────────────────────────────────────

const claimSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    claimType: { type: String, default: null },
    subject: { type: String, default: null },
    predicate: { type: String, default: null },
    object: { type: String, default: null },
    misinformationProbability: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    // Hash of normalized claim text for deduplication
    textHash: { type: String, required: true, index: true },
    // Reference to fact-check results (populated after verification)
    factCheckStatus: {
      type: String,
      enum: ['unverified', 'verifying', 'verified', 'failed'],
      default: 'unverified',
    },
    factCheckResults: [
      {
        publisherName: String,
        publisherSite: String,
        url: String,
        title: String,
        rating: String,
      },
    ],
  },
  { _id: false }
);

const entitySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    type: { type: String, required: true }, // PERSON, ORG, LOCATION, DATE, etc.
    confidence: { type: Number, default: 1.0 },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────────────────

const claimEntitySchema = new mongoose.Schema(
  {
    // Unique job ID for async polling
    jobId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },

    // Processing status
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      index: true,
    },

    // Reference to the content job
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

    // Original input text
    inputText: {
      type: String,
      required: true,
    },

    // Extracted claims (with deduplication)
    claims: [claimSchema],

    // Named entities
    entities: [entitySchema],

    // Text preprocessing results
    preprocessing: {
      characterCount: { type: Number, default: 0 },
      wordCount: { type: Number, default: 0 },
      sentenceCount: { type: Number, default: 0 },
      language: { type: String, default: 'unknown' },
      languageConfidence: { type: Number, default: 0 },
    },

    // Overall confidence in the extraction
    confidence: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },

    // Model version used
    modelVersion: {
      type: String,
      default: 'nexora-claims-v1.0.0',
    },

    // Processing metadata
    processingTimeMs: {
      type: Number,
      default: 0,
    },

    // Error information
    errors: [
      {
        stage: { type: String },
        message: { type: String },
      },
    ],

    // Composite score from fact verification (0-100)
    verificationScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────

// Deduplication index: same post + same claim text hash = duplicate
claimEntitySchema.index({ post: 1, 'claims.textHash': 1 });
claimEntitySchema.index({ post: 1, createdAt: -1 });
claimEntitySchema.index({ contentJob: 1 });
claimEntitySchema.index({ status: 1, createdAt: -1 });
claimEntitySchema.index({ jobId: 1 });

// ─── Static helpers ──────────────────────────────────────────────────────

/**
 * Generate a normalized hash of claim text for deduplication.
 * Lowercased, punctuation-stripped, whitespace-collapsed.
 */
claimEntitySchema.statics.hashClaimText = function (text) {
  const crypto = require('crypto');
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
};

module.exports = mongoose.model('ClaimEntity', claimEntitySchema);
