/**
 * Video Analysis Service
 * ======================
 * Calls the Python AI video deepfake analysis service and persists
 * results to MongoDB via the VideoAnalysis model.
 *
 * The Python service is called asynchronously so the main
 * HTTP request is never blocked.
 */

const axios = require('axios');
const VideoAnalysis = require('../models/video-analysis.model');
const { describeAiServiceError } = require('../utils/ai-service-error');

// ─── Configuration ────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 300000; // 5 min — video processing is slow

// ─── Analysis ------------------------------------------------------

/**
 * Send video URL to the Python AI service and store results.
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function analyzeVideo(job) {
  const post = await require('../models/post.model').findById(job.post);
  if (!post) {
    return {
      status: 'FAILED',
      results: { message: 'Post not found for video analysis' },
      modelVersion: null,
    };
  }

  // Find the video media URL from the post
  const videoMedia = (post.media || []).find(
    (m) => (m.type || '').toLowerCase() === 'video'
  );
  const mediaUrl =
    videoMedia?.url || job.contentReference?.url || null;

  if (!mediaUrl) {
    return {
      status: 'COMPLETED',
      results: { message: 'No video URL found to analyze' },
      modelVersion: null,
    };
  }

  // ── Authenticity model (Python AI service) ─────────────────────────
  // Unavailable model ⇒ record the signal as unavailable (spec §31); do not
  // fail the post and do not invent probabilities. Claims are still extracted
  // from Video Intelligence / Speech-to-Text and fact-checked.
  let ai = null;
  let authenticityError = null;
  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/video`,
      { mediaUrl, postId: post._id.toString() },
      { timeout: AI_SERVICE_TIMEOUT }
    );
    ai = aiResponse.data;
  } catch (err) {
    authenticityError = describeAiServiceError(err, 'video');
    console.error(`[VideoAnalysis] ${authenticityError.message}`);
  }

  let results;
  let modelVersion = null;
  let manipulationProbability = 0;
  let authenticityScore = null;
  let modelConfidenceScore = null;
  let needsReview = true;

  if (ai) {
    // deepfakeProbability is the primary signal
    const deepfakeFactor = 1 - ai.deepfakeProbability;
    const manipulationFactor = 1 - ai.manipulationProbability;
    const confidenceFactor = ai.confidence;

    const finalScore = Math.round(
      (deepfakeFactor * 0.40 +
        manipulationFactor * 0.30 +
        confidenceFactor * 0.30) *
        100
    );

    results = {
      deepfakeProbability: ai.deepfakeProbability,
      manipulationProbability: ai.manipulationProbability,
      frameCount: ai.frameCount,
      analyzedFrames: ai.analyzedFrames,
      faceDetectionRate: ai.faceDetectionRate,
      temporalConsistency: ai.temporalConsistency,
      confidence: ai.confidence,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      authenticityUnavailable: false,
    };

    // Store analysis in MongoDB
    await VideoAnalysis.create({
      contentJob: job._id,
      post: job.post,
      mediaUrl,
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
      processingTimeMs: ai.processingTimeMs,
      errors: (ai.errors || []).map((e) => ({
        stage: e.stage,
        message: e.message,
      })),
    });

    modelVersion = ai.modelVersion;
    manipulationProbability = Math.max(
      ai.deepfakeProbability || 0,
      ai.manipulationProbability || 0
    );
    authenticityScore = 1 - manipulationProbability;
    modelConfidenceScore = ai.confidence;
    needsReview =
      ai.deepfakeProbability > 0.6 ||
      ai.manipulationProbability > 0.7 ||
      ai.confidence < 0.3;
  } else {
    results = {
      authenticityUnavailable: true,
      error: authenticityError,
      message:
        'Video authenticity model unavailable — no deepfake/manipulation ' +
        'probabilities were produced. Claim extraction and fact checking still run.',
    };
  }

  // Full media verification: Video Intelligence (frames/shots/OCR/labels/
  // transcript) + Speech-to-Text → claims → Google Fact Check → source
  // credibility → Trust Score (backend calculation).
  // NOTE: there is no dedicated AI-generation detector for video — deepfake /
  // manipulation probability is a separate authenticity signal and is NOT
  // reported as an AI-generated probability.
  let mediaVerification = null;
  try {
    const mediaVerificationService = require('./media-verification.service');
    mediaVerification = await mediaVerificationService.verifyAndScoreMedia({
      postId: job.post,
      contentType: 'VIDEO',
      mediaUrl,
      caption: post.text || null,
      authenticityScore,
      modelConfidenceScore,
      manipulationProbability,
      aiGeneratedProbability: null,
      aiDetectionModel: null,
      contentJobId: job._id,
      modelVersion: modelVersion || 'nexora-video-v1.0.0',
      authenticityUnavailable: !ai,
    });
  } catch (tsErr) {
    console.error('[VideoAnalysis] Media verification/TrustScore failed:', tsErr.message);
  }

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion,
    mediaVerification,
  };
}

/**
 * Get stored video analysis results for a post.
 */
async function getAnalysisForPost(postId) {
  return VideoAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored video analysis results for a content job.
 */
async function getAnalysisForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return VideoAnalysis.findOne({ contentJob: job._id }).sort({
    createdAt: -1,
  });
}

// ─── Trust Score helpers ───────────────────────────────────────────────
// NOTE: Trust labels are NOT derived from ad-hoc score thresholds here.
// They are computed by the trust-score service rule engine using the
// documented weighted formula. See trust-score.service.js.

module.exports = {
  analyzeVideo,
  getAnalysisForPost,
  getAnalysisForJob,
};
