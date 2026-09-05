/**
 * Trust Score Service (Module 15)
 * ================================
 * Reusable service for computing, applying rule overrides, persisting,
 * and explaining Nexora Trust Scores.
 *
 * Formula:
 *   Score = 100 × [ 0.35×Authenticity + 0.35×FactualVerification
 *                  + 0.20×SourceCredibility + 0.10×ModelConfidence ]
 *
 * All component scores must be normalized between 0 and 1.
 *
 * Rule-aware overrides:
 *   1. Confirmed false fact-check → RED
 *   2. High manipulation probability → RED
 *   3. Opinion / satire / edited content → PURPLE
 *   4. Disclosed AI-generated + factually supported + score >= 70 → BLUE
 *   5. High-trust content (score >= 80) → GREEN
 *   6. Uncertain / partially verified → ORANGE
 */

const TrustScore = require('../models/trust-score.model');

// ─── Constants ────────────────────────────────────────────────────────

const MODEL_VERSION = 'nexora-trust-v1.0.0';
const RULE_VERSION = 'nexora-rules-v1.0.0';

// Weights for the trust score formula
const WEIGHTS = Object.freeze({
  authenticity: 0.35,
  factualVerification: 0.35,
  sourceCredibility: 0.20,
  modelConfidence: 0.10,
});

// Score thresholds
const THRESHOLDS = Object.freeze({
  highTrust: 80,      // Score >= 80 → GREEN (unless overridden)
  moderateTrust: 70,  // Score >= 70 → candidate for BLUE (disclosed AI)
  lowTrust: 40,       // Score < 40 → RED (low credibility signals)
});

// Rule thresholds
const RULE_THRESHOLDS = Object.freeze({
  highManipulationProbability: 0.7,  // >= this forces RED
});

// Label enum
const Label = Object.freeze({
  GREEN: 'Green',
  BLUE: 'Blue',
  PURPLE: 'Purple',
  ORANGE: 'Orange',
  RED: 'Red',
});

// Content types that can receive special label treatment
const OPINION_CONTENT_TYPES = ['opinion', 'satire', 'edited', 'editorial', 'parody'];

// ─── Input Validation ─────────────────────────────────────────────────

/**
 * Clamp a value to the [0, 1] range.
 */
function clamp(value, min = 0, max = 1) {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate and normalize component scores to [0, 1].
 * Throws if required inputs are missing.
 *
 * @param {Object} input
 * @param {number} input.authenticityScore
 * @param {number} input.factualVerificationScore
 * @param {number} input.sourceCredibilityScore
 * @param {number} input.modelConfidenceScore
 * @returns {Object} Normalized component scores
 */
function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Trust score input is required');
  }

  const fields = [
    'authenticityScore',
    'factualVerificationScore',
    'sourceCredibilityScore',
    'modelConfidenceScore',
  ];

  for (const field of fields) {
    if (input[field] === undefined || input[field] === null) {
      throw new Error(`Missing required score: ${field}`);
    }
    if (typeof input[field] !== 'number') {
      throw new Error(`${field} must be a number`);
    }
  }

  return {
    authenticity: clamp(input.authenticityScore),
    factualVerification: clamp(input.factualVerificationScore),
    sourceCredibility: clamp(input.sourceCredibilityScore),
    modelConfidence: clamp(input.modelConfidenceScore),
  };
}

// ─── Core Formula ─────────────────────────────────────────────────────

/**
 * Compute the raw weighted trust score from component scores.
 * Returns a number between 0 and 100, rounded to the nearest integer.
 *
 * @param {Object} components - { authenticity, factualVerification, sourceCredibility, modelConfidence }
 * @returns {number} Rounded score (0-100)
 */
function computeRawScore(components) {
  const raw =
    WEIGHTS.authenticity * components.authenticity +
    WEIGHTS.factualVerification * components.factualVerification +
    WEIGHTS.sourceCredibility * components.sourceCredibility +
    WEIGHTS.modelConfidence * components.modelConfidence;

  return Math.round(raw * 100);
}

// ─── Rule Engine ──────────────────────────────────────────────────────

/**
 * Evaluate rule-based overrides and determine the final label + reasoning.
 *
 * Rules are checked in priority order:
 *   1. Confirmed false fact-check → RED
 *   2. High manipulation probability → RED
 *   3. Opinion / satire / edited content → PURPLE
 *   4. Disclosed AI-generated + factually supported + score >= 70 → BLUE
 *   5. High-trust content (score >= 80) → GREEN
 *   6. Uncertain / partially verified → ORANGE
 *   7. Low trust (score < 40) → RED
 *
 * @param {number} score - Computed raw score (0-100)
 * @param {Object} options
 * @param {boolean}  [options.isConfirmedFalse]       - Rule 1
 * @param {number}   [options.manipulationProbability] - Rule 2 (0-1)
 * @param {string}   [options.contentType]             - Rule 3 (opinion/satire/edited)
 * @param {boolean}  [options.isDisclosedAI]           - Rule 4
 * @param {Object[]} [options.evidence]                - Evidence items for reasoning
 * @returns {{ label, reasoning, isOverrideApplied }}
 */
