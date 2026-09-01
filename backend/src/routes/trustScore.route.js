const express = require('express');
const router = express.Router();
const TrustScore = require('../models/trust-score.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');

// Helper function to calculate Trust Score based on Synopsis Formula
const calculateTrustScore = (A, F, S, K, isConfirmedFalse = false, isDisclosedAI = false, isSatire = false) => {
  // Formula: 100 * [0.35*A + 0.35*F + 0.20*S + 0.10*K]
  let finalScore = Math.round(100 * (0.35 * A + 0.35 * F + 0.20 * S + 0.10 * K));
  let label = 'Orange';
  let isOverrideApplied = false;
  let explanation = '';

  // Rule-based overrides
  if (isConfirmedFalse) {
    label = 'Red';
    isOverrideApplied = true;
    explanation = 'Flagged as Red due to confirmed false fact-check result.';
  } else if (isSatire) {
    label = 'Purple';
    isOverrideApplied = true;
    explanation = 'Tagged as Purple: Disclosed satire, opinion, or edited content.';
  } else if (finalScore >= 70) {
    if (isDisclosedAI) {
      label = 'Blue';
      explanation = 'Tagged as Blue: Disclosed AI-generated content that is factually supported.';
    } else {
      label = 'Green';
      explanation = 'Tagged as Green: High-trust content with strong verification signals.';
    }
  } else if (finalScore < 40) {
    label = 'Red';
    explanation = 'Tagged as Red due to low credibility signals and potential manipulation.';
  } else {
    label = 'Orange';
    explanation = 'Tagged as Orange: Content is partially verified or has uncertain signals.';
  }

  return { finalScore, label, explanation, isOverrideApplied };
};

// ==========================================
// 1. GENERATE / CALCULATE TRUST SCORE FOR A POST
// ==========================================
// @route   POST /api/trust-score/:postId
// @access  Private
router.post('/:postId', protect, async (req, res) => {
  try {
    const { postId } = req.params;
    const { authenticityScore, factualVerificationScore, sourceCredibilityScore, modelConfidenceScore, isConfirmedFalse, isDisclosedAI, isSatire } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const A = authenticityScore ?? 0.8;
    const F = factualVerificationScore ?? 0.8;
    const S = sourceCredibilityScore ?? 0.9;
    const K = modelConfidenceScore ?? 0.85;

    const calculation = calculateTrustScore(A, F, S, K, isConfirmedFalse, isDisclosedAI, isSatire);

    const trustScore = await TrustScore.findOneAndUpdate(
      { post: postId },
      {
        post: postId,
        authenticityScore: A,
        factualVerificationScore: F,
        sourceCredibilityScore: S,
        modelConfidenceScore: K,
        ...calculation
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      trustScore
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
    const trustScore = await TrustScore.findOne({ post: req.params.postId }).populate('post', 'caption mediaUrl user');

    if (!trustScore) {
      return res.status(404).json({ success: false, message: 'Trust Score not found for this post' });
    }

    res.status(200).json({
      success: true,
      trustScore
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;