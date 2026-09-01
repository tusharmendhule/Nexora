/**
 * Moderation Decision Service (Module 16)
 * ========================================
 * Determines whether verified content should be published, rejected,
 * or escalated for human review based on configured rules.
 *
 * Decision matrix:
 *   - TRUST_SCORE >= 80 (Green) → auto-publish
 *   - TRUST_SCORE >= 60 (Blue)  → auto-publish
 *   - TRUST_SCORE 40-59 (Purple/Orange) → publish with warning badge
 *   - TRUST_SCORE < 40 (Red) → reject
 *   - Any confirmed false fact-check → reject
 *   - High manipulation probability → reject
 *   - AI service failures → review_required
 *   - Review_required from any stage → escalate to human
 */

const Post = require('../models/post.model');

// ─── Configuration ────────────────────────────────────────────────────

const DECISION_VERSION = 'nexora-moderation-v1.0.0';

// Auto-publish threshold: score >= this value auto-publishes (unless overridden)
const AUTO_PUBLISH_THRESHOLD = 60;

// Auto-reject threshold: score < this value auto-rejects
const AUTO_REJECT_THRESHOLD = 20;

// Review escalation threshold: scores between reject and publish need review
const REVIEW_THRESHOLD = 40;

// Rule thresholds
const RULES = {
  // Confirmed false fact-check → always reject
  confirmedFalseForcesReject: true,

  // High manipulation probability → always reject
  highManipulationThreshold: 0.7,

  // High misinfo probability → escalate to review
  highMisinfoThreshold: 0.7,

  // Low confidence → escalate to review
  lowConfidenceThreshold: 0.3,
};

// ─── Decision Types ───────────────────────────────────────────────────

const Decision = Object.freeze({
  PUBLISH: 'PUBLISH',
  REJECT: 'REJECT',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  ESCALATE: 'ESCALATE',
});

// ─── Decision Logic ───────────────────────────────────────────────────

/**
 * Evaluate the moderation decision for a post based on pipeline results.
 *
 * @param {Object} pipelineResult - The full pipeline result from the orchestrator
 * @param {Object} options - Additional context (e.g., post owner role, moderation config)
 * @returns {Object} { action, reason, ruleApplied, shouldPublish }
 */