function evaluateRules(score, options = {}) {
  const {
    isConfirmedFalse = false,
    manipulationProbability = 0,
    contentType = '',
    isDisclosedAI = false,
    evidence = [],
  } = options;

  const reasoning = [];
  let label = null;
  let isOverrideApplied = false;

  // ── Rule 1: Confirmed false fact-check → RED ─────────────────────
  if (isConfirmedFalse) {
    label = Label.RED;
    isOverrideApplied = true;
    reasoning.push(
      'Rule 1 (CONFIRMED_FALSE_FACT_CHECK): An external fact-check identified this claim as false, so the content is labeled RED.'
    );
    if (evidence.length > 0) {
      const falseEvidence = evidence.filter(
        (e) => e.verdict === 'refutes' || e.evidenceCategory === 'negative'
      );
      if (falseEvidence.length > 0) {
        reasoning.push(
          `  Evidence sources confirming false: ${falseEvidence.map((e) => e.source || e.sourceType).join(', ')}.`
        );
      }
    }
  }

  // ── Rule 2: High manipulation probability → RED ──────────────────
  if (
    !label &&
    manipulationProbability >= RULE_THRESHOLDS.highManipulationProbability
  ) {
    label = Label.RED;
    isOverrideApplied = true;
    reasoning.push(
      `Rule 2 (HIGH_MANIPULATION_PROBABILITY): Media manipulation indicators are strong (${(manipulationProbability * 100).toFixed(1)}%), so the content is labeled RED.`
    );
  }

  // ── Rule 3: Opinion / satire / edited content → PURPLE ───────────
  if (!label) {
    const normalizedType = (contentType || '').toLowerCase().trim();
    if (OPINION_CONTENT_TYPES.includes(normalizedType)) {
      label = Label.PURPLE;
      isOverrideApplied = true;
      reasoning.push(
        `Rule 3 (OPINION_SATIRE_EDITED): Analysis indicates this is opinion, satire, or substantially edited content rather than ordinary factual reporting (content type "${contentType}"), so it is labeled PURPLE.`
      );
    }
  }

  // ── Rule 4: Disclosed AI + factually supported + score >= 70 → BLUE
  if (!label && isDisclosedAI && score >= THRESHOLDS.moderateTrust) {
    label = Label.BLUE;
    reasoning.push(
      `Rule 4 (AI_GENERATED_BUT_VERIFIED): AI-generated content indicators were detected, but the underlying claim was supported by available fact-check evidence (score ${score}), so it is labeled BLUE.`
    );
  }

  // ── Rule 5: High-trust content (score >= 80) → GREEN ─────────────
  if (!label && score >= THRESHOLDS.highTrust) {
    label = Label.GREEN;
    reasoning.push(
      `Rule 5 (VERIFIED_AND_AUTHENTIC): Evidence supports the claim and no significant manipulation or misinformation indicators were detected (score ${score}), so it is labeled GREEN.`
    );
  }

  // ── Rule 6: Uncertain / partially verified → ORANGE ──────────────
  if (!label && score >= THRESHOLDS.lowTrust) {
    label = Label.ORANGE;
    reasoning.push(
      `Rule 6 (PARTIALLY_VERIFIED): Available evidence is incomplete or conflicting (score ${score}, between ${THRESHOLDS.lowTrust} and ${THRESHOLDS.highTrust}), so this content should be treated with caution — labeled ORANGE.`
    );
    // Add nuance: what makes it uncertain?
    const hasNegativeEvidence = evidence.some(
      (e) => e.evidenceCategory === 'negative' || e.verdict === 'refutes'
    );
    const hasConflictingEvidence = evidence.some(
      (e) => e.evidenceCategory === 'conflicting' || e.verdict === 'mixed'
    );
    if (hasConflictingEvidence) {
      reasoning.push('  Conflicting evidence signals contribute to uncertainty.');
    }
    if (hasNegativeEvidence) {
      reasoning.push('  Some negative evidence was found but not conclusive.');
    }
  }

  // ── Rule 7: Low trust (score < 40) → RED ─────────────────────────
  if (!label && score < THRESHOLDS.lowTrust) {
    label = Label.RED;
    isOverrideApplied = true;
    reasoning.push(
      `Rule 7 (LOW_TRUST_SIGNALS): Credibility signals are too low (score ${score} < ${THRESHOLDS.lowTrust}), so the content is labeled RED.`
    );
  }

  // Fallback (should never happen with complete rules, but be safe)
  if (!label) {
    label = Label.ORANGE;
    reasoning.push('No specific rule matched; defaulting to ORANGE.');
  }

  return { label, reasoning, isOverrideApplied };
}

