/**
 * Claim & Entity Extraction Service (Module 12)
 * ==============================================
 * Calls the Python AI service's /analyze/claims-entities endpoint
 * and persists results to MongoDB via the ClaimEntity model.
 *
 * Provides:
 *   - NLP-based claim extraction (spaCy SVO + zero-shot classification)
 *   - Named entity recognition (BERT NER)
 *   - Deduplication via claim text hashing
 *   - Integration with fact verification pipeline
 *   - MongoDB storage with efficient queries
 */

const axios = require('axios');
const crypto = require('crypto');
const ClaimEntity = require('../models/claim-entity.model');

// ─── Configuration ────────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 120000; // 120s for model cold-start

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Normalize and hash claim text for deduplication.
 */
function hashClaimText(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Deduplicate claims by text hash, keeping the one with highest confidence.
 */
function deduplicateClaims(claims) {
  const seen = new Map();

  for (const claim of claims) {
    const textHash = hashClaimText(claim.text);
    const existing = seen.get(textHash);

    if (!existing || (claim.confidence || 0) > (existing.confidence || 0)) {
      seen.set(textHash, { ...claim, textHash });
    }
  }

  return Array.from(seen.values());
}

// ─── Fact Verification Integration ────────────────────────────────────

/**
 * Verify extracted claims against the Google Fact Check Tools API.
 * Delegates to the dedicated fact-check.service.js which handles:
 *   - Cache lookup and storage
 *   - API calls with retry logic for rate limits
 *   - Proper error codes and timeout handling
 *   - No fabricated data on failure
 *
 * @param {Array} claims - Extracted claims to verify
 * @returns {Array} Array of fact-check results linked to claims
 */
async function verifyClaimsFactCheck(claims) {
  if (!claims || claims.length === 0) return [];

  const factCheckService = require('./fact-check.service');
  const allResults = [];

  for (const claim of claims) {
    try {
      const result = await factCheckService.factCheckClaim(claim.text);

      // Map service result to the flat format expected by the caller
      for (const review of result.reviews || []) {
        allResults.push({
          claimText: claim.text,
          textHash: claim.textHash,
          publisherName: review.publisher?.name || null,
          publisherSite: review.publisher?.site || null,
          url: review.url || null,
          title: review.title || null,
          rating: review.textualRating || null,
        });
      }
    } catch (err) {
      console.warn(
        `[ClaimEntity] Fact Check failed for "${claim.text.substring(0, 50)}...":`,
        err.message
      );
    }
  }

  return allResults;
}

/**
 * Compute a verification score (0-100) based on fact-check results.
 */
function computeVerificationScore(factCheckResults) {
  if (!factCheckResults || factCheckResults.length === 0) return null;

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  const positivePatterns = [/true|correct|accurate|supported|verified|fact/i];
  const negativePatterns = [
    /false|incorrect|inaccurate|unsupported|debunked|misleading|fake|wrong/i,
  ];

  for (const result of factCheckResults) {
    const rating = (result.rating || '').toLowerCase();
    let matched = false;

    for (const pattern of positivePatterns) {
      if (pattern.test(rating)) {
        positiveCount++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const pattern of negativePatterns) {
      if (pattern.test(rating)) {
        negativeCount++;
        matched = true;
        break;
      }
    }
    if (!matched) neutralCount++;
  }

  const total = positiveCount + negativeCount + neutralCount;
  if (total === 0) return null;

  const score =
    (positiveCount * 0.8 + neutralCount * 0.5 + negativeCount * 0.2) / total;
  return Math.round(Math.max(0, Math.min(100, score * 100)));
}

// ─── Main Extraction Pipeline ─────────────────────────────────────────

/**
 * Extract claims and entities from text using the Python AI service.
 *
 * @param {string} text - Input text
 * @param {string|null} postId - Optional post ID
 * @param {string|null} contentJobId - Optional content job ID
 * @returns {Object} { status, results, modelVersion, savedAnalysis }
 */
async function extractClaimsAndEntities(text, postId, contentJobId) {
  const startTime = Date.now();
  const errors = [];

  // Preprocessing (simple Node.js version for immediate storage)
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const preprocessing = {
    characterCount: text.length,
    wordCount: words.length,
    sentenceCount: sentences.length,
    language: 'unknown',
    languageConfidence: 0,
  };

  // Call the Python AI service
  let aiResponse;
  try {
    aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/claims-entities`,
      { text, postId },
      { timeout: AI_SERVICE_TIMEOUT }
    );
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return {
        status: 'FAILED',
        results: {
          success: false,
          error: `AI service not available at ${AI_SERVICE_URL}`,
        },
        modelVersion: null,
      };
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return {
        status: 'FAILED',
        results: {
          success: false,
          error: 'AI service request timed out',
        },
        modelVersion: null,
      };
    }
    return {
      status: 'FAILED',
      results: {
        success: false,
        error: `AI service error: ${err.message}`,
      },
      modelVersion: null,
    };
  }

  const ai = aiResponse.data;

  // Deduplicate claims
  const rawClaims = (ai.claims || []).map((c) => ({
    text: c.text,
    claimType: c.claimType || null,
    subject: c.subject || null,
    predicate: c.predicate || null,
    object: c.object || null,
    misinformationProbability: c.misinformationProbability || 0,
    confidence: c.confidence || 0,
    entities: c.entities || [],
  }));

  const claims = deduplicateClaims(rawClaims);

  // Normalize entities
  const entities = (ai.entities || []).map((e) => ({
    text: e.text,
    type: e.type || e.label || 'ENTITY',
    confidence: e.confidence || 1.0,
    start: e.start || 0,
    end: e.end || 0,
  }));

  // Verify claims against fact-check API
  let factCheckResults = [];
  if (claims.length > 0) {
    try {
      factCheckResults = await verifyClaimsFactCheck(claims);
    } catch (err) {
      errors.push({ stage: 'fact_verification', message: err.message });
    }
  }

  // Attach fact-check results to claims
  const claimsWithFactCheck = claims.map((claim) => {
    const matchingResults = factCheckResults.filter(
      (r) => r.textHash === claim.textHash
    );
    return {
      ...claim,
      factCheckStatus: matchingResults.length > 0 ? 'verified' : 'unverified',
      factCheckResults: matchingResults.map((r) => ({
        publisherName: r.publisherName,
        publisherSite: r.publisherSite,
        url: r.url,
        title: r.title,
        rating: r.rating,
      })),
    };
  });

  // Compute verification score
  const verificationScore = computeVerificationScore(factCheckResults);

  const processingTimeMs = Date.now() - startTime;

  // Store in MongoDB
  const savedAnalysis = await ClaimEntity.create({
    contentJob: contentJobId || null,
    post: postId || null,
    inputText: text,
    claims: claimsWithFactCheck,
    entities,
    preprocessing: ai.preprocessing || preprocessing,
    confidence: ai.confidence || 0,
    modelVersion: ai.modelVersion || 'nexora-claims-v1.0.0',
    processingTimeMs,
    verificationScore,
    errors: (ai.errors || []).concat(errors).map((e) => ({
      stage: e.stage,
      message: e.message,
    })),
    status: 'completed',
  });

  return {
    status: 'COMPLETED',
    results: {
      success: true,
      claimCount: claimsWithFactCheck.length,
      entityCount: entities.length,
      factCheckResultCount: factCheckResults.length,
      verificationScore,
      confidence: ai.confidence || 0,
    },
    modelVersion: ai.modelVersion || 'nexora-claims-v1.0.0',
    savedAnalysis,
  };
}

/**
 * Extract claims and entities for a content job (pipeline integration).
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function extractForJob(job) {
  const Post = require('../models/post.model');
  const post = await Post.findById(job.post);
  if (!post || !post.text) {
    return {
      status: 'COMPLETED',
      results: { message: 'No text content for claim extraction' },
      modelVersion: null,
    };
  }

  const text = post.text.trim();
  if (text.length < 5) {
    return {
      status: 'COMPLETED',
      results: { message: 'Text too short for claim extraction' },
      modelVersion: null,
    };
  }

  return extractClaimsAndEntities(text, job.post.toString(), job._id);
}

/**
 * Extract claims and entities directly (not tied to a job).
 *
 * @param {string} text - Input text
 * @param {string|null} postId - Optional post ID
 * @returns {Object} { status, results, modelVersion, savedAnalysis }
 */
async function extractDirect(text, postId) {
  return extractClaimsAndEntities(text, postId, null);
}

// ─── Query Helpers ────────────────────────────────────────────────────

/**
 * Get stored claim/entity extraction results for a post.
 */
async function getExtractionForPost(postId) {
  return ClaimEntity.findOne({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored claim/entity extraction results for a content job.
 */
async function getExtractionForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return ClaimEntity.findOne({ contentJob: job._id }).sort({ createdAt: -1 });
}

/**
 * Get all claim/entity extractions for a post.
 */
async function getAllExtractionsForPost(postId) {
  return ClaimEntity.find({ post: postId }).sort({ createdAt: -1 });
}

module.exports = {
  extractForJob,
  extractDirect,
  extractClaimsAndEntities,
  getExtractionForPost,
  getExtractionForJob,
  getAllExtractionsForPost,
  deduplicateClaims,
  hashClaimText,
  verifyClaimsFactCheck,
  computeVerificationScore,
};
