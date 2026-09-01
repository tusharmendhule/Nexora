/**
 * Async Link Analysis Controller
 * ===============================
 * POST /api/v1/analyze/link
 * GET  /api/v1/analyze/link/:jobId
 *
 * Accepts a URL and returns a jobId immediately.
 * Heavy processing (fetching, parsing, fact-checking) runs in the
 * background so the Node.js event loop is never blocked.
 *
 * The client polls GET /api/v1/analyze/link/:jobId for status and
 * final results including Trust Score integration.
 */

const { v4: uuidv4 } = require('uuid');
const LinkAnalysis = require('../../models/link-analysis.model');
const { ApiError } = require('../../middleware/error.middleware');
const linkAnalysisService = require('../../services/link-analysis.service');

// -- Configuration ----------------------------------------------------------

const BACKGROUND_TIMEOUT_MS = 60000; // 60 seconds hard limit for background job

// In-flight job tracking (memory — survives request but not server restart)
const _inflight = new Map();

// -- Validation -------------------------------------------------------------

/**
 * Validate the analyze-link request body.
 */
function validateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  if (!body.url || typeof body.url !== 'string' || body.url.trim().length === 0) {
    errors.push('url is required and must be a non-empty string');
  }

  if (body.url && typeof body.url === 'string') {
    const trimmed = body.url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      errors.push('url must be a valid HTTP(S) URL');
    }
    if (trimmed.length > 2048) {
      errors.push('url must not exceed 2048 characters');
    }
  }

  // postId is optional for standalone analysis
  if (body.postId !== undefined && body.postId !== null) {
    if (typeof body.postId !== 'string' || body.postId.trim().length === 0) {
      errors.push('postId must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  return {
    url: body.url.trim(),
    postId: body.postId ? body.postId.trim() : null,
  };
}

// -- Background Processor ---------------------------------------------------

/**
 * Process link in the background. Updates the LinkAnalysis document
 * as processing progresses. Never throws — errors are captured in the
 * document so the client can see what happened.
 */
async function processLinkInBackground(jobId, analysisId, url, postId) {
  const startTime = Date.now();

  try {
    // Run the full analysis pipeline
    const result = await Promise.race([
      linkAnalysisService.analyzeLinkDirect(url, postId, null),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Background processing timed out (60s limit)')),
          BACKGROUND_TIMEOUT_MS
        )
      ),
    ]);

    const processingTimeMs = Date.now() - startTime;

    // Update the analysis document with results
    const updateFields = {
      status: 'completed',
      processingTimeMs,
    };

    // Copy fields from saved analysis if available
    if (result.savedAnalysis) {
      updateFields.resolvedUrl = result.savedAnalysis.resolvedUrl;
      updateFields.httpStatus = result.savedAnalysis.httpStatus;
      updateFields.redirectChain = result.savedAnalysis.redirectChain;
      updateFields.pageTitle = result.savedAnalysis.pageTitle;
      updateFields.metaDescription = result.savedAnalysis.metaDescription;
      updateFields.ogTitle = result.savedAnalysis.ogTitle;
      updateFields.ogDescription = result.savedAnalysis.ogDescription;
      updateFields.ogImage = result.savedAnalysis.ogImage;
      updateFields.ogType = result.savedAnalysis.ogType;
      updateFields.ogSiteName = result.savedAnalysis.ogSiteName;
      updateFields.keywords = result.savedAnalysis.keywords;
      updateFields.canonicalUrl = result.savedAnalysis.canonicalUrl;
      updateFields.language = result.savedAnalysis.language;
      updateFields.extractedText = result.savedAnalysis.extractedText;
      updateFields.preprocessing = result.savedAnalysis.preprocessing;
      updateFields.misinformationProbability = result.savedAnalysis.misinformationProbability;
      updateFields.sourceCredibility = result.savedAnalysis.sourceCredibility;
      updateFields.claims = result.savedAnalysis.claims;
      updateFields.entities = result.savedAnalysis.entities;
      updateFields.factCheckResults = result.savedAnalysis.factCheckResults;
      updateFields.confidence = result.savedAnalysis.confidence;
      updateFields.finalScore = result.savedAnalysis.finalScore;
      updateFields.modelVersion = result.savedAnalysis.modelVersion;
      updateFields.errors = result.savedAnalysis.errors;
    } else {
      // Results from inline result (e.g., validation failure)
      updateFields.finalScore = result.results?.finalScore || 0;
      updateFields.errors = result.results?.error
        ? [{ stage: 'pipeline', message: result.results.error }]
        : [];
    }

    await LinkAnalysis.findByIdAndUpdate(analysisId, updateFields);

    console.log(
      `[LinkAnalysis] Job ${jobId} completed in ${processingTimeMs}ms`
    );
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`[LinkAnalysis] Job ${jobId} failed:`, err.message);

    await LinkAnalysis.findByIdAndUpdate(analysisId, {
      status: 'failed',
      processingTimeMs,
      $push: {
        errors: {
          stage: 'background_processing',
          message: err.message,
        },
      },
    });
  } finally {
    _inflight.delete(jobId);
  }
}

