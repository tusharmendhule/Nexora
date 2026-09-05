/**
 * Async Audio Analysis Controller
 * ================================
 * POST /api/v1/analyze/audio
 * GET  /api/v1/analyze/audio/:jobId
 *
 * Accepts a Cloudinary audio URL and returns a jobId immediately.
 * Heavy processing (download, spectral analysis, synthetic speech detection)
 * runs in the background so the Node.js event loop is never blocked.
 *
 * The client polls GET /api/v1/analyze/audio/:jobId for status and
 * final results including Trust Score integration.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const AudioAnalysis = require('../../models/audio-analysis.model');
const { ApiError } = require('../../middleware/error.middleware');

// -- Configuration ----------------------------------------------------------

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 180000; // 3 min for audio processing
const BACKGROUND_TIMEOUT = 240000; // 4 min — hard limit for background job

// In-flight job tracking (memory — survives request but not server restart)
const _inflight = new Map();

// -- Validation -------------------------------------------------------------

/**
 * Validate the analyze-audio request body.
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
 * Process audio in the background. Updates the AudioAnalysis document
 * as processing progresses. Never throws — errors are captured in the
 * document so the client can see what happened.
 */
async function processAudioInBackground(jobId, analysisId, mediaUrl, postId) {
  const startTime = Date.now();

  try {
    // Call the Python AI service with hard timeout
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/audio`,
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
          'AI audio service request timed out. Audio may be too large or complex.'
        );
      }
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        throw new Error(
          'Background processing timed out (4 min limit). Audio is too long or complex.'
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
    const syntheticFactor = 1 - ai.syntheticSpeechProbability;
    const manipulationFactor = 1 - ai.manipulationProbability;
    const confidenceFactor = ai.confidence;
    const finalScore = Math.round(
      (syntheticFactor * 0.35 +
        manipulationFactor * 0.35 +
        confidenceFactor * 0.30) *
        100
    );

    // Update the analysis document with results
    await AudioAnalysis.findByIdAndUpdate(analysisId, {
      status: 'completed',
      preprocessing: ai.preprocessing || {},
      syntheticSpeechProbability: ai.syntheticSpeechProbability,
      manipulationProbability: ai.manipulationProbability,
      spectralFeatures: ai.spectralFeatures || {},
      melSpectrogramStats: ai.melSpectrogramStats || {},
      segments: (ai.segments || []).map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        syntheticScore: s.syntheticScore,
        manipulationScore: s.manipulationScore,
        spectralAnomaly: s.spectralAnomaly,
      })),
      confidence: ai.confidence,
      modelVersion: ai.modelVersion,
      processingTimeMs,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      errors: (ai.errors || []).map((e) => ({
        stage: e.stage,
        message: e.message,
      })),
    });

    // Create TrustScore through the rule engine (documented Nexora formula)
    // if postId is provided. Audio alone cannot verify factual claims, so
    // factualVerification/sourceCredibility stay neutral (0.5) — never
    // assumed true or false.
    if (postId) {
      try {
        const trustScoreService = require('../../services/trust-score.service');
        const manipulationProbability = Math.max(
          ai.syntheticSpeechProbability || 0,
          ai.manipulationProbability || 0
        );
        await trustScoreService.computeAndStoreTrustScore(
          postId,
          {
            authenticityScore: 1 - manipulationProbability,
            factualVerificationScore: 0.5,
            sourceCredibilityScore: 0.5,
            modelConfidenceScore: confidenceFactor,
            contentType: 'audio',
            manipulationProbability,
            modelVersion: ai.modelVersion || 'nexora-audio-v1.0.0',
          }
        );
      } catch (tsErr) {
        console.error('[AudioAnalysis] TrustScore creation failed:', tsErr.message);
      }
    }

    console.log(
      `[AudioAnalysis] Job ${jobId} completed in ${processingTimeMs}ms`
    );
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`[AudioAnalysis] Job ${jobId} failed:`, err.message);

    await AudioAnalysis.findByIdAndUpdate(analysisId, {
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

// -- Controller: Submit Audio Analysis --------------------------------------

/**
 * POST /api/v1/analyze/audio
 *
 * Accepts { mediaUrl, postId? } and returns a jobId immediately.
 * Processing happens in the background.
 *
 * Output:
 *   jobId, status, message
 */
exports.submitAudioAnalysis = async (req, res, next) => {
  try {
    const { mediaUrl, postId } = validateRequest(req.body);

    // Check for duplicate: if postId is provided, check for existing analysis
    if (postId) {
      const existing = await AudioAnalysis.findOne({
        post: postId,
        mediaUrl,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Audio analysis already exists for this post and URL',
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
    const analysis = await AudioAnalysis.create({
      status: 'processing',
      post: postId || undefined,
      mediaUrl,
      // Required fields — set to placeholder values during processing
      syntheticSpeechProbability: 0,
      manipulationProbability: 0,
      confidence: 0,
      modelVersion: 'nexora-audio-v1.0.0',
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
      processAudioInBackground(
        jobId,
        analysis._id,
        mediaUrl,
        postId
      );
    });

    res.status(202).json({
      success: true,
      message: 'Audio analysis queued for background processing',
      jobId,
      status: 'processing',
      statusUrl: `/api/v1/analyze/audio/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
};

// -- Controller: Get Audio Analysis Status ----------------------------------

/**
 * GET /api/v1/analyze/audio/:jobId
 *
 * Returns the current status and results (if complete) of an audio analysis job.
 *
 * Output:
 *   jobId, status, analysis (when complete), errors (when failed)
 */
exports.getAudioAnalysisStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new ApiError(400, 'jobId is required');
    }

    // Check in-memory tracking first (fast path for recently submitted jobs)
    const inFlight = _inflight.get(jobId);

    // Look up the analysis document by jobId field or by _id
    let analysis = await AudioAnalysis.findOne({ jobId: jobId.trim() });

    if (!analysis) {
      // Try matching by _id (for backward compatibility)
      if (/^[0-9a-fA-F]{24}$/.test(jobId.trim())) {
        analysis = await AudioAnalysis.findById(jobId.trim());
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
      response.message = 'Audio analysis is still processing';
      response.elapsedMs = elapsed;
    } else if (analysis.status === 'completed') {
      // Done — include full results
      response.message = 'Audio analysis completed';
      response.analysis = formatAnalysisResult(analysis);
    } else if (analysis.status === 'failed') {
      // Failed — include error information
      response.message = 'Audio analysis failed';
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
    preprocessing: analysis.preprocessing,
    syntheticSpeechProbability: analysis.syntheticSpeechProbability,
    manipulationProbability: analysis.manipulationProbability,
    spectralFeatures: analysis.spectralFeatures,
    melSpectrogramStats: analysis.melSpectrogramStats,
    segments: analysis.segments,
    confidence: analysis.confidence,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    finalScore: analysis.finalScore,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}

// Trust labels are NOT derived from ad-hoc score thresholds here — they are
// computed by the trust-score service rule engine using the documented
// weighted formula. See trust-score.service.js.
