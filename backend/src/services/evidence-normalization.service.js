/**
 * Evidence Normalization Service (Module 14)
 * ===========================================
 * Normalizes heterogeneous evidence from multiple providers into a
 * common evidence structure for the Trust Score system.
 *
 * Inputs normalized:
 *   - AI detector results (text authenticity, misinformation probability)
 *   - Fact-check results (Google Fact Check API, other providers)
 *   - Source information (publisher credibility, domain reputation)
 *   - Claim results (extracted claims, verification status)
 *   - Model confidence (analysis confidence scores)
 *   - Content metadata (content type, media analysis)
 *
 * Evidence categories:
 *   - POSITIVE: evidence that supports the claim
 *   - NEGATIVE: evidence that refutes the claim
 *   - CONFLICTING: mixed signals from different sources
 *   - INSUFFICIENT: no meaningful evidence available
 *
 * Design principle: Missing evidence is NEVER converted into positive results.
 */

const Evidence = require('../models/evidence.model');

// ─── Configuration ────────────────────────────────────────────────────

const NORMALIZATION_VERSION = 'v1.0';

// Source reliability defaults (0.0 - 1.0)
// Extensible: add new providers here without changing core logic
const SOURCE_RELIABILITY_DEFAULTS = {
  fact_check_api: 0.85,
  ai_detector: 0.70,
  source_analysis: 0.65,
  claim_extraction: 0.60,
  model_confidence: 0.75,
  content_metadata: 0.50,
  manual_review: 0.90,
  custom: 0.50,
};

// ─── Evidence Category Classification ─────────────────────────────────

/**
 * Classify evidence into a category based on verdict and confidence.
 *
 * Rules:
 *   - INSUFFICIENT: no meaningful data, null/undefined verdict, or empty source
 *   - CONFLICTING: mixed verdict signals or very low confidence
 *   - POSITIVE: supports verdict with acceptable confidence
 *   - NEGATIVE: refutes verdict with acceptable confidence
 */
function classifyEvidenceCategory(verdict, confidence) {
  // Missing or empty verdict → insufficient
  if (!verdict || typeof verdict !== 'string') {
    return 'insufficient';
  }

  const normalized = verdict.toLowerCase().trim();

  // Explicit "no evidence" / "unknown" / "insufficient" → insufficient
  if (['insufficient', 'unknown', 'no_evidence', 'none', ''].includes(normalized)) {
    return 'insufficient';
  }

  // Very low confidence on any verdict → insufficient
  // (We don't trust low-confidence signals regardless of direction)
  if (typeof confidence === 'number' && confidence < 0.2) {
    return 'insufficient';
  }

  // Mixed / contradictory signals
  if (['mixed', 'partial', 'uncertain', 'ambiguous'].includes(normalized)) {
    return 'conflicting';
  }

  // Positive signals
  if (['supports', 'true', 'verified', 'accurate', 'positive', 'authentic', 'credible'].includes(normalized)) {
    return 'positive';
  }

  // Negative signals
  if (['refutes', 'false', 'debunked', 'inaccurate', 'negative', 'fake', 'misleading', 'manipulated'].includes(normalized)) {
    return 'negative';
  }

  // Unknown verdict → insufficient (not positive!)
  return 'insufficient';
}

// ─── Normalizer Registry (extensible) ─────────────────────────────────

/**
 * Registry of normalizer functions for each source type.
 * To add a new fact-check provider, register a normalizer here.
 */
const normalizers = {};

/**
 * Register a normalizer for a source type.
 * This allows adding new providers without modifying core logic.
 *
 * @param {string} sourceType - The source type identifier
 * @param {Function} normalizer - Function(input) => evidenceItem[]
 */
function registerNormalizer(sourceType, normalizer) {
  if (typeof normalizer !== 'function') {
    throw new Error(`Normalizer for "${sourceType}" must be a function`);
  }
  normalizers[sourceType] = normalizer;
}

// ─── Built-in Normalizers ─────────────────────────────────────────────

