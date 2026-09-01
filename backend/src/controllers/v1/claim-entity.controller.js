/**
 * Claim & Entity Extraction Controller (Module 12)
 * ================================================
 * POST /api/v1/content/extract-claims      - direct extraction
 * POST /api/v1/analyze/claims-entities     - async extraction with job polling
 * GET  /api/v1/analyze/claims-entities/:jobId - poll extraction status
 * GET  /api/v1/content/extract-claims/:postId - get results by postId
 */

const { v4: uuidv4 } = require('uuid');
const ClaimEntity = require('../../models/claim-entity.model');
const claimEntityService = require('../../services/claim-entity-extraction.service');
const { ApiError } = require('../../middleware/error.middleware');

// ─── Configuration ────────────────────────────────────────────────────

const BACKGROUND_TIMEOUT_MS = 120000; // 2 minutes for claim extraction
const _inflight = new Map();

// ─── Validation ───────────────────────────────────────────────────────

function validateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
    errors.push('text is required and must be a non-empty string');
  }

  if (body.text && body.text.length > 100000) {
    errors.push('text must not exceed 100,000 characters');
  }

  if (body.postId !== undefined && body.postId !== null) {
    if (typeof body.postId !== 'string' || body.postId.trim().length === 0) {
      errors.push('postId must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  return {
    text: body.text.trim(),
    postId: body.postId ? body.postId.trim() : null,
  };
}

// ─── Background Processor ─────────────────────────────────────────────

async function processInBackground(jobId, extractionId, text, postId) {
  try {
    const result = await Promise.race([
      claimEntityService.extractClaimsAndEntities(text, postId, null),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Background processing timed out')),
          BACKGROUND_TIMEOUT_MS
        )
      ),
    ]);

    const updateFields = {
      status: 'completed',
      processingTimeMs: result.savedAnalysis?.processingTimeMs || 0,
    };

    if (result.savedAnalysis) {
      updateFields.claims = result.savedAnalysis.claims;
      updateFields.entities = result.savedAnalysis.entities;
      updateFields.preprocessing = result.savedAnalysis.preprocessing;
      updateFields.confidence = result.savedAnalysis.confidence;
      updateFields.modelVersion = result.savedAnalysis.modelVersion;
      updateFields.verificationScore = result.savedAnalysis.verificationScore;
      updateFields.errors = result.savedAnalysis.errors;
    }

    await ClaimEntity.findByIdAndUpdate(extractionId, updateFields);

    console.log(`[ClaimEntity] Job ${jobId} completed`);
  } catch (err) {
    console.error(`[ClaimEntity] Job ${jobId} failed:`, err.message);
    await ClaimEntity.findByIdAndUpdate(extractionId, {
      status: 'failed',
      $push: {
        errors: { stage: 'background_processing', message: err.message },
      },
    });
  } finally {
    _inflight.delete(jobId);
  }
}

// ─── Controllers ──────────────────────────────────────────────────────

/**
 * POST /api/v1/content/extract-claims
 * Direct claim and entity extraction without requiring a post.
 */
exports.extractClaimsDirect = async (req, res, next) => {
  try {
    const { text, postId } = validateRequest(req.body);

    // Check for existing extraction (dedup)
    if (postId) {
      const existing = await ClaimEntity.findOne({
        post: postId,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Claim/entity extraction already exists for this post',
          analysis: formatResult(existing),
          cached: true,
        });
      }
    }

    // Run extraction synchronously (for direct endpoint)
    const result = await claimEntityService.extractDirect(text, postId);

    if (result.status === 'FAILED') {
      throw new ApiError(500, result.results.error || 'Extraction failed');
    }

    res.status(200).json({
      success: true,
      analysis: formatResult(result.savedAnalysis),
      cached: false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/analyze/claims-entities
 * Async extraction — returns a jobId for polling.
 */
exports.submitClaimEntityExtraction = async (req, res, next) => {
  try {
    const { text, postId } = validateRequest(req.body);

    // Dedup check
    if (postId) {
      const existing = await ClaimEntity.findOne({
        post: postId,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Claim/entity extraction already exists for this post',
          jobId: existing.jobId || existing._id.toString(),
          status: 'completed',
          analysis: formatResult(existing),
          cached: true,
        });
      }
    }

    const jobId = uuidv4();

    // Create placeholder document
    const extraction = await ClaimEntity.create({
      status: 'processing',
      post: postId || undefined,
      inputText: text,
      jobId,
      modelVersion: 'nexora-claims-v1.0.0',
    });

    _inflight.set(jobId, {
      extractionId: extraction._id,
      text,
      postId,
      startedAt: Date.now(),
    });

    // Launch background processing
    setImmediate(() => {
      processInBackground(jobId, extraction._id, text, postId);
    });

    res.status(202).json({
      success: true,
      message: 'Claim/entity extraction queued for background processing',
      jobId,
      status: 'processing',
      statusUrl: `/api/v1/analyze/claims-entities/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/analyze/claims-entities/:jobId
 * Poll extraction status/results.
 */
exports.getClaimEntityStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new ApiError(400, 'jobId is required');
    }

    const inFlight = _inflight.get(jobId);

    let extraction = await ClaimEntity.findOne({ jobId: jobId.trim() });

    if (!extraction && /^[0-9a-fA-F]{24}$/.test(jobId.trim())) {
      extraction = await ClaimEntity.findById(jobId.trim());
    }

    if (!extraction) {
      throw new ApiError(404, `No extraction job found with ID: ${jobId}`);
    }

    const response = {
      success: true,
      jobId: extraction.jobId || extraction._id.toString(),
      status: extraction.status,
      createdAt: extraction.createdAt,
      updatedAt: extraction.updatedAt,
    };

    if (extraction.status === 'processing') {
      const elapsed = inFlight
        ? Date.now() - inFlight.startedAt
        : Date.now() - extraction.createdAt.getTime();
      response.message = 'Claim/entity extraction is still processing';
      response.elapsedMs = elapsed;
    } else if (extraction.status === 'completed') {
      response.message = 'Claim/entity extraction completed';
      response.analysis = formatResult(extraction);
    } else if (extraction.status === 'failed') {
      response.message = 'Claim/entity extraction failed';
      response.errors = extraction.errors;
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/content/extract-claims/:postId
 * Get stored extraction results by postId.
 */
exports.getExtractionByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    const extraction = await ClaimEntity.findOne({ post: postId }).sort({
      createdAt: -1,
    });

    if (!extraction) {
      return res.status(404).json({
        success: false,
        message: 'No claim/entity extraction found for this post',
      });
    }

    res.status(200).json({
      success: true,
      analysis: formatResult(extraction),
    });
  } catch (error) {
    next(error);
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────

function formatResult(analysis) {
  if (!analysis) return null;
  return {
    id: analysis._id,
    post: analysis.post,
    status: analysis.status,
    claims: analysis.claims,
    entities: analysis.entities,
    preprocessing: analysis.preprocessing,
    confidence: analysis.confidence,
    verificationScore: analysis.verificationScore,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}
