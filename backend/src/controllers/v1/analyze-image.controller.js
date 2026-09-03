/**
 * Async Image Analysis Controller
 * ================================
 * POST /api/v1/analyze/image
 * GET  /api/v1/analyze/image/:jobId
 *
 * Accepts a Cloudinary image URL and returns a jobId immediately.
 * Heavy processing (download, face detection, manipulation analysis) runs
 * in the background so the Node.js event loop is never blocked.
 *
 * The client polls GET /api/v1/analyze/image/:jobId for status and
 * final results including Trust Score integration.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const ImageAnalysis = require('../../models/image-analysis.model');
const TrustScore = require('../../models/trust-score.model');
const { ApiError } = require('../../middleware/error.middleware');

// -- Configuration ----------------------------------------------------------

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 120000; // 2 min for image processing
const BACKGROUND_TIMEOUT = 180000; // 3 min — hard limit for background job

// In-flight job tracking (memory — survives request but not server restart)
const _inflight = new Map();

// -- Validation -------------------------------------------------------------

/**
 * Validate the analyze-image request body.
 */
function validateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  if (
    !body.mediaUrl ||
    typeof body.mediaUrl !== 'string' ||
    body.mediaUrl.trim().length === 0
  ) {
    errors.push('mediaUrl is required and must be a non-empty string');
  }

  if (body.mediaUrl && !body.mediaUrl.startsWith('http')) {
    errors.push('mediaUrl must be a valid HTTP(S) URL');
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
    mediaUrl: body.mediaUrl.trim(),
    postId: body.postId ? body.postId.trim() : null,
  };
}

// -- Background Processor ---------------------------------------------------

/**
 * Process image in the background. Updates the ImageAnalysis document
 * as processing progresses. Never throws — errors are captured in the
 * document so the client can see what happened.
 */
