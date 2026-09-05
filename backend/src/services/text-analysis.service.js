/**
 * Text Analysis Service
 * =====================
 * Calls the Python AI text analysis service and persists
 * results to MongoDB via the TextAnalysis model.
 *
 * The Python service is called asynchronously so the main
 * HTTP request is never blocked.
 */

const axios = require('axios');
const TextAnalysis = require('../models/text-analysis.model');

// ─── Configuration ────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_SERVICE_TIMEOUT = 60000; // 60s — models can be slow on first load

// ─── Analysis ------------------------------------------------------

/**
 * Send text to the Python AI service and store results.
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function analyzeText(job) {
  const post = await require('../models/post.model').findById(job.post);
  if (!post || !post.text) {
    return {
      status: 'COMPLETED',
      results: { message: 'No text content to analyze' },
      modelVersion: null,
    };
  }

  const text = post.text.trim();

  // Empty or very short text — skip heavy analysis
  if (text.length < 5) {
    const results = {
      preprocessing: {
        characterCount: text.length,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        sentenceCount: 0,
        language: 'unknown',
        languageConfidence: 0,
        cleanedText: text,
      },
      misinformationProbability: 0,
      aiGeneratedProbability: 0,
      claims: [],
      entities: [],
      confidence: 0.2,
      // No fabricated score: text is too short for meaningful analysis,
      // so there is no finalScore — the trust-score engine decides.
      finalScore: null,
      insufficientEvidence: true,
    };

    const saved = await TextAnalysis.create({
      contentJob: job._id,
      post: job.post,
      inputText: text,
      preprocessing: results.preprocessing,
      misinformationProbability: 0,
      aiGeneratedProbability: 0,
      claims: [],
      entities: [],
      confidence: 0.2,
      modelVersion: 'nexora-text-v1.2.0',
      processingTimeMs: 0,
    });

    return { status: 'COMPLETED', results, modelVersion: 'nexora-text-v1.2.0' };
  }

  // Call the Python AI service
  let aiResponse;
  try {
    aiResponse = await axios.post(
      `${AI_SERVICE_URL}/analyze/text`,
      { text, postId: post._id.toString() },
      { timeout: AI_SERVICE_TIMEOUT }
    );
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error(
        'AI service is not available. Start the Python service on ' + AI_SERVICE_URL
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

  // Build the composite trust score
  // Formula: weighted combination of misinfo, AI-gen, and confidence
  const misinfoFactor = 1 - ai.misinformationProbability; // higher misinfo = lower score
  const aiGenFactor = 1 - ai.aiGeneratedProbability * 0.5; // AI text is less trusted but not malicious
  const confidenceFactor = ai.confidence;

  const finalScore = Math.round(
    (misinfoFactor * 0.45 + aiGenFactor * 0.25 + confidenceFactor * 0.30) * 100
  );

  const results = {
    preprocessing: ai.preprocessing,
    misinformationProbability: ai.misinformationProbability,
    aiGeneratedProbability: ai.aiGeneratedProbability,
    claims: ai.claims,
    entities: ai.entities,
    confidence: ai.confidence,
    finalScore: Math.max(0, Math.min(100, finalScore)),
  };

  // Store analysis in MongoDB
  await TextAnalysis.create({
    contentJob: job._id,
    post: job.post,
    inputText: text,
    preprocessing: ai.preprocessing,
    misinformationProbability: ai.misinformationProbability,
    aiGeneratedProbability: ai.aiGeneratedProbability,
    claims: (ai.claims || []).map((c) => ({
      text: c.text,
      subject: c.subject,
      predicate: c.predicate,
      object: c.object,
      claimType: c.claimType || null,
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

  // Module 12: Trigger dedicated claim/entity extraction in background
  // This stores claims with deduplication and fact-check integration
  try {
    const claimEntityService = require('./claim-entity-extraction.service');
    setImmediate(() => {
      claimEntityService.extractClaimsAndEntities(
        text,
        job.post.toString(),
        job._id
      ).catch((err) => {
        console.error(`[TextAnalysis] Background claim extraction failed:`, err.message);
      });
    });
  } catch {
    // Claim extraction is a secondary pipeline — don't fail text analysis
  }

  // Determine if review is required (high misinfo or very low confidence)
  const needsReview =
    ai.misinformationProbability > 0.7 || ai.confidence < 0.3;

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results,
    modelVersion: ai.modelVersion,
  };
}

/**
 * Get stored analysis results for a post.
 */
async function getAnalysisForPost(postId) {
  return TextAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get stored analysis results for a content job.
 */
async function getAnalysisForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return TextAnalysis.findOne({ contentJob: job._id }).sort({ createdAt: -1 });
}

module.exports = {
  analyzeText,
  getAnalysisForPost,
  getAnalysisForJob,
};
