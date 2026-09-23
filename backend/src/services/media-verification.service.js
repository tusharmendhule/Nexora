/**
 * Media Verification Service
 * ==========================
 * Orchestrates the full verification path for IMAGE / VIDEO / AUDIO content:
 *
 *   media → text/claims (Gemini ± Video Intelligence ± Speech-to-Text)
 *         → claim-type gating (factual claims only)
 *         → Google Fact Check
 *         → source credibility
 *         → Trust Score engine (backend calculation)
 *         → Trust Label
 *
 * Key separation (spec §8, §9, §22):
 *   AUTHENTICITY (is the media AI-generated / manipulated?) is completely
 *   separate from FACTUALITY (is the claim true?). AI-generated media with a
 *   verified claim is eligible for BLUE; human media carrying a false claim
 *   maps toward RED via the fact-check override.
 *
 * The Trust Score is always computed by the backend engine — never by a
 * language model.
 */

const mediaClaimsService = require('./media-claims.service');
const factCheckService = require('./fact-check.service');
const sourceCredibilityService = require('./source-credibility.service');
const trustScoreService = require('./trust-score.service');

const MODEL_VERSION = 'nexora-media-verification-v1.0.0';

// Probability at/above which media is reported as AI-generated / synthetic.
// Detection is a real model output; this only maps it to a boolean flag.
const AI_GENERATED_THRESHOLD = 0.5;

// Content types that should map to the PURPLE rule when the media analysis
// concluded the content is opinion/satire and found no factual claims.
const PURPLE_CONTENT_TYPES = new Set(['OPINION', 'SATIRE', 'EDITED']);

function clamp(value, min = 0, max = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolve the content type passed to the Trust Score rule engine.
 */
function resolveRuleContentType(contentType, extraction, selection, fallback) {
  const claimContentType = (extraction?.claimContentType || '').toUpperCase();
  const noFactualClaims = (selection?.factCheckable || []).length === 0;
  if (noFactualClaims && PURPLE_CONTENT_TYPES.has(claimContentType)) {
    return claimContentType.toLowerCase();
  }
  return fallback;
}

/**
 * Verify media content and compute/persist its Trust Score.
 *
 * @param {Object} params
 * @param {string} params.postId - Post id (needed to persist a Trust Score)
 * @param {string} params.contentType - 'IMAGE' | 'VIDEO' | 'AUDIO'
 * @param {string} params.mediaUrl
 * @param {string} [params.caption] - The post's own text (context only)
 * @param {number|null} params.authenticityScore - 1 - manipulation probability,
 *        or null when the authenticity model did not run (then it stays
 *        neutral 0.5 — never assumed authentic or manipulated)
 * @param {number|null} params.modelConfidenceScore - Model confidence (0-1),
 *        or null to fall back to the claim-analysis confidence
 * @param {number} params.manipulationProbability - Max manipulation probability
 * @param {number|null} [params.aiGeneratedProbability] - Real model output
 * @param {string|null} [params.aiDetectionModel]
 * @param {string|null} [params.contentJobId]
 * @param {string} [params.modelVersion]
 * @param {boolean} [params.authenticityUnavailable] - The authenticity model
 *        did not run; its signal is excluded from the score
 * @returns {Object} Verification + trust score result
 */
async function verifyAndScoreMedia({
  postId,
  contentType,
  mediaUrl,
  caption = null,
  authenticityScore = null,
  modelConfidenceScore = null,
  manipulationProbability = 0,
  aiGeneratedProbability = null,
  aiDetectionModel = null,
  contentJobId = null,
  modelVersion = null,
  authenticityUnavailable = false,
}) {
  const verification = await mediaClaimsService.verifyMediaContent({
    postId,
    contentType,
    mediaUrl,
    caption,
    contentJobId,
  });

  const { extraction, selection, factCheck, persisted, summary } = verification;

  // ── Factual verification (Google Fact Check evidence only) ──────────
  const hasFactCheckEvidence = !!(factCheck && factCheck.results && factCheck.results.length > 0);
  const factualVerificationScore = hasFactCheckEvidence
    ? factCheckService.computeFactualVerificationScore(factCheck.results)
    : 0.5; // neutral: no external evidence, never assumed true

  const isConfirmedFalse = hasFactCheckEvidence
    ? factCheckService.isConfirmedFalse(factCheck.results)
    : false;

  // ── Source credibility from real evidence ───────────────────────────
  const sourceCredentialResult = sourceCredibilityService.fromFactCheckResult(
    factCheck || { results: [] },
    { sourceUrl: mediaUrl }
  );
  const sourceCredibilityScore = sourceCredentialResult.available
    ? sourceCredentialResult.score
    : 0.5;

  // ── AI-generated detection (separate from factuality) ───────────────
  const aiProb =
    typeof aiGeneratedProbability === 'number' && !Number.isNaN(aiGeneratedProbability)
      ? clamp(aiGeneratedProbability)
      : null;
  const isDisclosedAI = aiProb !== null && aiProb >= AI_GENERATED_THRESHOLD;

  // ── Trust Score (backend calculation) ───────────────────────────────
  const ruleContentType = resolveRuleContentType(
    contentType,
    extraction,
    selection,
    (contentType || '').toLowerCase()
  );

  // Authenticity is neutral when the model did not run, so the missing signal
  // cannot inflate or deflate the score (spec §31).
  const resolvedAuthenticity =
    typeof authenticityScore === 'number' && !Number.isNaN(authenticityScore)
      ? clamp(authenticityScore)
      : 0.5;

  // Confidence falls back to the real claim-analysis confidence when the
  // authenticity model produced none.
  const resolvedConfidence =
    typeof modelConfidenceScore === 'number' && !Number.isNaN(modelConfidenceScore)
      ? clamp(modelConfidenceScore)
      : typeof extraction.confidence === 'number'
        ? clamp(extraction.confidence)
        : 0.3;

  let trustScoreResult = null;
  if (postId) {
    trustScoreResult = await trustScoreService.computeAndStoreTrustScore(postId, {
      authenticityScore: resolvedAuthenticity,
      factualVerificationScore,
      sourceCredibilityScore,
      modelConfidenceScore: resolvedConfidence,
      contentType: ruleContentType,
      isDisclosedAI,
      isConfirmedFalse,
      manipulationProbability: clamp(manipulationProbability || 0),
      evidence: [],
      modelVersion: modelVersion || MODEL_VERSION,
    });
  }

  return {
    mediaClaims: extraction,
    claimSelection: selection,
    factCheck,
    claimEntityId: persisted ? persisted._id : null,
    factualVerificationScore,
    sourceCredibilityScore,
    resolvedAuthenticityScore: resolvedAuthenticity,
    resolvedModelConfidenceScore: resolvedConfidence,
    authenticityUnavailable: !!authenticityUnavailable,
    isConfirmedFalse,
    sourceCredibility: sourceCredentialResult,
    aiGeneratedProbability: aiProb,
    aiDetectionModel,
    isDisclosedAI,
    ruleContentType,
    trustScoreResult,
    summary,
    signals: extraction?.signals || [],
    modelVersions: {
      mediaClaims: extraction?.modelVersion || null,
      ...(extraction?.modelVersions || {}),
      trustScore: trustScoreService.MODEL_VERSION,
    },
    modelVersion: MODEL_VERSION,
  };
}

module.exports = {
  verifyAndScoreMedia,
  resolveRuleContentType,
  AI_GENERATED_THRESHOLD,
  MODEL_VERSION,
};
