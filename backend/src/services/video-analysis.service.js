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
const TrustScore = require('../models/trust-score.model');

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

  // Call the Python AI service
  let aiResponse;
  try {
    aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/video`,
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
        'AI video service request timed out. Video processing may be too slow.'
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

  // Build composite trust score for video content
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

  const results = {
    deepfakeProbability: ai.deepfakeProbability,
    manipulationProbability: ai.manipulationProbability,
    frameCount: ai.frameCount,
    analyzedFrames: ai.analyzedFrames,
    faceDetectionRate: ai.faceDetectionRate,
    temporalConsistency: ai.temporalConsistency,
    confidence: ai.confidence,
    finalScore: Math.max(0, Math.min(100, finalScore)),
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

  // Create TrustScore document
  try {
    // Map deepfake/manipulation to trust score components
    const authenticityScore = 1 - Math.max(
      ai.deepfakeProbability,
      ai.manipulationProbability
    );
    const factualScore = 0.5; // video alone can't verify factual claims
    const sourceScore = 0.5; // unknown source without additional context
    const confidenceScore = ai.confidence;

    const tsLabel = getTrustLabel(finalScore);
    const tsExplanation = generateExplanation(
      ai.deepfakeProbability,
      ai.manipulationProbability,
      ai.faceDetectionRate,
      ai.temporalConsistency
    );

    await TrustScore.findOneAndUpdate(
      { post: job.post },
      {
        post: job.post,
        authenticityScore: Math.max(0, Math.min(1, authenticityScore)),
        factualVerificationScore: factualScore,
        sourceCredibilityScore: sourceScore,
        modelConfidenceScore: confidenceScore,
        finalScore: Math.max(0, Math.min(100, finalScore)),
        label: tsLabel,
        explanation: tsExplanation,
        isOverrideApplied: false,
        modelAndRuleVersion: ai.modelVersion || 'nexora-video-v1.0.0',
      },
      { upsert: true, new: true }
    );
  } catch (tsErr) {
    console.error('[VideoAnalysis] Failed to create TrustScore:', tsErr.message);
  }

  // Determine if review is required
  const needsReview =
    ai.deepfakeProbability > 0.6 ||
    ai.manipulationProbability > 0.7 ||
    ai.confidence < 0.3;

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion: ai.modelVersion,
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

module.exports = {
  analyzeVideo,
  getAnalysisForPost,
  getAnalysisForJob,
};
