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

  // Call the Python AI service
  let aiResponse;
  try {
    aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/image`,
      { mediaUrl, postId: post._id.toString() },
      { timeout: AI_SERVICE_TIMEOUT }
    );
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error(
        'AI service is not available. Start the Python service on ' +
          AI_SERVICE_URL
      );
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new Error(
        'AI image service request timed out. Image processing may be too slow.'
      );
    }
    if (err.response && err.response.data) {
      throw new Error(
        `AI service error: ${err.response.data.detail || err.response.statusText}`
      );
    }
    throw new Error(`AI service request failed: ${err.message}`);
  }

  const ai = aiResponse.data;

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

  const results = {
    manipulationProbability: ai.manipulationProbability,
    faceManipulationProbability: ai.faceManipulationProbability,
    frequencyAnomaly: ai.frequencyAnomaly,
    colorAnomaly: ai.colorAnomaly,
    textureAnomaly: ai.textureAnomaly,
    faceDetectionCount: ai.faceDetectionCount,
    hasFace: ai.hasFace,
    confidence: ai.confidence,
    finalScore: Math.max(0, Math.min(100, finalScore)),
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
    confidence: ai.confidence,
    modelVersion: ai.modelVersion,
    processingTimeMs: ai.processingTimeMs,
    finalScore: Math.max(0, Math.min(100, finalScore)),
    errors: (ai.errors || []).map((e) => ({
      stage: e.stage,
      message: e.message,
    })),
  });

  // Create TrustScore through the rule engine (documented Nexora formula).
  // Media alone cannot verify factual claims, so factualVerification and
  // sourceCredibility stay neutral (0.5) — never assumed true or false.
  try {
    const trustScoreService = require('./trust-score.service');
    await trustScoreService.computeAndStoreTrustScore(
      job.post,
      {
        authenticityScore: 1 - ai.manipulationProbability,
        factualVerificationScore: 0.5, // no factual claims verified for images
        sourceCredibilityScore: 0.5,   // no source evidence for images
        modelConfidenceScore: ai.confidence,
        contentType: 'image',
        manipulationProbability: Math.max(
          ai.manipulationProbability || 0,
          ai.faceManipulationProbability || 0
        ),
        modelVersion: ai.modelVersion || 'nexora-image-v1.0.0',
      }
    );
  } catch (tsErr) {
    console.error('[ImageAnalysis] Failed to create TrustScore:', tsErr.message);
  }

  // Determine if review is required
  const needsReview =
    ai.manipulationProbability > 0.6 ||
    ai.faceManipulationProbability > 0.7 ||
    ai.confidence < 0.3;

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion: ai.modelVersion,
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
