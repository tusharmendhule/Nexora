/**
 * Fact Verification Service (Module 13)
 * ======================================
 * Integrates Google Fact Check Tools API for claim verification.
 *
 * Pipeline per claim:
 *   1. Normalize the claim text
 *   2. Query the fact-check API
 *   3. Retrieve matching ClaimReview information
 *   4. Extract publisher, review title, textual rating, source URL, dates
 *   5. Normalize the result
 *   6. Cache to reduce repeated API calls (with expiration timestamps)
 *
 * Verification statuses:
 *   VERIFIED_TRUE  — strong consensus that claim is accurate
 *   VERIFIED_FALSE — strong consensus that claim is inaccurate
 *   MIXED          — conflicting or partially supported ratings
 *   NO_EVIDENCE    — no fact-check found (never interpreted as "true")
 *   UNKNOWN        — API unavailable, rate-limited, or ambiguous
 */

const axios = require('axios');
const crypto = require('crypto');
const FactCheckCache = require('../models/fact-check-cache.model');

// ─── Configuration ────────────────────────────────────────────────────

const GOOGLE_FACT_CHECK_API_KEY = process.env.GOOGLE_FACT_CHECK_API_KEY;
const API_BASE_URL = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const API_TIMEOUT_MS = 8000;
const CACHE_TTL_HOURS = 24;

// Maximum retries for rate-limited requests
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// ─── Verification Status Enum ─────────────────────────────────────────

const VerificationStatus = Object.freeze({
  VERIFIED_TRUE: 'VERIFIED_TRUE',
  VERIFIED_FALSE: 'VERIFIED_FALSE',
  MIXED: 'MIXED',
  NO_EVIDENCE: 'NO_EVIDENCE',
  UNKNOWN: 'UNKNOWN',
});

// ─── Rating Classification Patterns ───────────────────────────────────

const POSITIVE_RATING_PATTERNS = [
  /^true$/i,
  /^correct$/i,
  /^accurate$/i,
  /^supported$/i,
  /^verified$/i,
  /^factually correct$/i,
  /^mostly true$/i,
  /^no lies$/i,
  /^mostly accurate$/i,
];

const NEGATIVE_RATING_PATTERNS = [
  /^false$/i,
  /^incorrect$/i,
  /^inaccurate$/i,
  /^unsupported$/i,
  /^debunked$/i,
  /^misleading$/i,
  /^fake$/i,
  /^wrong$/i,
  /^mostly false$/i,
  /^pants on fire$/i,
  /^dubious$/i,
  /^not supported$/i,
  /^untrue$/i,
  /^scam$/i,
  /^distorts the facts$/i,
  /^cherry picks$/i,
  /^fabricated$/i,
  /^ manipulated$/i,
  /^ manipulated$/i,
];

const MIXED_RATING_PATTERNS = [
  /^mixed$/i,
  /^partly (true|false|accurate|supported|accurate)/i,
  /^half true$/i,
  /^outdated$/i,
  /^missing context$/i,
  /^needs context$/i,
  /^unverified$/i,
  /^has some truth$/i,
  /^exaggerated$/i,
];

// ─── Claim Normalization ──────────────────────────────────────────────

/**
 * Normalize claim text for API querying and cache keying.
 * Strips extra whitespace, lowercases, and removes trailing punctuation.
 */
function normalizeClaim(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '') // strip trailing sentence punctuation
    .replace(/[""]/g, '"')  // normalize smart quotes
    .replace(/['']/g, "'");
}

/**
 * Generate a cache key hash from normalized claim text.
 */
function cacheKey(normalizedText) {
  return crypto
    .createHash('sha256')
    .update(normalizedText)
    .digest('hex')
    .slice(0, 32);
}

// ─── Rating Classification ────────────────────────────────────────────

/**
 * Classify a textual rating string into a normalized category.
 * Returns: 'positive' | 'negative' | 'mixed' | 'unknown'
 */
