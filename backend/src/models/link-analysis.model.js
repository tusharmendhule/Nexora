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
    label: { type: String, required: true },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
  },
  { _id: false }
);

const factCheckResultSchema = new mongoose.Schema(
  {
    claimText: { type: String, required: true },
    publisherName: { type: String, default: null },
    publisherSite: { type: String, default: null },
    url: { type: String, default: null },
    title: { type: String, default: null },
    rating: { type: String, default: null },
  },
  { _id: false }
);

const linkAnalysisSchema = new mongoose.Schema(
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

    // Reference to the post (null for standalone analysis)
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false,
      default: null,
      index: true,
    },

    // Original URL submitted by the user
    originalUrl: {
      type: String,
      required: true,
    },

    // Final URL after redirect resolution
    resolvedUrl: {
      type: String,
      default: null,
    },

    // HTTP status code from the fetch
    httpStatus: {
      type: Number,
      default: null,
    },

    // Redirect chain (list of URLs followed)
    redirectChain: [
      {
        url: { type: String },
        statusCode: { type: Number },
      },
    ],

    // Page metadata extracted from HTML
    pageTitle: {
      type: String,
      default: null,
    },
    metaDescription: {
      type: String,
      default: null,
    },
    ogTitle: {
      type: String,
      default: null,
    },
    ogDescription: {
      type: String,
      default: null,
    },
    ogImage: {
      type: String,
      default: null,
    },
    ogType: {
      type: String,
      default: null,
    },
    ogSiteName: {
      type: String,
      default: null,
    },
    keywords: [
      {
        type: String,
      },
    ],
    canonicalUrl: {
      type: String,
      default: null,
    },
    language: {
      type: String,
      default: null,
    },

    // Extracted text content from the page (cleaned)
    extractedText: {
      type: String,
      default: null,
    },

    // Text preprocessing results
    preprocessing: {
      characterCount: { type: Number, default: 0 },
      wordCount: { type: Number, default: 0 },
      sentenceCount: { type: Number, default: 0 },
      language: { type: String, default: 'unknown' },
      languageConfidence: { type: Number, default: 0 },
    },

    // Misinformation probability (0-1)
    misinformationProbability: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },

    // Source credibility score (0-1) based on domain analysis
    sourceCredibility: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },

    // Extracted claims from page content
    claims: [claimSchema],

    // Named entities extracted from page content
    entities: [entitySchema],

    // Fact-check results for claims
    factCheckResults: [factCheckResultSchema],

    // Overall confidence in the analysis (0-1)
    confidence: {
      type: Number,
      required: false,
      min: 0,
      max: 1,
    },

    // Model / analysis version used
    modelVersion: {
      type: String,
      default: 'nexora-link-v1.0.0',
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
linkAnalysisSchema.index({ post: 1 });
linkAnalysisSchema.index({ contentJob: 1 });
linkAnalysisSchema.index({ originalUrl: 1 });
linkAnalysisSchema.index({ misinformationProbability: -1 });

module.exports = mongoose.model('LinkAnalysis', linkAnalysisSchema);
