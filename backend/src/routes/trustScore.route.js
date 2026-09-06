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
      // Fact-check lookup failed — treated as no evidence, never as "true"
    }

    // No fabricated scores: every component must come from a real analysis
    // result (client-supplied AI output, or stored fact-check evidence).
    // Absent evidence stays neutral (0.5) — it is never upgraded to a
    // positive or negative value.
    const A = authenticityScore ?? null;
    const F = explicitF ?? factCheckEvidence?.factualVerificationScore ?? null;
    const S = sourceCredibilityScore ?? null;
    const K = modelConfidenceScore ?? null;

    const missing = [];
    if (A === null) missing.push('authenticityScore');
    if (F === null) missing.push('factualVerificationScore');
    if (S === null) missing.push('sourceCredibilityScore');
    if (K === null) missing.push('modelConfidenceScore');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Cannot compute a trust score without real analysis inputs. ' +
          `Missing: ${missing.join(', ')}. ` +
          'Run the analysis pipeline (POST /api/v1/content/analyze/:postId) ' +
          'or provide the component scores from actual AI/fact-check output.',
      });
    }

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
      trustScore: {
        ...trustScore.toObject(),
        // Ensure new fields are included
        providerUsed: trustScore.providerUsed || 'NONE',
        analyzedAt: trustScore.analyzedAt || null,
        factCheckData: trustScore.factCheckData || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
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
      trustScore: {
        ...trustScore.toObject(),
        // Ensure new fields are included in response
        providerUsed: trustScore.providerUsed || 'NONE',
        analyzedAt: trustScore.analyzedAt || null,
        factCheckData: trustScore.factCheckData || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;