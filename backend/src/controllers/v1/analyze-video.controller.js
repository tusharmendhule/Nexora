/**
 * Async Video Analysis Controller
 * ================================
 * POST /api/v1/analyze/video
 * GET  /api/v1/analyze/video/:jobId
 *
 * Accepts a Cloudinary video URL and returns a jobId immediately.
 * Heavy processing (download, frame analysis, deepfake detection) runs
 * in the background so the Node.js event loop is never blocked.
 *
 * The client polls GET /api/v1/analyze/video/:jobId for status and
 * final results including Trust Score integration.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const VideoAnalysis = require('../../models/video-analysis.model');
const TrustScore = require('../../models/trust-score.model');
const { ApiError } = require('../../middleware/error.middleware');

// -- Configuration ----------------------------------------------------------

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 300000; // 5 min for video processing
const BACKGROUND_TIMEOUT = 360000; // 6 min — hard limit for background job

// In-flight job tracking (memory — survives request but not server restart)
const _inflight = new Map();

// -- Validation -------------------------------------------------------------

/**
 * Validate the analyze-video request body.
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
 * Process video in the background. Updates the VideoAnalysis document
 * as processing progresses. Never throws — errors are captured in the
 * document so the client can see what happened.
 */
async function processVideoInBackground(jobId, analysisId, mediaUrl, postId) {
  const startTime = Date.now();

  try {
    // Call the Python AI service with hard timeout
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/video`,
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
          'AI video service request timed out. Video may be too large or complex.'
        );
      }
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        throw new Error(
          'Background processing timed out (6 min limit). Video is too long or complex.'
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
    const deepfakeFactor = 1 - ai.deepfakeProbability;
    const manipulationFactor = 1 - ai.manipulationProbability;
    const confidenceFactor = ai.confidence;
    const finalScore = Math.round(
      (deepfakeFactor * 0.40 +
        manipulationFactor * 0.30 +
        confidenceFactor * 0.30) *
        100
    );

    // Update the analysis document with results
    await VideoAnalysis.findByIdAndUpdate(analysisId, {
      status: 'completed',
      deepfakeProbability: ai.deepfakeProbability,
      manipulationProbability: ai.manipulationProbability,
      frameCount: ai.frameCount,
      analyzedFrames: ai.analyzedFrames,
      frames: (ai.frames || []).map((f) => ({
        frameIndex: f.frameIndex,
        timestamp: f.timestamp,
        facesDetected: f.facesDetected,
        hasFace: f.hasFace,
        manipulationScore: f.manipulationScore,
        frequencyAnomaly: f.frequencyAnomaly,
        colorAnomaly: f.colorAnomaly,
        overallFrameScore: f.overallFrameScore,
      })),
      temporalConsistency: ai.temporalConsistency || {
        interFrameVariance: 0,
        temporalCoherence: 1,
        flickerScore: 0,
        consistentManipulation: false,
      },
      faceDetectionRate: ai.faceDetectionRate,
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
        const authenticityScore = 1 - Math.max(
          ai.deepfakeProbability,
          ai.manipulationProbability
        );
        const tsLabel = getTrustLabel(finalScore);
        const tsExplanation = generateExplanation(
          ai.deepfakeProbability,
          ai.manipulationProbability,
          ai.faceDetectionRate,
          ai.temporalConsistency
        );

        await TrustScore.findOneAndUpdate(
          { post: postId },
          {
            post: postId,
            authenticityScore: Math.max(0, Math.min(1, authenticityScore)),
            factualVerificationScore: 0.5,
            sourceCredibilityScore: 0.5,
            modelConfidenceScore: confidenceFactor,
            finalScore: Math.max(0, Math.min(100, finalScore)),
            label: tsLabel,
            explanation: tsExplanation,
            isOverrideApplied: false,
            modelAndRuleVersion: ai.modelVersion || 'nexora-video-v1.0.0',
          },
          { upsert: true, new: true }
        );
      } catch (tsErr) {
        console.error('[VideoAnalysis] TrustScore creation failed:', tsErr.message);
      }
    }

    console.log(
      `[VideoAnalysis] Job ${jobId} completed in ${processingTimeMs}ms`
    );
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`[VideoAnalysis] Job ${jobId} failed:`, err.message);

    await VideoAnalysis.findByIdAndUpdate(analysisId, {
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

// -- Controller: Submit Video Analysis --------------------------------------

/**
 * POST /api/v1/analyze/video
 *
 * Accepts { mediaUrl, postId? } and returns a jobId immediately.
 * Processing happens in the background.
 *
 * Output:
 *   jobId, status, message
 */
exports.submitVideoAnalysis = async (req, res, next) => {
  try {
    const { mediaUrl, postId } = validateRequest(req.body);

    // Check for duplicate: if postId is provided, check for existing analysis
    if (postId) {
      const existing = await VideoAnalysis.findOne({
        post: postId,
        mediaUrl,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Video analysis already exists for this post and URL',
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
    const analysis = await VideoAnalysis.create({
      status: 'processing',
      post: postId || undefined,
      mediaUrl,
      // Required fields — set to placeholder values during processing
      deepfakeProbability: 0,
      manipulationProbability: 0,
      frameCount: 0,
      analyzedFrames: 0,
      confidence: 0,
      modelVersion: 'nexora-video-v1.0.0',
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
    // setImmediate ensures we yield back to the event loop immediately
    setImmediate(() => {
      processVideoInBackground(
        jobId,
        analysis._id,
        mediaUrl,
        postId
      );
    });

    res.status(202).json({
      success: true,
      message: 'Video analysis queued for background processing',
      jobId,
      status: 'processing',
      statusUrl: `/api/v1/analyze/video/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
};

// -- Controller: Get Video Analysis Status ----------------------------------

/**
 * GET /api/v1/analyze/video/:jobId
 *
 * Returns the current status and results (if complete) of a video analysis job.
 *
 * Output:
 *   jobId, status, analysis (when complete), errors (when failed)
 */
exports.getVideoAnalysisStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new ApiError(400, 'jobId is required');
    }

    // Check in-memory tracking first (fast path for recently submitted jobs)
    const inFlight = _inflight.get(jobId);

    // Look up the analysis document by jobId field or by _id
    let analysis = await VideoAnalysis.findOne({ jobId: jobId.trim() });

    if (!analysis) {
      // Try matching by _id (for backward compatibility)
      if (/^[0-9a-fA-F]{24}$/.test(jobId.trim())) {
        analysis = await VideoAnalysis.findById(jobId.trim());
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
      response.message = 'Video analysis is still processing';
      response.elapsedMs = elapsed;
    } else if (analysis.status === 'completed') {
      // Done — include full results
      response.message = 'Video analysis completed';
      response.analysis = formatAnalysisResult(analysis);
    } else if (analysis.status === 'failed') {
      // Failed — include error information
      response.message = 'Video analysis failed';
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
    mediaUrl: analysis.mediaUrl,
    deepfakeProbability: analysis.deepfakeProbability,
    manipulationProbability: analysis.manipulationProbability,
    frameCount: analysis.frameCount,
    analyzedFrames: analysis.analyzedFrames,
    frames: analysis.frames,
    temporalConsistency: analysis.temporalConsistency,
    faceDetectionRate: analysis.faceDetectionRate,
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

function generateExplanation(deepfake, manipulation, faceRate, temporal) {
  const parts = [];

  if (deepfake > 0.6) {
    parts.push(
      `High deepfake probability detected (${(deepfake * 100).toFixed(1)}%). `
    );
  } else if (deepfake > 0.3) {
    parts.push(
      `Moderate deepfake indicators found (${(deepfake * 100).toFixed(1)}%). `
    );
  } else {
    parts.push(
      `Low deepfake probability (${(deepfake * 100).toFixed(1)}%). `
    );
  }

  if (manipulation > 0.5) {
    parts.push(
      `Significant manipulation detected (${(manipulation * 100).toFixed(1)}%). `
    );
  }

  if (faceRate > 0.5) {
    parts.push(`Faces detected in ${(faceRate * 100).toFixed(0)}% of frames. `);
  }

  if (temporal && temporal.consistentManipulation) {
    parts.push('Consistent manipulation pattern across frames. ');
  }

  if (parts.length === 0) {
    parts.push('Video analysis completed with limited indicators.');
  }

  return parts.join('').trim();
}
