/**
 * Fact Verification Controller (Module 13)
 * =========================================
 * POST /api/v1/verification/fact-check   — submit claims for fact-checking
 * GET  /api/v1/verification/:postId      — get fact-check results for a post
 *
 * Handles:
 *   - No results → NO_EVIDENCE (never interpreted as "true")
 *   - API errors → graceful degradation with UNKNOWN status
 *   - Rate limits → retry logic in service layer
 *   - Timeout → timeout error response
 *   - Malformed claim → validation error
 *   - Unavailable API → UNKNOWN status with error info
 */

const {
  factCheckClaim,
  factCheckClaims,
  getFactCheckResultsByPost,
  computeFactualVerificationScore,
  isConfirmedFalse,
  VerificationStatus,
} = require('../../services/fact-check.service');
const { ApiError } = require('../../middleware/error.middleware');
const Post = require('../../models/post.model');

// ─── Validation ───────────────────────────────────────────────────────

function validateFactCheckRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  // Accept either "claims" (array) or "claim" (single string)
  if (body.claims) {
    if (!Array.isArray(body.claims) || body.claims.length === 0) {
      errors.push('claims must be a non-empty array');
    }
    if (body.claims.length > 50) {
      errors.push('Maximum 50 claims per request');
    }
    for (let i = 0; i < (body.claims || []).length; i++) {
      const c = body.claims[i];
      if (typeof c === 'string') {
        if (!c.trim()) errors.push(`claims[${i}] must not be empty`);
      } else if (typeof c === 'object' && c !== null) {
        if (!c.text || typeof c.text !== 'string' || !c.text.trim()) {
          errors.push(`claims[${i}].text must be a non-empty string`);
        }
      } else {
        errors.push(`claims[${i}] must be a string or object with "text"`);
      }
    }
  } else if (body.claim) {
    if (typeof body.claim !== 'string' || !body.claim.trim()) {
      errors.push('claim must be a non-empty string');
    }
  } else {
    errors.push('Either "claims" (array) or "claim" (string) is required');
  }

  if (body.postId !== undefined && body.postId !== null) {
    if (typeof body.postId !== 'string' || body.postId.trim().length === 0) {
      errors.push('postId must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  // Normalize output
  const claims = body.claims
    ? body.claims.map((c) => (typeof c === 'string' ? { text: c } : c))
    : [{ text: body.claim }];

  return {
    claims,
    postId: body.postId ? body.postId.trim() : null,
  };
}

// ─── Controllers ──────────────────────────────────────────────────────

/**
 * POST /api/v1/verification/fact-check
 *
 * Submit one or more claims for fact-checking against the Google Fact Check Tools API.
 *
 * Body:
 *   { claims: [{ text: "..." }], postId?: "..." }
 *   — or —
 *   { claim: "...", postId?: "..." }
 *
 * Response:
 *   {
 *     success: true,
 *     results: [...],
 *     aggregateStatus: "VERIFIED_TRUE|...",
 *     summary: { total, verified, false, mixed, noEvidence, unknown },
 *     factualVerificationScore: 0.0-1.0,
 *     confirmedFalse: boolean,
 *     processingTimeMs: number
 *   }
 */
exports.factCheck = async (req, res, next) => {
  try {
    const { claims, postId } = validateFactCheckRequest(req.body);

    // Validate postId refers to an existing post if provided
    if (postId) {
      const postExists = await Post.exists({ _id: postId });
      if (!postExists) {
        throw new ApiError(404, `Post not found: ${postId}`);
      }
    }

    // Run fact-check pipeline
    const batchResult = await factCheckClaims(claims, { postId });

    // Compute trust score integration metrics
    const factualVerificationScore = computeFactualVerificationScore(batchResult.results);
    const confirmedFalse = isConfirmedFalse(batchResult.results);

    res.status(200).json({
      success: true,
      results: batchResult.results,
      aggregateStatus: batchResult.aggregateStatus,
      summary: batchResult.summary,
      factualVerificationScore,
      confirmedFalse,
      processingTimeMs: batchResult.processingTimeMs,
    });
  } catch (error) {
    if (error instanceof ApiError) return next(error);

    // Graceful degradation for unexpected errors
    console.error('[FactCheck] Unexpected error:', error.message);
    next(new ApiError(500, 'Fact verification failed due to an internal error'));
  }
};

/**
 * GET /api/v1/verification/:postId
 *
 * Retrieve stored fact-check results for a post.
 *
 * Response:
 *   {
 *     success: true,
 *     postId: "...",
 *     claimResults: [...],
 *     aggregateStatus: "...",
 *     summary: {...},
 *     factualVerificationScore: number,
 *     confirmedFalse: boolean,
 *     verificationScore: number|null
 *   }
 *
 * If no results exist:
 *   404 with message — never interpreting "no results" as "true"
 */
exports.getFactCheckByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    // Verify post exists
    const postExists = await Post.exists({ _id: postId });
    if (!postExists) {
      throw new ApiError(404, `Post not found: ${postId}`);
    }

    const result = await getFactCheckResultsByPost(postId);

    if (!result) {
      return res.status(200).json({
        success: true,
        postId,
        claimResults: [],
        aggregateStatus: VerificationStatus.NO_EVIDENCE,
        summary: { total: 0, verified: 0, false: 0, mixed: 0, noEvidence: 0, unknown: 0 },
        factualVerificationScore: 0.5,
        confirmedFalse: false,
        verificationScore: null,
        message: 'No fact-check data available for this post. This does not mean the content is true.',
      });
    }

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(error);
  }
};