// ─── Main Entry Point ─────────────────────────────────────────────────

/**
 * Compute the trust score for a post.
 *
 * @param {Object} input
 * @param {number}  input.authenticityScore       - Normalized 0-1
 * @param {number}  input.factualVerificationScore - Normalized 0-1
 * @param {number}  input.sourceCredibilityScore   - Normalized 0-1
 * @param {number}  input.modelConfidenceScore     - Normalized 0-1
 * @param {Object[]} [input.evidence]              - Evidence items (optional)
 * @param {string}   [input.contentType]           - Content type (optional)
 * @param {boolean}  [input.isConfirmedFalse]      - Confirmed false flag (optional)
 * @param {number}   [input.manipulationProbability] - Manipulation probability (optional)
 * @param {boolean}  [input.isDisclosedAI]         - Disclosed AI flag (optional)
 * @returns {Object} Full trust score result
 */
function computeTrustScore(input) {
  // 1. Validate and normalize component scores
  const components = validateInput(input);

  // 2. Compute raw weighted score
  const score = computeRawScore(components);

  // 3. Evaluate rule-based overrides
  const { label, reasoning, isOverrideApplied } = evaluateRules(score, {
    isConfirmedFalse: input.isConfirmedFalse || false,
    manipulationProbability: input.manipulationProbability || 0,
    contentType: input.contentType || '',
    isDisclosedAI: input.isDisclosedAI || false,
    evidence: input.evidence || [],
  });

  // 4. Build the result object
  const result = {
    trustScore: score,
    componentScores: {
      authenticity: components.authenticity,
      factualVerification: components.factualVerification,
      sourceCredibility: components.sourceCredibility,
      modelConfidence: components.modelConfidence,
    },
    reasoning,
    modelVersion: MODEL_VERSION,
    ruleVersion: RULE_VERSION,
    label,
    isOverrideApplied,
  };

  return result;
}

// ─── Persistence ──────────────────────────────────────────────────────

/**
 * Compute and persist the trust score for a post.
 *
 * @param {string} postId - The post's ObjectId
 * @param {Object} input  - See computeTrustScore() for input shape
 * @param {Object[]} [evidenceRefs] - Evidence ObjectId references
 * @returns {Object} Saved TrustScore document
 */
async function computeAndStoreTrustScore(postId, input, evidenceRefs = []) {
  if (!postId) {
    throw new Error('Post ID is required to store trust score');
  }

  const result = computeTrustScore(input);

  const explanation = result.reasoning.join('\n');

  // Allow the caller to record the analysis model that produced the
  // component scores (e.g. 'nexora-image-v1.0.0'); otherwise the trust
  // engine's own version is recorded.
  const analysisModelVersion = input.modelVersion || result.modelVersion;

  const trustScore = await TrustScore.findOneAndUpdate(
    { post: postId },
    {
      post: postId,
      score: result.trustScore,
      authenticity: result.componentScores.authenticity,
      factualVerification: result.componentScores.factualVerification,
      sourceCredibility: result.componentScores.sourceCredibility,
      modelConfidence: result.componentScores.modelConfidence,
      label: result.label,
      evidenceRefs,
      explanation,
      modelVersion: analysisModelVersion,
      ruleVersion: result.ruleVersion,
      isOverrideApplied: result.isOverrideApplied,
    },
    { upsert: true, new: true }
  );

  return trustScore;
}

/**
 * Retrieve the stored trust score for a post.
 *
 * @param {string} postId
 * @returns {Object|null} TrustScore document or null
 */
async function getTrustScoreByPost(postId) {
  return TrustScore.findOne({ post: postId }).populate('evidenceRefs');
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  // Core computation
  computeTrustScore,
  computeRawScore,
  validateInput,

  // Rule engine
  evaluateRules,

  // Persistence
  computeAndStoreTrustScore,
  getTrustScoreByPost,

  // Constants (exposed for testing and extensibility)
  WEIGHTS,
  THRESHOLDS,
  RULE_THRESHOLDS,
  Label,
  MODEL_VERSION,
  RULE_VERSION,
  OPINION_CONTENT_TYPES,

  // Helpers (exposed for testing)
  clamp,
};
