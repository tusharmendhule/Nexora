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
const TrustScore = require('../models/trust-score.model');

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

  // Create TrustScore document
  try {
    const authenticityScore = 1 - Math.max(
      ai.syntheticSpeechProbability,
      ai.manipulationProbability
    );
    const factualScore = 0.5; // audio alone can't verify factual claims
    const sourceScore = 0.5; // unknown source without additional context
    const confidenceScore = ai.confidence;

    const tsLabel = getTrustLabel(finalScore);
    const tsExplanation = generateExplanation(
      ai.syntheticSpeechProbability,
      ai.manipulationProbability,
      ai.segments
    );

    await TrustScore.findOneAndUpdate(
      { post: job.post },
      {
        post: job.post,
        authenticity: Math.max(0, Math.min(1, authenticityScore)),
        factualVerification: factualScore,
        sourceCredibility: sourceScore,
        modelConfidence: confidenceScore,
        score: Math.max(0, Math.min(100, finalScore)),
        label: tsLabel,
        explanation: tsExplanation,
        isOverrideApplied: false,
        modelVersion: ai.modelVersion || 'nexora-audio-v1.0.0',
      },
      { upsert: true, new: true }
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

/**
 * Map a final score (0-100) to a 5-tier trust label.
 */
function getTrustLabel(score) {
  if (score >= 80) return 'Green';
  if (score >= 60) return 'Blue';
  if (score >= 40) return 'Purple';
  if (score >= 20) return 'Orange';
  return 'Red';
}

/**
 * Generate a human-readable explanation for the trust score.
 */
function generateExplanation(synthetic, manipulation, segments) {
  const parts = [];

  if (synthetic > 0.6) {
    parts.push(
      `High synthetic speech probability detected (${(synthetic * 100).toFixed(1)}%). `
    );
  } else if (synthetic > 0.3) {
    parts.push(
      `Moderate synthetic speech indicators found (${(synthetic * 100).toFixed(1)}%). `
    );
  } else {
    parts.push(
      `Low synthetic speech probability (${(synthetic * 100).toFixed(1)}%). `
    );
  }

  if (manipulation > 0.5) {
    parts.push(
      `Significant audio manipulation detected (${(manipulation * 100).toFixed(1)}%). `
    );
  } else if (manipulation > 0.3) {
    parts.push(
      `Moderate manipulation indicators (${(manipulation * 100).toFixed(1)}%). `
    );
  }

  if (segments && segments.length > 0) {
    const highSegments = segments.filter(
      (s) => s.syntheticScore > 0.5 || s.manipulationScore > 0.5
    );
    if (highSegments.length > 0) {
      parts.push(
        `${highSegments.length} of ${segments.length} segments showed anomalies. `
      );
    }
  }

  if (parts.length === 0) {
    parts.push('Audio analysis completed with limited indicators.');
  }

  return parts.join('').trim();
}

module.exports = {
  analyzeAudio,
  getAnalysisForPost,
  getAnalysisForJob,
};
