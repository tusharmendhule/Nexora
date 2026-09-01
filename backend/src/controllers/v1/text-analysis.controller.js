/**
 * Direct Text Analysis Endpoint
 * =============================
 * POST /api/v1/content/analyze-text
 *
 * Accepts raw text for analysis without requiring a post to exist.
 * Calls the Python AI service and returns structured results.
 * Optionally stores results in MongoDB if a postId is provided.
 */

const axios = require('axios');
const TextAnalysis = require('../../models/text-analysis.model');
const { ApiError } = require('../../middleware/error.middleware');

// -- Configuration ----------------------------------------------------------

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 120000; // 120s for cold-start model loading

// -- Validation -------------------------------------------------------------

/**
 * Validate the analyze-text request body.
 */
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

  if (!body.postId || typeof body.postId !== 'string' || body.postId.trim().length === 0) {
    errors.push('postId is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  return {
    text: body.text.trim(),
    postId: body.postId.trim(),
  };
}

// -- Controller -------------------------------------------------------------

/**
 * POST /api/v1/content/analyze-text
 *
 * Direct text analysis without requiring a post to exist first.
 * Input:  { text: string, postId: string }
 * Output: Structured analysis results
 */
exports.analyzeTextDirect = async (req, res, next) => {
  try {
    const { text, postId } = validateRequest(req.body);

    // Check if analysis already exists for this postId
    const existing = await TextAnalysis.findOne({ post: postId })
      .sort({ createdAt: -1 });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Analysis already exists for this post',
        analysis: formatAnalysisResult(existing),
        cached: true,
      });
    }

    // Call the Python AI service
    let aiResponse;
    try {
      aiResponse = await axios.post(
        `${AI_SERVICE_URL}/analyze/text`,
        { text, postId },
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
          'AI service request timed out. The models may be loading for the first time.'
        );
      }
      if (err.response && err.response.data) {
        const detail = err.response.data.detail || err.response.statusText;
        throw new ApiError(err.response.status || 500, `AI service error: ${detail}`);
      }
      throw new ApiError(500, `AI service request failed: ${err.message}`);
    }

    const ai = aiResponse.data;

    // Compute composite trust score
    const misinfoFactor = 1 - ai.misinformationProbability;
    const aiGenFactor = 1 - ai.aiGeneratedProbability * 0.5;
    const confidenceFactor = ai.confidence;
    const finalScore = Math.round(
      (misinfoFactor * 0.45 + aiGenFactor * 0.25 + confidenceFactor * 0.30) * 100
    );

    // Store results in MongoDB
    const saved = await TextAnalysis.create({
      post: postId,
      contentJob: null, // direct analysis, no content job
      inputText: text,
      preprocessing: ai.preprocessing,
      misinformationProbability: ai.misinformationProbability,
      aiGeneratedProbability: ai.aiGeneratedProbability,
      claims: (ai.claims || []).map((c) => ({
        text: c.text,
        subject: c.subject,
        predicate: c.predicate,
        object: c.object,
        misinformationProbability: c.misinformationProbability,
        confidence: c.confidence,
      })),
      entities: (ai.entities || []).map((e) => ({
        text: e.text,
        label: e.label,
        start: e.start,
        end: e.end,
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
 * GET /api/v1/content/analyze-text/:postId
 *
 * Retrieve stored analysis results for a given post.
 */
exports.getAnalysisByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    const analysis = await TextAnalysis.findOne({ post: postId })
      .sort({ createdAt: -1 });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'No analysis results found for this post',
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

/**
 * GET /api/v1/content/analyze-text/health
 *
 * Check if the Python AI service is reachable.
 */
exports.checkAIServiceHealth = async (req, res, next) => {
  try {
    let healthResponse;
    try {
      healthResponse = await axios.get(`${AI_SERVICE_URL}/health`, {
        timeout: 5000,
      });
    } catch (err) {
      return res.status(503).json({
        success: false,
        message: 'AI service is not reachable',
        aiServiceUrl: AI_SERVICE_URL,
        error: err.message,
      });
    }

    res.status(200).json({
      success: true,
      message: 'AI service is healthy',
      aiService: healthResponse.data,
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
    preprocessing: analysis.preprocessing,
    misinformationProbability: analysis.misinformationProbability,
    aiGeneratedProbability: analysis.aiGeneratedProbability,
    claims: analysis.claims,
    entities: analysis.entities,
    confidence: analysis.confidence,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}