async function processImageInBackground(jobId, analysisId, mediaUrl, postId) {
  const startTime = Date.now();

  try {
    // Call the Python AI service with hard timeout
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/image`,
        { mediaUrl, postId: postId || jobId },
        {
          timeout: AI_SERVICE_TIMEOUT,
          signal: AbortSignal.timeout(BACKGROUND_TIMEOUT),
        }
      );
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        throw new Error(
          `AI service is not available at ${AI_SERVICE_URL}. Start the Python service first.`
        );
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new Error(
          'AI image service request timed out. Image may be too large or complex.'
        );
      }
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        throw new Error(
          'Background processing timed out (3 min limit). Image is too large or complex.'
        );
      }
      if (err.response && err.response.data) {
        const detail =
          err.response.data.detail || err.response.statusText;
        throw new Error(`AI service error (${err.response.status}): ${detail}`);
      }
      throw new Error(`AI service request failed: ${err.message}`);
    }

    const ai = aiResponse.data;
    const processingTimeMs = Date.now() - startTime;

    // Compute composite trust score
    const manipulationFactor = 1 - ai.manipulationProbability;
    const faceManipFactor = 1 - ai.faceManipulationProbability;
    const confidenceFactor = ai.confidence;
    const finalScore = Math.round(
      (manipulationFactor * 0.40 +
        faceManipFactor * 0.25 +
        confidenceFactor * 0.35) *
        100
    );

    // Update the analysis document with results
    await ImageAnalysis.findByIdAndUpdate(analysisId, {
      status: 'completed',
      manipulationProbability: ai.manipulationProbability,
      faceManipulationProbability: ai.faceManipulationProbability,
      frequencyAnomaly: ai.frequencyAnomaly,
      colorAnomaly: ai.colorAnomaly,
      textureAnomaly: ai.textureAnomaly,
      faceDetectionCount: ai.faceDetectionCount,
      hasFace: ai.hasFace,
      preprocessing: ai.preprocessing || {},
      confidence: ai.confidence,
      modelVersion: ai.modelVersion,
      processingTimeMs,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      errors: (ai.errors || []).map((e) => ({
        stage: e.stage,
        message: e.message,
      })),
    });

    // Create TrustScore document if postId is provided
    if (postId) {
      try {
        const authenticityScore = 1 - ai.manipulationProbability;
        const tsLabel = getTrustLabel(finalScore);
        const tsExplanation = generateExplanation(
          ai.manipulationProbability,
          ai.faceManipulationProbability,
          ai.hasFace,
          ai.faceDetectionCount
        );

        await TrustScore.findOneAndUpdate(
          { post: postId },
          {
            post: postId,
            authenticity: Math.max(0, Math.min(1, authenticityScore)),
            factualVerification: 0.5,
            sourceCredibility: 0.5,
            modelConfidence: confidenceFactor,
            score: Math.max(0, Math.min(100, finalScore)),
            label: tsLabel,
            explanation: tsExplanation,
            isOverrideApplied: false,
            modelVersion: ai.modelVersion || 'nexora-image-v1.0.0',
          },
          { upsert: true, new: true }
        );
      } catch (tsErr) {
        console.error('[ImageAnalysis] TrustScore creation failed:', tsErr.message);
      }
    }

    console.log(
      `[ImageAnalysis] Job ${jobId} completed in ${processingTimeMs}ms`
    );
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`[ImageAnalysis] Job ${jobId} failed:`, err.message);

    await ImageAnalysis.findByIdAndUpdate(analysisId, {
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

// -- Controller: Submit Image Analysis --------------------------------------

/**
 * POST /api/v1/analyze/image
 *
 * Accepts { mediaUrl, postId? } and returns a jobId immediately.
 * Processing happens in the background.
 *
 * Output:
 *   jobId, status, message
 */
exports.submitImageAnalysis = async (req, res, next) => {
  try {
    const { mediaUrl, postId } = validateRequest(req.body);

    // Check for duplicate: if postId is provided, check for existing analysis
    if (postId) {
      const existing = await ImageAnalysis.findOne({
        post: postId,
        mediaUrl,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Image analysis already exists for this post and URL',
          jobId: existing._id.toString(),
          status: 'completed',
          analysis: formatAnalysisResult(existing),
          cached: true,
        });
      }
    }

    // Generate a unique job ID
    const jobId = uuidv4();

    // Create a placeholder document to track processing
    const analysis = await ImageAnalysis.create({
      status: 'processing',
      post: postId || undefined,
      mediaUrl,
      // Required fields — set to placeholder values during processing
      manipulationProbability: 0,
      faceManipulationProbability: 0,
      frequencyAnomaly: 0,
      colorAnomaly: 0,
      textureAnomaly: 0,
      faceDetectionCount: 0,
      hasFace: false,
      confidence: 0,
      modelVersion: 'nexora-image-v1.0.0',
      jobId,
    });

    // Track in-flight job
    _inflight.set(jobId, {
      analysisId: analysis._id,
      mediaUrl,
      postId,
      startedAt: Date.now(),
    });

    // Launch background processing (non-blocking)
    setImmediate(() => {
      processImageInBackground(
        jobId,
        analysis._id,
        mediaUrl,
        postId
      );
    });

    res.status(202).json({
      success: true,
      message: 'Image analysis queued for background processing',
      jobId,
      status: 'processing',
      statusUrl: `/api/v1/analyze/image/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
};

// -- Controller: Get Image Analysis Status ----------------------------------

/**
 * GET /api/v1/analyze/image/:jobId
 *
 * Returns the current status and results (if complete) of an image analysis job.
 *
 * Output:
 *   jobId, status, analysis (when complete), errors (when failed)
 */
exports.getImageAnalysisStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new ApiError(400, 'jobId is required');
    }

    // Check in-memory tracking first (fast path for recently submitted jobs)
    const inFlight = _inflight.get(jobId);

    // Look up the analysis document by jobId field or by _id
    let analysis = await ImageAnalysis.findOne({ jobId: jobId.trim() });

    if (!analysis) {
      // Try matching by _id (for backward compatibility)
      if (/^[0-9a-fA-F]{24}$/.test(jobId.trim())) {
        analysis = await ImageAnalysis.findById(jobId.trim());
      }
    }

    if (!analysis) {
      throw new ApiError(404, `No analysis job found with ID: ${jobId}`);
    }

    const response = {
      success: true,
      jobId: analysis.jobId || analysis._id.toString(),
      status: analysis.status,
      mediaUrl: analysis.mediaUrl,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    };

    if (analysis.status === 'processing') {
      // Still processing — include elapsed time
      const elapsed = inFlight
        ? Date.now() - inFlight.startedAt
        : Date.now() - analysis.createdAt.getTime();
      response.message = 'Image analysis is still processing';
      response.elapsedMs = elapsed;
    } else if (analysis.status === 'completed') {
      // Done — include full results
      response.message = 'Image analysis completed';
      response.analysis = formatAnalysisResult(analysis);
    } else if (analysis.status === 'failed') {
      // Failed — include error information
      response.message = 'Image analysis failed';
      response.errors = analysis.errors;
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// -- Direct Controller (for content pipeline) -------------------------------

/**
 * POST /api/v1/content/analyze-image
 *
 * Direct synchronous image analysis (for content pipeline integration).
 */
exports.analyzeImageDirect = async (req, res, next) => {
  try {
    const { mediaUrl, postId } = validateRequest(req.body);

    // Check for existing analysis
    if (postId) {
      const existing = await ImageAnalysis.findOne({
        post: postId,
        mediaUrl,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          analysis: formatAnalysisResult(existing),
          cached: true,
        });
      }
    }

    // Call Python AI service synchronously
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/image`,
        { mediaUrl, postId: postId || 'direct' },
        { timeout: AI_SERVICE_TIMEOUT }
      );
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        throw new ApiError(
          503,
          `AI service is not available at ${AI_SERVICE_URL}. Start the Python service first.`
        );
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new ApiError(504, 'AI service request timed out.');
      }
      if (err.response && err.response.data) {
        const detail = err.response.data.detail || err.response.statusText;
        throw new ApiError(err.response.status || 500, `AI service error: ${detail}`);
      }
      throw new ApiError(500, `AI service request failed: ${err.message}`);
    }

    const ai = aiResponse.data;

    // Compute composite trust score
    const manipulationFactor = 1 - ai.manipulationProbability;
    const faceManipFactor = 1 - ai.faceManipulationProbability;
    const confidenceFactor = ai.confidence;
    const finalScore = Math.round(
      (manipulationFactor * 0.40 +
        faceManipFactor * 0.25 +
        confidenceFactor * 0.35) *
        100
    );

    // Store results
    const saved = await ImageAnalysis.create({
      post: postId || undefined,
      mediaUrl,
      status: 'completed',
      preprocessing: ai.preprocessing || {},
      manipulationProbability: ai.manipulationProbability,
      faceManipulationProbability: ai.faceManipulationProbability,
      frequencyAnomaly: ai.frequencyAnomaly,
      colorAnomaly: ai.colorAnomaly,
      textureAnomaly: ai.textureAnomaly,
      faceDetectionCount: ai.faceDetectionCount,
      hasFace: ai.hasFace,
      confidence: ai.confidence,
      modelVersion: ai.modelVersion,
      processingTimeMs: ai.processingTimeMs,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      errors: (ai.errors || []).map((e) => ({
        stage: e.stage,
        message: e.message,
      })),
    });

    res.status(200).json({
      success: ai.success,
      analysis: {
        ...formatAnalysisResult(saved),
        finalScore: Math.max(0, Math.min(100, finalScore)),
      },
      cached: false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/content/analyze-image/:postId
 *
 * Retrieve stored image analysis results for a given post.
 */
exports.getAnalysisByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    const analysis = await ImageAnalysis.findOne({ post: postId })
      .sort({ createdAt: -1 });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'No image analysis results found for this post',
      });
    }

    res.status(200).json({
      success: true,
      analysis: formatAnalysisResult(analysis),
    });
  } catch (error) {
    next(error);
  }
};

// -- Helpers ----------------------------------------------------------------

function formatAnalysisResult(analysis) {
  return {
    id: analysis._id,
    post: analysis.post,
    mediaUrl: analysis.mediaUrl,
    preprocessing: analysis.preprocessing,
    manipulationProbability: analysis.manipulationProbability,
    faceManipulationProbability: analysis.faceManipulationProbability,
    frequencyAnomaly: analysis.frequencyAnomaly,
    colorAnomaly: analysis.colorAnomaly,
    textureAnomaly: analysis.textureAnomaly,
    faceDetectionCount: analysis.faceDetectionCount,
    hasFace: analysis.hasFace,
    confidence: analysis.confidence,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    finalScore: analysis.finalScore,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}

function getTrustLabel(score) {
  if (score >= 80) return 'Green';
  if (score >= 60) return 'Blue';
  if (score >= 40) return 'Purple';
  if (score >= 20) return 'Orange';
  return 'Red';
}

function generateExplanation(manipulation, faceManip, hasFace, faceCount) {
  const parts = [];

  if (manipulation > 0.6) {
    parts.push(
      `High manipulation probability detected (${(manipulation * 100).toFixed(1)}%). `
    );
  } else if (manipulation > 0.3) {
    parts.push(
      `Moderate manipulation indicators found (${(manipulation * 100).toFixed(1)}%). `
    );
  } else {
    parts.push(
      `Low manipulation probability (${(manipulation * 100).toFixed(1)}%). `
    );
  }

  if (faceManip > 0.5) {
    parts.push(
      `Face manipulation detected (${(faceManip * 100).toFixed(1)}%). `
    );
  }

  if (hasFace && faceCount > 0) {
    parts.push(`${faceCount} face(s) detected in the image. `);
  }

  if (parts.length === 0) {
    parts.push('Image analysis completed with limited indicators.');
  }

  return parts.join('').trim();
}