function classifyRating(rating) {
  if (!rating || typeof rating !== 'string') return 'unknown';
  const trimmed = rating.trim();

  for (const pattern of POSITIVE_RATING_PATTERNS) {
    if (pattern.test(trimmed)) return 'positive';
  }
  for (const pattern of NEGATIVE_RATING_PATTERNS) {
    if (pattern.test(trimmed)) return 'negative';
  }
  for (const pattern of MIXED_RATING_PATTERNS) {
    if (pattern.test(trimmed)) return 'mixed';
  }

  // Fuzzy fallback: check substrings
  const lower = trimmed.toLowerCase();
  if (/true|correct|accurate|supported|verified/.test(lower)) return 'positive';
  if (/false|incorrect|inaccurate|debunked|misleading|fake/.test(lower)) return 'negative';
  if (/mixed|context|partly|partially|outdated/.test(lower)) return 'mixed';

  return 'unknown';
}

/**
 * Determine the aggregate verification status from a list of classified ratings.
 * Never interprets "no results" as "true".
 */
function determineVerificationStatus(classifiedRatings) {
  if (!classifiedRatings || classifiedRatings.length === 0) {
    return VerificationStatus.NO_EVIDENCE;
  }

  const counts = { positive: 0, negative: 0, mixed: 0, unknown: 0 };

  for (const cr of classifiedRatings) {
    counts[cr.category] = (counts[cr.category] || 0) + 1;
  }

  const total = counts.positive + counts.negative + counts.mixed + counts.unknown;
  if (total === 0) return VerificationStatus.NO_EVIDENCE;

  const positiveRatio = counts.positive / total;
  const negativeRatio = counts.negative / total;

  // Strong consensus
  if (positiveRatio >= 0.75 && counts.negative === 0) {
    return VerificationStatus.VERIFIED_TRUE;
  }
  if (negativeRatio >= 0.75 && counts.positive === 0) {
    return VerificationStatus.VERIFIED_FALSE;
  }

  // Mixed signals
  if (counts.positive > 0 && counts.negative > 0) {
    return VerificationStatus.MIXED;
  }
  if (counts.mixed > 0 && counts.positive === 0 && counts.negative === 0) {
    return VerificationStatus.MIXED;
  }

  // Only unknowns or ambiguous
  return VerificationStatus.UNKNOWN;
}

// ─── ClaimReview Data Extraction ──────────────────────────────────────

/**
 * Extract structured data from a Google ClaimReview object.
 */
function extractClaimReviewData(review) {
  if (!review || typeof review !== 'object') return null;

  return {
    publisher: {
      name: review.publisher?.name || null,
      site: review.publisher?.site || null,
    },
    title: review.title || null,
    textualRating: review.textualRating || null,
    url: review.url || null,
    reviewDate: review.reviewDate || null,
    languageCode: review.languageCode || null,
  };
}

// ─── Cache Operations ─────────────────────────────────────────────────

/**
 * Check the cache for an existing result.
 * Returns null if not found or expired.
 */
async function getCachedResult(normalizedText) {
  try {
    const key = cacheKey(normalizedText);
    const cached = await FactCheckCache.findOne({ queryText: key });
    if (cached && cached.expiresAt > new Date()) {
      return cached.claimResults;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Store a result in the cache with TTL.
 */
async function setCachedResult(normalizedText, claimResults) {
  try {
    const key = cacheKey(normalizedText);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    await FactCheckCache.findOneAndUpdate(
      { queryText: key },
      { queryText: key, claimResults, expiresAt },
      { upsert: true, new: true }
    );
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Google Fact Check API Query ──────────────────────────────────────

/**
 * Query the Google Fact Check Tools API with retry logic for rate limits.
 *
 * @param {string} query - Normalized claim text
 * @returns {Object} { success, claims, error?, errorCode? }
 *   - success: boolean
 *   - claims: array of raw API claim objects
 *   - error: error message if failed
 *   - errorCode: 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'MALFORMED' | 'API_ERROR'
 */
async function queryFactCheckAPI(query) {
  if (!GOOGLE_FACT_CHECK_API_KEY) {
    return {
      success: false,
      claims: [],
      error: 'Google Fact Check API key not configured',
      errorCode: 'UNAVAILABLE',
    };
  }

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      success: false,
      claims: [],
      error: 'Malformed or empty query',
      errorCode: 'MALFORMED',
    };
  }

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(API_BASE_URL, {
        params: { query: query.trim(), key: GOOGLE_FACT_CHECK_API_KEY },
        timeout: API_TIMEOUT_MS,
      });

      return {
        success: true,
        claims: response.data?.claims || [],
      };
    } catch (err) {
      lastError = err;

      // Rate limited — retry after delay
      if (err.response?.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * (attempt + 1);
          await sleep(delay);
          continue;
        }
        return {
          success: false,
          claims: [],
          error: 'Rate limit exceeded. Please try again later.',
          errorCode: 'RATE_LIMITED',
        };
      }

      // Timeout
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return {
          success: false,
          claims: [],
          error: 'Fact Check API request timed out',
          errorCode: 'TIMEOUT',
        };
      }

      // Network unavailable
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return {
          success: false,
          claims: [],
          error: 'Fact Check API is currently unavailable',
          errorCode: 'UNAVAILABLE',
        };
      }

      // HTTP errors (4xx/5xx other than 429)
      if (err.response?.status) {
        return {
          success: false,
          claims: [],
          error: `Fact Check API returned status ${err.response.status}`,
          errorCode: 'API_ERROR',
        };
      }

      // Unknown error — retry if attempts remain
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }
  }

  return {
    success: false,
    claims: [],
    error: lastError?.message || 'Unknown error querying Fact Check API',
    errorCode: 'API_ERROR',
  };
}

