const mongoose = require('mongoose');

const trustScoreSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      unique: true
    },
    // Sub-scores (Normalized between 0.0 and 1.0)
    authenticityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    factualVerificationScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    sourceCredibilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    modelConfidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    // Calculated final score (0 - 100)
    finalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    // 5-Tier Color Label
    label: {
      type: String,
      enum: ['Green', 'Blue', 'Purple', 'Orange', 'Red'],
      required: true
    },
    // Human-readable explanation for the label
    explanation: {
      type: String,
      required: true
    },
    // Flag indicating if a rule-based override (e.g. forced Red for confirmed fake) was applied
    isOverrideApplied: {
      type: Boolean,
      default: false
    },
    modelAndRuleVersion: {
      type: String,
      default: 'v1.0'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrustScore', trustScoreSchema);