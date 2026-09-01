const mongoose = require('mongoose');

// ─── Single Stage Entry Schema ────────────────────────────────────────

const stageEntrySchema = new mongoose.Schema(
  {
    // Stage identifier (matches pipeline stage names)
    stage: {
      type: String,
      required: true,
      enum: [
        'CONTENT_UPLOAD',
        'CONTENT_TYPE_ROUTING',
        'PREPROCESSING',
        'AI_ANALYSIS',
        'CLAIM_EXTRACTION',
        'ENTITY_EXTRACTION',
        'FACT_VERIFICATION',
        'EVIDENCE_NORMALIZATION',
        'TRUST_SCORE',
        'TRUST_LABEL',
        'MODERATION_DECISION',
        'PUBLICATION',
      ],
    },

    // Current status of this stage
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED'],
      default: 'PENDING',
    },

    // Timestamps for this stage
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },

    // Processing duration in milliseconds
    durationMs: {
      type: Number,
      default: null,
    },

    // Error information (populated on failure)
    error: {
      message: { type: String, default: null },
      code: { type: String, default: null },
      recoverable: { type: Boolean, default: true },
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
    lastRetryAt: {
      type: Date,
      default: null,
    },

    // Model or service version used at this stage
    modelVersion: {
      type: String,
      default: null,
    },

    // Service identifier (which AI/external service was called)
    serviceId: {
      type: String,
      default: null,
    },

    // Stage-specific result data (Mixed for flexibility)
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: true }
);

// ─── Main Pipeline Stage Document ─────────────────────────────────────

const pipelineStageSchema = new mongoose.Schema(
  {
    // Unique pipeline run ID (UUID)
    pipelineId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Reference to the post being processed
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },

    // Content type being processed
    contentType: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'LINK'],
      required: true,
    },

    // Overall pipeline status
    status: {
      type: String,
      enum: [
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'REVIEW_REQUIRED',
        'CANCELLED',
      ],
      default: 'PENDING',
      index: true,
    },

    // Current stage being processed (or last completed stage)
    currentStage: {
      type: String,
      enum: [
        'CONTENT_UPLOAD',
        'CONTENT_TYPE_ROUTING',
        'PREPROCESSING',
        'AI_ANALYSIS',
        'CLAIM_EXTRACTION',
        'ENTITY_EXTRACTION',
        'FACT_VERIFICATION',
        'EVIDENCE_NORMALIZATION',
        'TRUST_SCORE',
        'TRUST_LABEL',
        'MODERATION_DECISION',
        'PUBLICATION',
      ],
      default: 'CONTENT_UPLOAD',
    },

    // Ordered list of all stage entries
    stages: [stageEntrySchema],

    // Final trust score result (populated after TRUST_SCORE stage)
    trustScoreResult: {
      score: { type: Number, default: null },
      label: { type: String, default: null },
      explanation: { type: String, default: null },
      isOverrideApplied: { type: Boolean, default: false },
      componentScores: {
        authenticity: { type: Number, default: null },
        factualVerification: { type: Number, default: null },
        sourceCredibility: { type: Number, default: null },
        modelConfidence: { type: Number, default: null },
      },
    },

    // Final moderation decision (populated after MODERATION_DECISION stage)
    moderationDecision: {
      action: {
        type: String,
        enum: ['PUBLISH', 'REJECT', 'REVIEW_REQUIRED', 'ESCALATE'],
        default: null,
      },
      reason: { type: String, default: null },
      ruleApplied: { type: String, default: null },
    },

    // Final verification status to set on the Post
    finalVerificationStatus: {
      type: String,
      enum: [
        'VERIFIED',
        'REVIEW_REQUIRED',
        'PUBLISHED',
        'REJECTED',
        'FAILED',
      ],
      default: null,
    },

    // Total pipeline processing time in milliseconds
    totalDurationMs: {
      type: Number,
      default: null,
    },

    // Error summary (if pipeline failed)
    error: {
      message: { type: String, default: null },
      stage: { type: String, default: null },
      recoverable: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
pipelineStageSchema.index({ post: 1, createdAt: -1 });
pipelineStageSchema.index({ status: 1, createdAt: -1 });
pipelineStageSchema.index({ contentType: 1 });

module.exports = mongoose.model('PipelineStage', pipelineStageSchema);