// ─── Main Fact-Check Pipeline ─────────────────────────────────────────

/**
 * Verify a single claim against the Google Fact Check Tools API.
 *
 * Pipeline:
 *   1. Normalize claim
 *   2. Check cache
 *   3. Query API (with retries)
 *   4. Extract ClaimReview data
 *   5. Classify ratings → verification status
 *   6. Cache result
 *
 * @param {string} claimText - Raw claim text
 * @param {Object} [options] - { claimId, postId }
 * @returns {Object} Normalized fact-check result
 */
async function factCheckClaim(claimText, options = {}) {
  const startTime = Date.now();
  const { claimId = null, postId = null } = options;

  // 1. Normalize
  const normalized = normalizeClaim(claimText);
  if (!normalized) {
    return buildResult(claimText, claimId, postId, {
      status: VerificationStatus.UNKNOWN,
      reviews: [],
      apiError: 'Malformed or empty claim text',
      errorCode: 'MALFORMED',
      processingTimeMs: Date.now() - startTime,
    });
  }

  // 2. Check cache
  const cached = await getCachedResult(normalized);
  if (cached) {
    const reviews = (cached.factCheckRatings || []).map(extractClaimReviewData).filter(Boolean);
    const classifiedRatings = reviews.map((r) => ({
      rating: r.textualRating,
      category: classifyRating(r.textualRating),
    }));
    const status = determineVerificationStatus(classifiedRatings);

    return buildResult(claimText, claimId, postId, {
      status,
      reviews,
      classifiedRatings,
      source: 'cache',
      processingTimeMs: Date.now() - startTime,
    });
  }

  // 3. Query API
  const apiResult = await queryFactCheckAPI(normalized);

  if (!apiResult.success) {
    return buildResult(claimText, claimId, postId, {
      status: VerificationStatus.UNKNOWN,
      reviews: [],
      apiError: apiResult.error,
      errorCode: apiResult.errorCode,
      processingTimeMs: Date.now() - startTime,
    });
  }

  // 4. No results from API
  if (!apiResult.claims || apiResult.claims.length === 0) {
    // Cache "no results" to avoid repeat API calls
    await setCachedResult(normalized, { factCheckRatings: [] });

    return buildResult(claimText, claimId, postId, {
      status: VerificationStatus.NO_EVIDENCE,
      reviews: [],
      source: 'api',
      processingTimeMs: Date.now() - startTime,
    });
  }

  // 5. Extract review data from all matching claims
  const allReviews = [];
  for (const apiClaim of apiResult.claims) {
    if (apiClaim.claimReview && Array.isArray(apiClaim.claimReview)) {
      for (const review of apiClaim.claimReview) {
        const extracted = extractClaimReviewData(review);
        if (extracted) allReviews.push(extracted);
      }
    }
  }

  // 6. Classify ratings
  const classifiedRatings = allReviews.map((r) => ({
    rating: r.textualRating,
    category: classifyRating(r.textualRating),
  }));

  // 7. Determine status
  const status = determineVerificationStatus(classifiedRatings);

  // 8. Cache the raw API results
  const claimResults = apiResult.claims.map((item) => ({
    text: item.text,
    claimant: item.claimant,
    claimDate: item.claimDate,
    factCheckRatings: (item.claimReview || []).map((rev) => ({
      publisherName: rev.publisher?.name,
      publisherSite: rev.publisher?.site,
      url: rev.url,
      title: rev.title,
      rating: rev.textualRating,
    })),
  }));

  await setCachedResult(normalized, { factCheckRatings: claimResults.length > 0 ? claimResults[0].factCheckRatings : [] });

  return buildResult(claimText, claimId, postId, {
    status,
    reviews: allReviews,
    classifiedRatings,
    source: 'api',
    matchCount: apiResult.claims.length,
    processingTimeMs: Date.now() - startTime,
  });
}

