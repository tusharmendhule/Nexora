const express = require('express');
const router = express.Router();
const Moderation = require('../models/moderation.model');
const TrustScore = require('../models/trust-score.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/authorize.middleware');

// ==========================================
// 1. MODERATOR OVERRIDE / LOG DECISION
// ==========================================
// @route   POST /api/moderation/override
// @access  Private (Moderator / Admin)
router.post('/override', protect, requireRole('MODERATOR', 'ADMIN'), async (req, res) => {
  try {
    const { postId, newLabel, reason, action } = req.body;

    if (!postId || !newLabel || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Please provide postId, newLabel, and reason'
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Safely extract the logged-in user's ID from auth middleware
    const moderatorId = req.user?._id || req.user?.id;
    if (!moderatorId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Get current TrustScore record if it exists
    let trustScore = await TrustScore.findOne({ post: postId });
    const previousLabel = trustScore ? trustScore.label : 'None';

    // 1. Update or create the TrustScore with the moderator's override
    if (trustScore) {
      trustScore.label = newLabel;
      trustScore.isOverrideApplied = true;
      trustScore.explanation = `Moderator Override: ${reason}`;
      await trustScore.save();
    } else {
      trustScore = await TrustScore.create({
        post: postId,
        authenticityScore: 0.5,
        factualVerificationScore: 0.5,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.5,
        finalScore: 50,
        label: newLabel,
        explanation: `Moderator Override: ${reason}`,
        isOverrideApplied: true
      });
    }

    // 2. Log the action in the Moderation audit collection
    const moderationLog = await Moderation.create({
      post: postId,
      moderator: moderatorId,
      action: action || 'LABEL_OVERRIDE',
      previousLabel,
      updatedLabel: newLabel,
      reason
    });

    res.status(200).json({
      success: true,
      message: 'Moderation decision recorded successfully',
      moderationLog,
      trustScore
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. GET MODERATION HISTORY FOR A POST
// ==========================================
// @route   GET /api/moderation/history/:postId
// @access  Private
router.get('/history/:postId', protect, async (req, res) => {
  try {
    const logs = await Moderation.find({ post: req.params.postId })
      .populate('moderator', 'username name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;