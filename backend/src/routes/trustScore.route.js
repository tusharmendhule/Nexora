const express = require('express');
const router = express.Router();
const TrustScore = require('../models/trust-score.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');
const { getFactCheckResultsByPost } = require('../services/fact-check.service');
const trustScoreService = require('../services/trust-score.service');

// ==========================================
// 1. GENERATE / CALCULATE TRUST SCORE FOR A POST
// ==========================================
// @route   POST /api/trust-score/:postId
// @access  Private
router.post('/:postId', protect, async (req, res) => {
  try {
    const { postId } = req.params;
    const {
      authenticityScore,
      factualVerificationScore: explicitF,
      sourceCredibilityScore,
      modelConfidenceScore,
      isConfirmedFalse: explicitConfirmedFalse,
      isDisclosedAI,
      isSatire,
      contentType,
      manipulationProbability,
    } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Attempt to pull fact-check evidence from Module 13 if not explicitly provided
    let factCheckEvidence = null;

    try {
      factCheckEvidence = await getFactCheckResultsByPost(postId);
    } catch {
      // Fact-check lookup failed — fall back to defaults
    }

    const A = authenticityScore ?? 0.8;
    const F = explicitF ?? factCheckEvidence?.factualVerificationScore ?? 0.8;
    const S = sourceCredibilityScore ?? 0.9;
    const K = modelConfidenceScore ?? 0.85;
    const confirmedFalse = explicitConfirmedFalse ?? factCheckEvidence?.confirmedFalse ?? false;

    // Determine content type for rule evaluation
    const resolvedContentType = contentType || (isSatire ? 'satire' : post.contentType || '');

    const result = trustScoreService.computeTrustScore({
      authenticityScore: A,
      factualVerificationScore: F,
      sourceCredibilityScore: S,
      modelConfidenceScore: K,
      isConfirmedFalse: confirmedFalse,
      isDisclosedAI: !!isDisclosedAI,
      contentType: resolvedContentType,
      manipulationProbability: manipulationProbability || 0,
      evidence: [],
    });

    const explanation = result.reasoning.join('\n');

    const trustScore = await TrustScore.findOneAndUpdate(
      { post: postId },
      {
        post: postId,
        score: result.trustScore,
        authenticity: result.componentScores.authenticity,
        factualVerification: result.componentScores.factualVerification,
        sourceCredibility: result.componentScores.sourceCredibility,
        modelConfidence: result.componentScores.modelConfidence,
        label: result.label,
        explanation,
        modelVersion: result.modelVersion,
        ruleVersion: result.ruleVersion,
        isOverrideApplied: result.isOverrideApplied,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      trustScore,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. GET TRUST SCORE FOR A SPECIFIC POST
// ==========================================
// @route   GET /api/trust-score/:postId
// @access  Private
router.get('/:postId', protect, async (req, res) => {
  try {
    const trustScore = await TrustScore.findOne({ post: req.params.postId })
      .populate('post', 'caption mediaUrl user')
      .populate('evidenceRefs');

    if (!trustScore) {
      return res.status(404).json({ success: false, message: 'Trust Score not found for this post' });
    }

    res.status(200).json({
      success: true,
      trustScore,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;