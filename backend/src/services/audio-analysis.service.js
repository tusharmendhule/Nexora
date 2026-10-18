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
const { describeAiServiceError } = require('../utils/ai-service-error');

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

  // ── Authenticity model (Python AI service) ─────────────────────────
  // Unavailable model ⇒ record the signal as unavailable (spec §31); do not
  // fail the post and do not invent probabilities. The transcript + fact-check
  // path still runs so real claims are still produced.
  let ai = null;
  let authenticityError = null;
  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/audio`,
      { mediaUrl, postId: post._id.toString() },
      { timeout: AI_SERVICE_TIMEOUT }
    );
    ai = aiResponse.data;
  } catch (err) {
    authenticityError = describeAiServiceError(err, 'audio');
    console.error(`[AudioAnalysis] ${authenticityError.message}`);
  }

  let results;
  let modelVersion = null;
  let manipulationProbability = 0;
  let authenticityScore = null;
  let modelConfidenceScore = null;
  let aiGeneratedProbability = null;
  let aiDetectionModel = null;
  let needsReview = true;

  if (ai) {
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

    results = {
      syntheticSpeechProbability: ai.syntheticSpeechProbability,
      manipulationProbability: ai.manipulationProbability,
      confidence: ai.confidence,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      authenticityUnavailable: false,
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

    modelVersion = ai.modelVersion;
    manipulationProbability = Math.max(
      ai.syntheticSpeechProbability || 0,
      ai.manipulationProbability || 0
    );
    authenticityScore = 1 - manipulationProbability;
    modelConfidenceScore = ai.confidence;
    aiGeneratedProbability =
      typeof ai.syntheticSpeechProbability === 'number'
        ? ai.syntheticSpeechProbability
        : null;
    aiDetectionModel = ai.modelVersion || null;
    needsReview =
      ai.syntheticSpeechProbability > 0.6 ||
      ai.manipulationProbability > 0.7 ||
      ai.confidence < 0.3;
  } else {
    results = {
      authenticityUnavailable: true,
      error: authenticityError,
      message:
        'Audio authenticity model unavailable — no synthetic-speech ' +
        'probabilities were produced. Transcription and fact checking still run.',
    };
  }

  // Full media verification: Speech-to-Text transcript → claims → Google Fact
  // Check → source credibility → Trust Score (backend calculation).
  // NOTE: the synthetic-speech probability is a genuine AI-generated-audio
  // detector signal, kept separate from the transcript / factuality.
  let mediaVerification = null;
  try {
    const mediaVerificationService = require('./media-verification.service');
    mediaVerification = await mediaVerificationService.verifyAndScoreMedia({
      postId: job.post,
      contentType: 'AUDIO',
      mediaUrl,
      caption: post.text || null,
      authenticityScore,
      modelConfidenceScore,
      manipulationProbability,
      aiGeneratedProbability,
      aiDetectionModel,
      contentJobId: job._id,
      modelVersion: modelVersion || 'nexora-audio-v1.0.0',
      authenticityUnavailable: !ai,
      // The verification pipeline's TRUST_SCORE stage is the single writer of
      // the post's score; this analysis only supplies signals to it.
      persistTrustScore: false,
    });
  } catch (tsErr) {
    console.error('[AudioAnalysis] Media verification/TrustScore failed:', tsErr.message);
  }

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion,
    mediaVerification,
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
