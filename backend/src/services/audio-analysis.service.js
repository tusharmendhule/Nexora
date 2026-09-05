/**
 * Audio Analysis Service
 * ======================
 * Calls the Python AI audio authenticity analysis service and persists
 * results to MongoDB via the AudioAnalysis model.
 *
 * The Python service is called asynchronously so the main
 * HTTP request is never blocked.
 */

const axios = require('axios');
const AudioAnalysis = require('../models/audio-analysis.model');

// ─── Configuration ────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 180000; // 3 min — audio processing

// ─── Analysis ------------------------------------------------------

/**
 * Send audio URL to the Python AI service and store results.
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function analyzeAudio(job) {
  const post = await require('../models/post.model').findById(job.post);
  if (!post) {
    return {
      status: 'FAILED',
      results: { message: 'Post not found for audio analysis' },
      modelVersion: null,
    };
  }

  // Find the audio media URL from the post
  const audioMedia = (post.media || []).find(
    (m) => (m.type || '').toLowerCase() === 'audio'
  );
  const mediaUrl =
    audioMedia?.url || job.contentReference?.url || null;

  if (!mediaUrl) {
    return {
      status: 'COMPLETED',
      results: { message: 'No audio URL found to analyze' },
      modelVersion: null,
    };
  }

  // Call the Python AI service
  let aiResponse;
  try {
    aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/audio`,
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
        'AI audio service request timed out. Audio processing may be too slow.'
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

  // Build composite trust score for audio content
  const syntheticFactor = 1 - ai.syntheticSpeechProbability;
  const manipulationFactor = 1 - ai.manipulationProbability;
  const confidenceFactor = ai.confidence;

  const finalScore = Math.round(
    (syntheticFactor * 0.35 +
      manipulationFactor * 0.35 +
      confidenceFactor * 0.30) *
      100
  );

  const results = {
    syntheticSpeechProbability: ai.syntheticSpeechProbability,
    manipulationProbability: ai.manipulationProbability,
    confidence: ai.confidence,
    finalScore: Math.max(0, Math.min(100, finalScore)),
  };

  // Store analysis in MongoDB
  await AudioAnalysis.create({
    contentJob: job._id,
    post: job.post,
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

  // Create TrustScore through the rule engine (documented Nexora formula).
  // Audio alone cannot verify factual claims, so factualVerification and
  // sourceCredibility stay neutral (0.5) — never assumed true or false.
  try {
    const trustScoreService = require('./trust-score.service');
    await trustScoreService.computeAndStoreTrustScore(
      job.post,
      {
        authenticityScore: 1 - Math.max(
          ai.syntheticSpeechProbability || 0,
          ai.manipulationProbability || 0
        ),
        factualVerificationScore: 0.5, // no factual claims verified for audio
        sourceCredibilityScore: 0.5,   // no source evidence for audio
        modelConfidenceScore: ai.confidence,
        contentType: 'audio',
        manipulationProbability: Math.max(
          ai.syntheticSpeechProbability || 0,
          ai.manipulationProbability || 0
        ),
        modelVersion: ai.modelVersion || 'nexora-audio-v1.0.0',
      }
    );
  } catch (tsErr) {
    console.error('[AudioAnalysis] Failed to create TrustScore:', tsErr.message);
  }

  // Determine if review is required
  const needsReview =
    ai.syntheticSpeechProbability > 0.6 ||
    ai.manipulationProbability > 0.7 ||
    ai.confidence < 0.3;

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion: ai.modelVersion,
  };
}

/**
 * Get stored audio analysis results for a post.
 */
async function getAnalysisForPost(postId) {
  return AudioAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored audio analysis results for a content job.
 */
async function getAnalysisForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return AudioAnalysis.findOne({ contentJob: job._id }).sort({
    createdAt: -1,
  });
}

// ─── Trust Score helpers ───────────────────────────────────────────────
// NOTE: Trust labels are NOT derived from ad-hoc score thresholds here.
// They are computed by the trust-score service rule engine using the
// documented weighted formula. See trust-score.service.js.

module.exports = {
  analyzeAudio,
  getAnalysisForPost,
  getAnalysisForJob,
};