// -- Controller: Submit Link Analysis ----------------------------------------

/**
 * POST /api/v1/analyze/link
 *
 * Accepts { url, postId? } and returns a jobId immediately.
 * Processing happens in the background.
 *
 * Output:
 *   jobId, status, message
 */
exports.submitLinkAnalysis = async (req, res, next) => {
  try {
    const { url, postId } = validateRequest(req.body);

    // Check for duplicate: if postId is provided, check for existing analysis
    if (postId) {
      const existing = await LinkAnalysis.findOne({
        post: postId,
        originalUrl: url,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Link analysis already exists for this post and URL',
          jobId: existing.jobId || existing._id.toString(),
          status: 'completed',
          analysis: formatAnalysisResult(existing),
          cached: true,
        });
      }
    }

    // Generate a unique job ID
    const jobId = uuidv4();

    // Create a placeholder document to track processing
    const analysis = await LinkAnalysis.create({
      status: 'processing',
      post: postId || undefined,
      originalUrl: url,
      // Required fields — set to placeholder values during processing
      finalScore: null,
      modelVersion: linkAnalysisService.MODEL_VERSION,
      jobId,
    });

    // Track in-flight job
    _inflight.set(jobId, {
      analysisId: analysis._id,
      url,
      postId,
      startedAt: Date.now(),
    });

    // Launch background processing (non-blocking)
    // setImmediate ensures we yield back to the event loop immediately
    setImmediate(() => {
      processLinkInBackground(jobId, analysis._id, url, postId);
    });

    res.status(202).json({
      success: true,
      message: 'Link analysis queued for background processing',
      jobId,
      status: 'processing',
      statusUrl: `/api/v1/analyze/link/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
};

// -- Controller: Get Link Analysis Status ------------------------------------

/**
 * GET /api/v1/analyze/link/:jobId
 *
 * Returns the current status and results (if complete) of a link analysis job.
 *
 * Output:
 *   jobId, status, analysis (when complete), errors (when failed)
 */
exports.getLinkAnalysisStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new ApiError(400, 'jobId is required');
    }

    // Check in-memory tracking first (fast path for recently submitted jobs)
    const inFlight = _inflight.get(jobId);

    // Look up the analysis document by jobId field or by _id
    let analysis = await LinkAnalysis.findOne({ jobId: jobId.trim() });

    if (!analysis) {
      // Try matching by _id (for backward compatibility)
      if (/^[0-9a-fA-F]{24}$/.test(jobId.trim())) {
        analysis = await LinkAnalysis.findById(jobId.trim());
      }
    }

    if (!analysis) {
      throw new ApiError(404, `No analysis job found with ID: ${jobId}`);
    }

    const response = {
      success: true,
      jobId: analysis.jobId || analysis._id.toString(),
      status: analysis.status,
      originalUrl: analysis.originalUrl,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    };

    if (analysis.status === 'processing') {
      // Still processing — include elapsed time
      const elapsed = inFlight
        ? Date.now() - inFlight.startedAt
        : Date.now() - analysis.createdAt.getTime();
      response.message = 'Link analysis is still processing';
      response.elapsedMs = elapsed;
    } else if (analysis.status === 'completed') {
      // Done — include full results
      response.message = 'Link analysis completed';
      response.analysis = formatAnalysisResult(analysis);
    } else if (analysis.status === 'failed') {
      // Failed — include error information
      response.message = 'Link analysis failed';
      response.errors = analysis.errors;
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// -- Helpers ----------------------------------------------------------------

function formatAnalysisResult(analysis) {
  return {
    id: analysis._id,
    post: analysis.post,
    originalUrl: analysis.originalUrl,
    resolvedUrl: analysis.resolvedUrl,
    httpStatus: analysis.httpStatus,
    redirectChain: analysis.redirectChain,
    pageTitle: analysis.pageTitle,
    metaDescription: analysis.metaDescription,
    ogTitle: analysis.ogTitle,
    ogDescription: analysis.ogDescription,
    ogImage: analysis.ogImage,
    ogType: analysis.ogType,
    ogSiteName: analysis.ogSiteName,
    keywords: analysis.keywords,
    canonicalUrl: analysis.canonicalUrl,
    language: analysis.language,
    extractedText: analysis.extractedText
      ? analysis.extractedText.substring(0, 500) + (analysis.extractedText.length > 500 ? '...' : '')
      : null,
    preprocessing: analysis.preprocessing,
    misinformationProbability: analysis.misinformationProbability,
    sourceCredibility: analysis.sourceCredibility,
    claims: analysis.claims,
    entities: analysis.entities,
    factCheckResults: analysis.factCheckResults,
    confidence: analysis.confidence,
    finalScore: analysis.finalScore,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}
