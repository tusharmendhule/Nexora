/**
 * Audio Analysis Controller
 * =========================
 * POST /api/v1/content/analyze-audio
 *
 * Accepts an audio URL for synthetic speech / manipulation analysis.
 * Calls the Python AI audio service and returns structured results.
 * Optionally stores results in MongoDB.
 */

const axios = require('axios');
const AudioAnalysis = require('../../models/audio-analysis.model');
const { ApiError } = require('../../middleware/error.middleware');

// -- Configuration ----------------------------------------------------------

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 180000; // 3 min for audio processing

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

  if (body.mediaUrl && typeof body.mediaUrl === 'string' && !body.mediaUrl.startsWith('http')) {
    errors.push('mediaUrl must be a valid HTTP(S) URL');
  }

  if (
    !body.postId ||
    typeof body.postId !== 'string' ||
    body.postId.trim().length === 0
  ) {
    errors.push('postId is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  return {
    mediaUrl: body.mediaUrl.trim(),
    postId: body.postId.trim(),
  };
}

// -- Controller -------------------------------------------------------------

/**
 * POST /api/v1/content/analyze-audio
 *
 * Direct audio analysis. Input: { mediaUrl, postId }
 * Returns structured synthetic speech / manipulation analysis results.
 */
exports.analyzeAudioDirect = async (req, res, next) => {
  try {
    const { mediaUrl, postId } = validateRequest(req.body);

    // Check if analysis already exists for this postId + mediaUrl
    const existing = await AudioAnalysis.findOne({
      post: postId,
      mediaUrl,
    }).sort({ createdAt: -1 });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Audio analysis already exists for this post',
        analysis: formatAnalysisResult(existing),
        cached: true,
      });
    }

    // Call the Python AI service
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/audio`,
        { mediaUrl, postId },
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
        throw new ApiError(
          504,
          'AI audio service request timed out. Audio processing may be too slow.'
        );
      }
      if (err.response && err.response.data) {
        const detail =
          err.response.data.detail || err.response.statusText;
        throw new ApiError(err.response.status || 500, `AI service error: ${detail}`);
      }
      throw new ApiError(500, `AI service request failed: ${err.message}`);
    }

    const ai = aiResponse.data;

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

    // Store results in MongoDB
    const saved = await AudioAnalysis.create({
      post: postId,
      contentJob: null, // direct analysis, no content job
      mediaUrl,
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
      processingTimeMs: ai.processingTimeMs,
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
 * GET /api/v1/content/analyze-audio/:postId
 *
 * Retrieve stored audio analysis results for a given post.
 */
exports.getAnalysisByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    const analysis = await AudioAnalysis.findOne({ post: postId }).sort({
      createdAt: -1,
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'No audio analysis results found for this post',
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
    syntheticSpeechProbability: analysis.syntheticSpeechProbability,
    manipulationProbability: analysis.manipulationProbability,
    spectralFeatures: analysis.spectralFeatures,
    melSpectrogramStats: analysis.melSpectrogramStats,
    segments: analysis.segments,
    confidence: analysis.confidence,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}