/**
 * Verify multiple claims in batch.
 *
 * @param {Array} claims - Array of { text, id? } or plain strings
 * @param {Object} [options] - { postId }
 * @returns {Object} { results, aggregateStatus, summary }
 */
async function factCheckClaims(claims, options = {}) {
  const { postId = null } = options;
  const startTime = Date.now();

  if (!claims || !Array.isArray(claims) || claims.length === 0) {
    return {
      results: [],
      aggregateStatus: VerificationStatus.NO_EVIDENCE,
      summary: { total: 0, verified: 0, false: 0, mixed: 0, noEvidence: 0, unknown: 0 },
      processingTimeMs: 0,
    };
  }

  const results = [];
  const statusCounts = {
    [VerificationStatus.VERIFIED_TRUE]: 0,
    [VerificationStatus.VERIFIED_FALSE]: 0,
    [VerificationStatus.MIXED]: 0,
    [VerificationStatus.NO_EVIDENCE]: 0,
    [VerificationStatus.UNKNOWN]: 0,
  };

  for (const claim of claims) {
    const claimText = typeof claim === 'string' ? claim : claim.text || '';
    const claimId = typeof claim === 'object' ? claim.id || null : null;

    const result = await factCheckClaim(claimText, { claimId, postId });
    results.push(result);
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }

  // Determine aggregate status
  const totalClaims = results.length;
  const aggregateStatus = determineAggregateStatus(statusCounts, totalClaims);

  return {
    results,
    aggregateStatus,
    summary: {
      total: totalClaims,
      verified: statusCounts[VerificationStatus.VERIFIED_TRUE],
      false: statusCounts[VerificationStatus.VERIFIED_FALSE],
      mixed: statusCounts[VerificationStatus.MIXED],
      noEvidence: statusCounts[VerificationStatus.NO_EVIDENCE],
      unknown: statusCounts[VerificationStatus.UNKNOWN],
    },
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Determine aggregate verification status from status counts.
 */
function determineAggregateStatus(statusCounts, total) {
  if (total === 0) return VerificationStatus.NO_EVIDENCE;

  const trueRatio = (statusCounts[VerificationStatus.VERIFIED_TRUE] || 0) / total;
  const falseRatio = (statusCounts[VerificationStatus.VERIFIED_FALSE] || 0) / total;
  const mixedCount = (statusCounts[VerificationStatus.MIXED] || 0);

  // If any claims are confirmed false, the aggregate is mixed or false
  if (falseRatio >= 0.5) return VerificationStatus.VERIFIED_FALSE;
  if (trueRatio >= 0.75 && falseRatio === 0) return VerificationStatus.VERIFIED_TRUE;
  if ((statusCounts[VerificationStatus.VERIFIED_TRUE] || 0) > 0 && (statusCounts[VerificationStatus.VERIFIED_FALSE] || 0) > 0) {
    return VerificationStatus.MIXED;
  }
  if (mixedCount > 0) return VerificationStatus.MIXED;

  return VerificationStatus.UNKNOWN;
}

// ─── Trust Score Integration ──────────────────────────────────────────

/**
 * Map a verification status to a factualVerificationScore (0.0 - 1.0)
 * for use in the Trust Score formula.
 *
 * VERIFIED_TRUE  → 1.0
 * VERIFIED_FALSE → 0.0
 * MIXED          → 0.5
 * NO_EVIDENCE    → 0.5 (neutral — no evidence ≠ false)
 * UNKNOWN        → 0.5 (neutral default)
 */
function verificationStatusToScore(status) {
  switch (status) {
    case VerificationStatus.VERIFIED_TRUE:
      return 1.0;
    case VerificationStatus.VERIFIED_FALSE:
      return 0.0;
    case VerificationStatus.MIXED:
      return 0.5;
    case VerificationStatus.NO_EVIDENCE:
      return 0.5;
    case VerificationStatus.UNKNOWN:
      return 0.5;
    default:
      return 0.5;
  }
}

/**
 * Compute a factual verification score from a batch of claim results.
 * Returns a score between 0.0 and 1.0.
 */
function computeFactualVerificationScore(claimResults) {
  if (!claimResults || claimResults.length === 0) return 0.5; // neutral default

  let totalScore = 0;
  let count = 0;

  for (const result of claimResults) {
    if (result.status && result.status !== VerificationStatus.NO_EVIDENCE) {
      totalScore += verificationStatusToScore(result.status);
      count++;
    }
  }

  return count > 0 ? Math.round((totalScore / count) * 100) / 100 : 0.5;
}

/**
 * Determine if fact-check evidence supports a "confirmed false" override
 * for the Trust Score label calculation.
 */
function isConfirmedFalse(claimResults) {
  if (!claimResults || claimResults.length === 0) return false;
  return claimResults.some((r) => r.status === VerificationStatus.VERIFIED_FALSE);
}

// ─── Result Builder ───────────────────────────────────────────────────

function buildResult(claimText, claimId, postId, data) {
  return {
    claimText,
    claimId,
    postId,
    status: data.status,
    reviews: data.reviews || [],
    classifiedRatings: data.classifiedRatings || [],
    apiError: data.apiError || null,
    errorCode: data.errorCode || null,
    source: data.source || 'api',
    matchCount: data.matchCount || 0,
    processingTimeMs: data.processingTimeMs || 0,
  };
}

// ─── Post-Level Retrieval ─────────────────────────────────────────────

/**
 * Retrieve all fact-check results stored for a given post.
 */
async function getFactCheckResultsByPost(postId) {
  // Look up from ClaimEntity model which stores fact-check results per post
  const ClaimEntity = require('../models/claim-entity.model');
  const claimEntity = await ClaimEntity.findOne({ post: postId })
    .sort({ createdAt: -1 });

  if (!claimEntity || !claimEntity.claims || claimEntity.claims.length === 0) {
    return null;
  }

  const claimResults = [];
  for (const claim of claimEntity.claims) {
    if (claim.factCheckResults && claim.factCheckResults.length > 0) {
      // Classify ratings from stored results
      const reviews = claim.factCheckResults.map((r) => ({
        publisher: { name: r.publisherName, site: r.publisherSite },
        title: r.title,
        textualRating: r.rating,
        url: r.url,
      }));

      const classifiedRatings = reviews.map((r) => ({
        rating: r.textualRating,
        category: classifyRating(r.textualRating),
      }));

      const status = determineVerificationStatus(classifiedRatings);

      claimResults.push({
        claimText: claim.text,
        claimId: claim.textHash,
        postId,
        status,
        reviews,
        classifiedRatings,
        source: 'stored',
        matchCount: reviews.length,
      });
    }
  }

  if (claimResults.length === 0) return null;

  const aggregateStatus = determineAggregateStatus(
    claimResults.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      {}
    ),
    claimResults.length
  );

  return {
    postId,
    claimResults,
    aggregateStatus,
    summary: {
      total: claimResults.length,
      verified: claimResults.filter((r) => r.status === VerificationStatus.VERIFIED_TRUE).length,
      false: claimResults.filter((r) => r.status === VerificationStatus.VERIFIED_FALSE).length,
      mixed: claimResults.filter((r) => r.status === VerificationStatus.MIXED).length,
      noEvidence: claimResults.filter((r) => r.status === VerificationStatus.NO_EVIDENCE).length,
      unknown: claimResults.filter((r) => r.status === VerificationStatus.UNKNOWN).length,
    },
    factualVerificationScore: computeFactualVerificationScore(claimResults),
    confirmedFalse: isConfirmedFalse(claimResults),
    verificationScore: claimEntity.verificationScore,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  // Enums
  VerificationStatus,

  // Core pipeline
  normalizeClaim,
  classifyRating,
  determineVerificationStatus,
  extractClaimReviewData,
  queryFactCheckAPI,
  factCheckClaim,
  factCheckClaims,

  // Trust score integration
  verificationStatusToScore,
  computeFactualVerificationScore,
  isConfirmedFalse,

  // Post-level retrieval
  getFactCheckResultsByPost,

  // Cache helpers (exposed for testing)
  getCachedResult,
  setCachedResult,
  cacheKey,
};
