const mongoose = require('mongoose');

const trustScoreSchema = new mongoose.Schema(
  {
    // Reference to the post being scored
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      unique: true,
    },

    // Final calculated trust score (0 - 100)
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    // Component scores (all normalized between 0.0 and 1.0)
    authenticity: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    factualVerification: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    sourceCredibility: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    modelConfidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    // 5-Tier Color Label
    label: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red'],
      required: true,
    },

    // References to evidence items that contributed to this score
    evidenceRefs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Evidence',
      },
    ],

    // Human-readable explanation for the label and reasoning
    explanation: {
      type: String,
      required: true,
    },

    // Version of the scoring model used
    modelVersion: {
      type: String,
      default: 'nexora-trust-v1.0.0',
    },

    // Version of the rule engine used
    ruleVersion: {
      type: String,
      default: 'nexora-rules-v1.0.0',
    },

    // Flag indicating if a rule-based override was applied
    isOverrideApplied: {
      type: Boolean,
      default: false,
    },

    // ── Provider tracking (Google Fact Check integration) ────────────
    // Which provider actually produced the verification
    providerUsed: {
      type: String,
      enum: ['GOOGLE_FACT_CHECK', 'GEMINI', 'PYTHON_MODEL', 'FALLBACK', 'NONE'],
      default: 'NONE',
    },

    // When the analysis was performed
    analyzedAt: {
      type: Date,
      default: null,
    },

    // Google Fact Check specific data (when provider is GOOGLE_FACT_CHECK)
    factCheckData: {
      aggregateStatus: {
        type: String,
        enum: ['VERIFIED_TRUE', 'VERIFIED_FALSE', 'MIXED', 'NO_EVIDENCE', 'UNKNOWN', null],
        default: null,
      },
      claimCount: {
        type: Number,
        default: 0,
      },
      reviewCount: {
        type: Number,
        default: 0,
      },
      publisherNames: [
        {
          type: String,
        },
      ],
    },
  },
  { timestamps: true }
);

// Backward-compatible virtual: map old 'finalScore' access to 'score'
trustScoreSchema.virtual('finalScore').get(function () {
  return this.score;
});

// Ensure virtuals are included in JSON / object output
trustScoreSchema.set('toJSON', { virtuals: true });
trustScoreSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TrustScore', trustScoreSchema);