/**
 * Normalize AI detector results (text authenticity, misinformation probability).
 *
 * @param {Object} input - { misinfoProbability, aiGeneratedProbability, confidence, modelVersion }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeAIDetectorResults(input, claim) {
  const {
    misinfoProbability = null,
    aiGeneratedProbability = null,
    confidence = 0.5,
    modelVersion = 'unknown',
    sourceName = 'AI Text Analyzer',
  } = input || {};

  // Determine verdict based on misinformation probability
  let verdict = 'unknown';
  let evidenceConfidence = confidence;

  if (misinfoProbability !== null && typeof misinfoProbability === 'number') {
    if (misinfoProbability > 0.7) {
      verdict = 'refutes'; // High misinfo probability → evidence against claim
      evidenceConfidence = Math.min(confidence, 1 - misinfoProbability + 0.3);
    } else if (misinfoProbability < 0.3) {
      verdict = 'supports'; // Low misinfo probability → evidence for claim
      evidenceConfidence = Math.min(confidence, misinfoProbability + 0.5);
    } else {
      verdict = 'mixed'; // Ambiguous range
      evidenceConfidence = confidence * 0.7;
    }
  }

  const category = classifyEvidenceCategory(verdict, evidenceConfidence);

  return {
    source: sourceName,
    sourceType: 'ai_detector',
    claim,
    verdict,
    confidence: clamp(evidenceConfidence),
    relevance: 0.8, // AI detector results are moderately relevant
    sourceReliability: SOURCE_RELIABILITY_DEFAULTS.ai_detector,
    timestamp: new Date(),
    url: null,
    evidenceCategory: category,
    rawData: {
      misinfoProbability,
      aiGeneratedProbability,
      modelVersion,
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * Normalize fact-check results from any provider.
 *
 * @param {Object} input - { status, reviews[], source, provider? }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeFactCheckResults(input, claim) {
  const {
    status = 'UNKNOWN',
    reviews = [],
    source = 'fact_check_api',
    provider = 'Google Fact Check API',
    factualVerificationScore = null,
  } = input || {};

  // Map verification status to evidence verdict
  const statusToVerdict = {
    VERIFIED_TRUE: 'supports',
    VERIFIED_FALSE: 'refutes',
    MIXED: 'mixed',
    NO_EVIDENCE: 'insufficient',
    UNKNOWN: 'insufficient',
  };

  const verdict = statusToVerdict[status] || 'insufficient';

  // Compute confidence from reviews and score
  let confidence = 0.5;
  if (factualVerificationScore !== null) {
    // Score is 0.0 - 1.0; use it directly as confidence direction
    confidence = Math.abs(factualVerificationScore - 0.5) * 2; // Map to 0-1
    confidence = Math.max(0.3, confidence); // Minimum 0.3 if we have a score
  }
  if (reviews.length > 0) {
    confidence = Math.min(1.0, confidence + reviews.length * 0.05);
  }

  const category = classifyEvidenceCategory(verdict, confidence);

  // Extract best URL from reviews
  const url = reviews.length > 0 ? (reviews[0].url || null) : null;

  return {
    source: provider,
    sourceType: 'fact_check_api',
    claim,
    verdict,
    confidence: clamp(confidence),
    relevance: 0.9, // Fact-check results are highly relevant
    sourceReliability: SOURCE_RELIABILITY_DEFAULTS[source] || SOURCE_RELIABILITY_DEFAULTS.fact_check_api,
    timestamp: new Date(),
    url,
    evidenceCategory: category,
    rawData: {
      status,
      reviewCount: reviews.length,
      publisherNames: reviews.map((r) => r.publisher?.name || r.publisherName).filter(Boolean),
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * Normalize source/credibility analysis results.
 *
 * @param {Object} input - { credibilityScore, domainReputation, publisherName, url? }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeSourceAnalysis(input, claim) {
  const {
    credibilityScore = null,
    domainReputation = null,
    publisherName = 'Unknown Source',
    url = null,
  } = input || {};

  // Use credibility score to determine verdict
  let verdict = 'unknown';
  let confidence = 0.5;

  const score = credibilityScore ?? domainReputation;

  if (score !== null && typeof score === 'number') {
    if (score > 0.7) {
      verdict = 'supports';
      confidence = score;
    } else if (score < 0.3) {
      verdict = 'refutes';
      confidence = 1 - score;
    } else {
      verdict = 'mixed';
      confidence = 0.4;
    }
  }

  const category = classifyEvidenceCategory(verdict, confidence);

  return {
    source: publisherName,
    sourceType: 'source_analysis',
    claim,
    verdict,
    confidence: clamp(confidence),
    relevance: 0.6, // Source analysis is less directly relevant
    sourceReliability: score !== null ? clamp(score) : SOURCE_RELIABILITY_DEFAULTS.source_analysis,
    timestamp: new Date(),
    url,
    evidenceCategory: category,
    rawData: {
      credibilityScore,
      domainReputation,
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * Normalize claim extraction results.
 *
 * @param {Object} input - { factCheckStatus, verificationScore, claims[] }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeClaimResults(input, claim) {
  const {
    factCheckStatus = 'unverified',
    verificationScore = null,
    claimConfidence = 0.5,
    provider = 'Claim Extraction Service',
  } = input || {};

  let verdict = 'unknown';
  let confidence = claimConfidence;

  switch (factCheckStatus) {
    case 'verified':
      verdict = verificationScore !== null && verificationScore > 60 ? 'supports' : 'mixed';
      confidence = verificationScore !== null ? verificationScore / 100 : claimConfidence;
      break;
    case 'unverified':
      verdict = 'insufficient';
      confidence = 0.3;
      break;
    case 'failed':
      verdict = 'insufficient';
      confidence = 0.2;
      break;
    default:
      verdict = 'insufficient';
      confidence = 0.2;
  }

  const category = classifyEvidenceCategory(verdict, confidence);

  return {
    source: provider,
    sourceType: 'claim_extraction',
    claim,
    verdict,
    confidence: clamp(confidence),
    relevance: 0.85,
    sourceReliability: SOURCE_RELIABILITY_DEFAULTS.claim_extraction,
    timestamp: new Date(),
    url: null,
    evidenceCategory: category,
    rawData: {
      factCheckStatus,
      verificationScore,
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * Normalize model confidence data.
 *
 * Model confidence is directional-neutral: it tells us how confident the
 * model is in its analysis, but not whether the claim is true or false.
 * High confidence amplifies other evidence; low confidence weakens it.
 *
 * @param {Object} input - { overallConfidence, modelVersion, processingTimeMs }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeModelConfidence(input, claim) {
  const {
    overallConfidence = 0.5,
    modelVersion = 'unknown',
    processingTimeMs = 0,
    sourceName = 'Model Confidence',
  } = input || {};

  // Model confidence is directional-neutral:
  // High confidence → the model's analysis is trustworthy (mixed = neutral amplifier)
  // Low confidence → insufficient data to trust the analysis
  let verdict = 'unknown';
  let confidence = overallConfidence;

  if (overallConfidence >= 0.3) {
    // Model is confident enough to contribute — but doesn't indicate direction
    verdict = 'mixed';
    confidence = overallConfidence * 0.6; // Slight penalty: confidence alone isn't evidence
  } else {
    // Low confidence → insufficient
    verdict = 'insufficient';
    confidence = overallConfidence * 0.3;
  }

  const category = classifyEvidenceCategory(verdict, confidence);

  return {
    source: sourceName,
    sourceType: 'model_confidence',
    claim,
    verdict,
    confidence: clamp(confidence),
    relevance: 0.5, // Model confidence is background context
    sourceReliability: SOURCE_RELIABILITY_DEFAULTS.model_confidence,
    timestamp: new Date(),
    url: null,
    evidenceCategory: category,
    rawData: {
      overallConfidence,
      modelVersion,
      processingTimeMs,
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * Normalize content metadata (type, media analysis).
 *
 * @param {Object} input - { contentType, hasMedia, mediaAnalysisResults? }
 * @param {string} claim - The claim text
 * @returns {Object} Normalized evidence item
 */