function evaluateDecision(pipelineResult, options = {}) {
  const {
    trustScoreResult = null,
    stageResults = {},
    contentType = 'TEXT',
    hasErrors = false,
    failedStages = [],
    reviewRequiredStages = [],
  } = pipelineResult;

  const { isModerator = false, autoModerationEnabled = true } = options;

  // If auto-moderation is disabled, always escalate to human review
  if (!autoModerationEnabled) {
    return buildDecision(Decision.ESCALATE, 'Auto-moderation disabled', 'CONFIG');
  }

  // ── Check for pipeline failures ────────────────────────────────────

  if (failedStages.length > 0) {
    // If critical stages failed, require review
    const criticalStages = ['AI_ANALYSIS', 'FACT_VERIFICATION', 'TRUST_SCORE'];
    const criticalFailure = failedStages.some((s) => criticalStages.includes(s));

    if (criticalFailure) {
      return buildDecision(
        Decision.REVIEW_REQUIRED,
        `Critical pipeline stage(s) failed: ${failedStages.join(', ')}`,
        'PIPELINE_FAILURE'
      );
    }
  }

  // If any stage explicitly requires review
  if (reviewRequiredStages.length > 0) {
    return buildDecision(
      Decision.REVIEW_REQUIRED,
      `Stage(s) require review: ${reviewRequiredStages.join(', ')}`,
      'STAGE_REVIEW_REQUIRED'
    );
  }

  // ── No trust score computed → review required ──────────────────────

  if (!trustScoreResult || trustScoreResult.score === null || trustScoreResult.score === undefined) {
    return buildDecision(
      Decision.REVIEW_REQUIRED,
      'No trust score computed — cannot determine moderation decision',
      'NO_TRUST_SCORE'
    );
  }

  const score = trustScoreResult.score;
  const label = trustScoreResult.label;
  const isOverrideApplied = trustScoreResult.isOverrideApplied || false;

  // ── Rule 1: Confirmed false fact-check → REJECT ───────────────────

  if (RULES.confirmedFalseForcesReject && isOverrideApplied && label === 'Red') {
    // Check if it's specifically from a confirmed false fact-check
    const explanation = (trustScoreResult.explanation || '').toLowerCase();
    if (explanation.includes('confirmed false') || explanation.includes('rule 1')) {
      return buildDecision(
        Decision.REJECT,
        `Trust score ${score} with confirmed false fact-check (Red label)`,
        'RULE_CONFIRMED_FALSE'
      );
    }
  }

  // ── Rule 2: High manipulation probability → REJECT ────────────────

  const authScore = trustScoreResult.componentScores?.authenticity ?? 0.5;
  const manipulationProb = 1 - authScore;
  if (manipulationProb >= RULES.highManipulationThreshold) {
    return buildDecision(
      Decision.REJECT,
      `High manipulation probability (${(manipulationProb * 100).toFixed(1)}%)`,
      'RULE_HIGH_MANIPULATION'
    );
  }

  // ── Rule 3: Score-based decisions ──────────────────────────────────

  if (score >= AUTO_PUBLISH_THRESHOLD) {
    // High trust → auto-publish
    if (label === 'Red') {
      // Override made it Red despite high score → review
      return buildDecision(
        Decision.REVIEW_REQUIRED,
        `Trust score ${score} but overridden to Red label`,
        'RULE_OVERRIDE_CONFLICT'
      );
    }
    return buildDecision(
      Decision.PUBLISH,
      `Trust score ${score} (label: ${label}) meets auto-publish threshold`,
      'RULE_SCORE_PUBLISH'
    );
  }

  if (score < AUTO_REJECT_THRESHOLD) {
    return buildDecision(
      Decision.REJECT,
      `Trust score ${score} below auto-reject threshold`,
      'RULE_SCORE_REJECT'
    );
  }

  if (score >= REVIEW_THRESHOLD) {
    // Moderate score → publish with badge warning
    return buildDecision(
      Decision.PUBLISH,
      `Trust score ${score} (label: ${label}) — moderate trust, publish with warning badge`,
      'RULE_MODERATE_TRUST'
    );
  }

  // ── Low score but above reject threshold → REVIEW ──────────────────

  return buildDecision(
    Decision.REVIEW_REQUIRED,
    `Trust score ${score} (label: ${label}) — below publish threshold, needs human review`,
    'RULE_LOW_TRUST_REVIEW'
  );
}

/**
 * Apply the moderation decision to the post.
 *
 * @param {string} postId - The post's ObjectId
 * @param {Object} decision - The decision from evaluateDecision()
 * @returns {Object} Updated post document
 */
async function applyDecision(postId, decision) {
  const post = await Post.findById(postId);
  if (!post) {
    throw new Error(`Post not found: ${postId}`);
  }

  const updateFields = {};

  switch (decision.action) {
    case Decision.PUBLISH:
      updateFields.verificationStatus = 'PUBLISHED';
      updateFields.moderationStatus = 'approved';
      updateFields.pipelineCompletedAt = new Date();
      break;

    case Decision.REJECT:
      updateFields.verificationStatus = 'REJECTED';
      updateFields.moderationStatus = 'rejected';
      updateFields.pipelineCompletedAt = new Date();
      updateFields.pipelineError = {
        message: decision.reason,
        stage: 'MODERATION_DECISION',
      };
      break;

    case Decision.REVIEW_REQUIRED:
      updateFields.verificationStatus = 'REVIEW_REQUIRED';
      updateFields.moderationStatus = 'under_review';
      break;

    case Decision.ESCALATE:
      updateFields.verificationStatus = 'REVIEW_REQUIRED';
      updateFields.moderationStatus = 'flagged';
      break;

    default:
      updateFields.verificationStatus = 'FAILED';
      updateFields.moderationStatus = 'pending';
  }

  const updated = await Post.findByIdAndUpdate(postId, updateFields, { new: true });
  return updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function buildDecision(action, reason, ruleApplied) {
  return {
    action,
    reason,
    ruleApplied,
    shouldPublish: action === Decision.PUBLISH,
    timestamp: new Date(),
    version: DECISION_VERSION,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  evaluateDecision,
  applyDecision,
  Decision,
  DECISION_VERSION,
  AUTO_PUBLISH_THRESHOLD,
  AUTO_REJECT_THRESHOLD,
  REVIEW_THRESHOLD,
  RULES,
};
