/**
 * Image Analysis Service
 * ======================
 * Calls the Python AI image authenticity analysis service and persists
 * results to MongoDB via the ImageAnalysis model.
 *
 * The Python service is called asynchronously so the main
 * HTTP request is never blocked.
 */

const axios = require('axios');
const ImageAnalysis = require('../models/image-analysis.model');
const { describeAiServiceError } = require('../utils/ai-service-error');

// ─── Configuration ────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 120000; // 2 min — image processing

// ─── Analysis ------------------------------------------------------

/**
 * Send image URL to the Python AI service and store results.
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function analyzeImage(job) {
  const post = await require('../models/post.model').findById(job.post);
  if (!post) {
    return {
      status: 'FAILED',
      results: { message: 'Post not found for image analysis' },
      modelVersion: null,
    };
  }

  // Find the image media URL from the post
  const imageMedia = (post.media || []).find(
    (m) => (m.type || '').toLowerCase() === 'image'
  );
  const mediaUrl =
    imageMedia?.url || job.contentReference?.url || null;

  if (!mediaUrl) {
    return {
      status: 'COMPLETED',
      results: { message: 'No image URL found to analyze' },
      modelVersion: null,
    };
  }

  // ── Authenticity model (Python AI service) ─────────────────────────
  // If the model service is unavailable we do NOT fail the post and we do
  // NOT invent probabilities: the authenticity signal is recorded as
  // unavailable (spec §31) and the real claim / fact-check path still runs.
  let ai = null;
  let authenticityError = null;
  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/image`,
      { mediaUrl, postId: post._id.toString() },
      { timeout: AI_SERVICE_TIMEOUT }
    );
    ai = aiResponse.data;
  } catch (err) {
    authenticityError = describeAiServiceError(err, 'image');
    console.error(`[ImageAnalysis] ${authenticityError.message}`);
  }

  let results;
  let modelVersion = null;
  let authenticityScore = null;
  let modelConfidenceScore = null;
  let manipulationProbability = 0;
  let aiGeneratedProbability = null;
  let aiDetectionModel = null;
  let needsReview = true;

  if (ai) {
    // Build composite trust score for image content
    const manipulationFactor = 1 - ai.manipulationProbability;
    const faceManipFactor = 1 - ai.faceManipulationProbability;
    const confidenceFactor = ai.confidence;

    const finalScore = Math.round(
      (manipulationFactor * 0.40 +
        faceManipFactor * 0.25 +
        confidenceFactor * 0.35) *
        100
    );

    results = {
      manipulationProbability: ai.manipulationProbability,
      faceManipulationProbability: ai.faceManipulationProbability,
      frequencyAnomaly: ai.frequencyAnomaly,
      colorAnomaly: ai.colorAnomaly,
      textureAnomaly: ai.textureAnomaly,
      faceDetectionCount: ai.faceDetectionCount,
      hasFace: ai.hasFace,
      confidence: ai.confidence,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      // Real AI-image detector output (null when no detector is configured).
      aiGeneratedProbability:
        typeof ai.aiGeneratedProbability === 'number' ? ai.aiGeneratedProbability : null,
      aiDetectionModel: ai.aiDetectionModel || null,
      authenticityUnavailable: false,
    };

    // Store analysis in MongoDB
    await ImageAnalysis.create({
      contentJob: job._id,
      post: job.post,
      mediaUrl,
      preprocessing: ai.preprocessing || {},
      manipulationProbability: ai.manipulationProbability,
      faceManipulationProbability: ai.faceManipulationProbability,
      frequencyAnomaly: ai.frequencyAnomaly,
      colorAnomaly: ai.colorAnomaly,
      textureAnomaly: ai.textureAnomaly,
      faceDetectionCount: ai.faceDetectionCount,
      hasFace: ai.hasFace,
      aiGeneratedProbability: results.aiGeneratedProbability,
      aiDetectionModel: results.aiDetectionModel,
      confidence: ai.confidence,
      modelVersion: ai.modelVersion,
      processingTimeMs: ai.processingTimeMs,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      errors: (ai.errors || []).map((e) => ({
        stage: e.stage,
        message: e.message,
      })),
    });

    modelVersion = ai.modelVersion;
    authenticityScore = 1 - ai.manipulationProbability;
    modelConfidenceScore = ai.confidence;
    manipulationProbability = Math.max(
      ai.manipulationProbability || 0,
      ai.faceManipulationProbability || 0
    );
    aiGeneratedProbability = results.aiGeneratedProbability;
    aiDetectionModel = results.aiDetectionModel;
    needsReview =
      ai.manipulationProbability > 0.6 ||
      ai.faceManipulationProbability > 0.7 ||
      ai.confidence < 0.3;
  } else {
    results = {
      authenticityUnavailable: true,
      error: authenticityError,
      message:
        'Image authenticity model unavailable — no manipulation probabilities ' +
        'were produced. Claim extraction and fact checking still run.',
    };
  }

  // Full media verification: OCR + claims → Google Fact Check → source
  // credibility → Trust Score (backend calculation). AI-generated detection
  // stays separate from factuality (spec §8/§9/§22).
  let mediaVerification = null;
  try {
    const mediaVerificationService = require('./media-verification.service');
    mediaVerification = await mediaVerificationService.verifyAndScoreMedia({
      postId: job.post,
      contentType: 'IMAGE',
      mediaUrl,
      caption: post.text || null,
      authenticityScore,
      modelConfidenceScore,
      manipulationProbability,
      aiGeneratedProbability,
      aiDetectionModel,
      contentJobId: job._id,
      modelVersion: modelVersion || 'nexora-image-v1.0.0',
      authenticityUnavailable: !ai,
      // The verification pipeline's TRUST_SCORE stage is the single writer of
      // the post's score; this analysis only supplies signals to it.
      persistTrustScore: false,
    });
  } catch (tsErr) {
    console.error('[ImageAnalysis] Media verification/TrustScore failed:', tsErr.message);
  }

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion,
    mediaVerification,
  };
}

/**
 * Get stored image analysis results for a post.
 */
async function getAnalysisForPost(postId) {
  return ImageAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored image analysis results for a content job.
 */
async function getAnalysisForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return ImageAnalysis.findOne({ contentJob: job._id }).sort({
    createdAt: -1,
  });
}

// ─── Trust Score helpers ───────────────────────────────────────────
// NOTE: Trust labels are NOT derived from ad-hoc score thresholds here.
// They are computed by the trust-score service rule engine using the
// documented weighted formula. See trust-score.service.js.

module.exports = {
  analyzeImage,
  getAnalysisForPost,
  getAnalysisForJob,
};