function normalizeContentMetadata(input, claim) {
  const {
    contentType = 'TEXT',
    hasMedia = false,
    mediaAnalysisResults = null,
    sourceName = 'Content Metadata',
  } = input || {};

  // Content metadata provides context but rarely direct evidence
  let verdict = 'unknown';
  let confidence = 0.4;

  if (mediaAnalysisResults) {
    // If media analysis detected manipulation
    if (mediaAnalysisResults.deepfakeProbability > 0.7) {
      verdict = 'refutes';
      confidence = mediaAnalysisResults.deepfakeProbability;
    } else if (mediaAnalysisResults.deepfakeProbability < 0.3) {
      verdict = 'supports';
      confidence = 1 - mediaAnalysisResults.deepfakeProbability;
    }
  }

  const category = classifyEvidenceCategory(verdict, confidence);

  return {
    source: sourceName,
    sourceType: 'content_metadata',
    claim,
    verdict,
    confidence: clamp(confidence),
    relevance: 0.4, // Content metadata is contextually relevant
    sourceReliability: SOURCE_RELIABILITY_DEFAULTS.content_metadata,
    timestamp: new Date(),
    url: null,
    evidenceCategory: category,
    rawData: {
      contentType,
      hasMedia,
      mediaAnalysisResults,
    },
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

// Register built-in normalizers
registerNormalizer('ai_detector', (input, claim) => [normalizeAIDetectorResults(input, claim)]);
registerNormalizer('fact_check_api', (input, claim) => [normalizeFactCheckResults(input, claim)]);
registerNormalizer('source_analysis', (input, claim) => [normalizeSourceAnalysis(input, claim)]);
registerNormalizer('claim_extraction', (input, claim) => [normalizeClaimResults(input, claim)]);
registerNormalizer('model_confidence', (input, claim) => [normalizeModelConfidence(input, claim)]);
registerNormalizer('content_metadata', (input, claim) => [normalizeContentMetadata(input, claim)]);

// ─── Evidence Aggregation ──────────────────────────────────────────────

/**
 * Aggregate multiple evidence items into a single verdict.
 *
 * @param {Array} evidenceItems - Array of normalized evidence items
 * @returns {Object} { aggregateVerdict, evidenceSummary, weightedConfidence, evidenceQuality }
 */
function aggregateEvidence(evidenceItems) {
  if (!evidenceItems || evidenceItems.length === 0) {
    return {
      aggregateVerdict: 'insufficient',
      evidenceSummary: { positive: 0, negative: 0, conflicting: 0, insufficient: 0 },
      weightedConfidence: 0,
      sourceCount: 0,
      evidenceQuality: 0,
    };
  }

  const summary = { positive: 0, negative: 0, conflicting: 0, insufficient: 0 };

  for (const item of evidenceItems) {
    summary[item.evidenceCategory] = (summary[item.evidenceCategory] || 0) + 1;
  }

  const total = evidenceItems.length;
  const meaningfulEvidence = summary.positive + summary.negative + summary.conflicting;

  // Determine aggregate verdict
  let aggregateVerdict = 'insufficient';

  if (meaningfulEvidence === 0) {
    // Only insufficient evidence → result is insufficient
    aggregateVerdict = 'insufficient';
  } else if (summary.positive > 0 && summary.negative > 0) {
    // Conflicting signals
    aggregateVerdict = 'mixed';
  } else if (summary.conflicting > 0 && summary.positive === 0 && summary.negative === 0) {
    // Only conflicting signals
    aggregateVerdict = 'mixed';
  } else if (summary.positive > 0 && summary.negative === 0 && summary.conflicting === 0) {
    // All meaningful evidence is positive
    aggregateVerdict = 'supports';
  } else if (summary.negative > 0 && summary.positive === 0 && summary.conflicting === 0) {
    // All meaningful evidence is negative
    aggregateVerdict = 'refutes';
  } else {
    // Mixed signals with some conflicting
    aggregateVerdict = 'mixed';
  }

  // Compute weighted confidence (scaled by source reliability)
  // Source reliability directly scales the confidence contribution so that
  // unreliable sources genuinely reduce overall confidence, rather than
  // acting as mere weights that cancel out for single items.
  let reliabilityScaledSum = 0;
  let meaningfulCount = 0;

  for (const item of evidenceItems) {
    if (item.evidenceCategory !== 'insufficient') {
      // Each source's confidence contribution is scaled by its reliability
      reliabilityScaledSum += item.confidence * item.sourceReliability;
      meaningfulCount++;
    }
  }

  const weightedConfidence = meaningfulCount > 0 ? reliabilityScaledSum / meaningfulCount : 0;

  // Evidence quality = ratio of meaningful evidence to total
  const evidenceQuality = total > 0 ? meaningfulEvidence / total : 0;

  return {
    aggregateVerdict,
    evidenceSummary: summary,
    weightedConfidence: clamp(weightedConfidence),
    sourceCount: total,
    evidenceQuality: clamp(evidenceQuality),
  };
}

// ─── Main Normalization Pipeline ──────────────────────────────────────

/**
 * Normalize all evidence sources for a claim.
 *
 * @param {Object} evidenceInputs - {
 *   claim: string,
 *   postId: string,
 *   contentJobId?: string,
 *   aiDetectorResults?: Object,
 *   factCheckResults?: Object,
 *   sourceAnalysis?: Object,
 *   claimResults?: Object,
 *   modelConfidence?: Object,
 *   contentMetadata?: Object,
 * }
 * @returns {Object} Normalized evidence document
 */
async function normalizeEvidence(evidenceInputs) {
  const startTime = Date.now();

  const {
    claim,
    postId,
    contentJobId = null,
    aiDetectorResults = null,
    factCheckResults = null,
    sourceAnalysis = null,
    claimResults = null,
    modelConfidence = null,
    contentMetadata = null,
  } = evidenceInputs;

  if (!claim || typeof claim !== 'string' || !claim.trim()) {
    throw new Error('Claim text is required for evidence normalization');
  }

  if (!postId) {
    throw new Error('Post ID is required for evidence normalization');
  }

  const normalizedClaim = claim.trim();
  const evidenceItems = [];

  // Process each available evidence source through its normalizer
  const sources = [
    { type: 'ai_detector', input: aiDetectorResults },
    { type: 'fact_check_api', input: factCheckResults },
    { type: 'source_analysis', input: sourceAnalysis },
    { type: 'claim_extraction', input: claimResults },
    { type: 'model_confidence', input: modelConfidence },
    { type: 'content_metadata', input: contentMetadata },
  ];

  for (const { type, input } of sources) {
    if (input !== null && input !== undefined) {
      const normalizer = normalizers[type];
      if (normalizer) {
        try {
          const items = normalizer(input, normalizedClaim);
          if (Array.isArray(items)) {
            evidenceItems.push(...items);
          } else if (items) {
            evidenceItems.push(items);
          }
        } catch (err) {
          console.warn(`[EvidenceNormalization] Normalizer "${type}" failed:`, err.message);
        }
      }
    }
  }

  // Aggregate evidence
  const aggregation = aggregateEvidence(evidenceItems);

  const processingTimeMs = Date.now() - startTime;

  // Build the evidence document
  const evidenceDoc = {
    post: postId,
    contentJob: contentJobId,
    claim: normalizedClaim,
    evidenceItems,
    aggregateVerdict: aggregation.aggregateVerdict,
    evidenceSummary: aggregation.evidenceSummary,
    weightedConfidence: aggregation.weightedConfidence,
    sourceCount: aggregation.sourceCount,
    evidenceQuality: aggregation.evidenceQuality,
    processingTimeMs,
    normalizationVersion: NORMALIZATION_VERSION,
  };

  return evidenceDoc;
}

/**
 * Normalize and store evidence for a claim.
 *
 * @param {Object} evidenceInputs - See normalizeEvidence()
 * @returns {Object} Saved Evidence document
 */
async function normalizeAndStoreEvidence(evidenceInputs) {
  const evidenceDoc = await normalizeEvidence(evidenceInputs);

  const saved = await Evidence.create(evidenceDoc);
  return saved;
}

/**
 * Get stored evidence for a post.
 *
 * @param {string} postId
 * @returns {Array} Evidence documents sorted by most recent
 */
async function getEvidenceByPost(postId) {
  return Evidence.find({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored evidence for a specific claim on a post.
 *
 * @param {string} postId
 * @param {string} claim
 * @returns {Object|null} Evidence document or null
 */
async function getEvidenceByClaim(postId, claim) {
  return Evidence.findOne({ post: postId, claim: claim.trim() }).sort({ createdAt: -1 });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function clamp(value, min = 0, max = 1) {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  // Core pipeline
  normalizeEvidence,
  normalizeAndStoreEvidence,
  aggregateEvidence,

  // Individual normalizers (exposed for testing and extensibility)
  normalizeAIDetectorResults,
  normalizeFactCheckResults,
  normalizeSourceAnalysis,
  normalizeClaimResults,
  normalizeModelConfidence,
  normalizeContentMetadata,

  // Classification
  classifyEvidenceCategory,

  // Registry (for adding new providers)
  registerNormalizer,

  // Query helpers
  getEvidenceByPost,
  getEvidenceByClaim,

  // Constants (for testing)
  SOURCE_RELIABILITY_DEFAULTS,
  NORMALIZATION_VERSION,
};
