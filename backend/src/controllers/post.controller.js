const axios = require('axios');
const Post = require('../models/post.model');
const TrustScore = require('../models/trust-score.model');

// @desc    Create a new post & run AI Trust Score evaluation
// @route   POST /api/posts
// @access  Private
const createPost = async (req, res) => {
  try {
    // Extract input (supports both text/caption and media/mediaUrl)
    const content = req.body.text || req.body.caption || '';
    const media = req.body.mediaUrl 
      ? [req.body.mediaUrl] 
      : (Array.isArray(req.body.media) ? req.body.media : []);
    const postType = req.body.postType || 'standard';
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID not found in token'
      });
    }

    if (!content.trim() && media.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Post text/caption or mediaUrl is required'
      });
    }

    // 1. Save post document to MongoDB
    const post = await Post.create({
      user: userId,
      text: content.trim(),
      media: media,
      postType: postType
    });

    // 2. Call Python FastAPI AI Engine (if text is present)
    let trustScoreData = null;

    if (content.trim().length > 0) {
      try {
        const aiResponse = await axios.post(
          process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/analyze-trust',
          {
            text: content.trim(),
            userId: userId.toString(),
            accountAgeDays: 30
          },
          { timeout: 5000 }
        );

        const ai = aiResponse.data;

        // 3. Save computed Trust Score to MongoDB
        trustScoreData = await TrustScore.create({
          post: post._id,
          factualVerificationScore: ai.factualVerificationScore,
          authenticityScore: ai.authenticityScore,
          sourceCredibilityScore: ai.sourceCredibilityScore,
          modelConfidenceScore: ai.modelConfidenceScore,
          finalScore: ai.finalScore,
          label: ai.label,
          explanation: ai.explanation
        });
      } catch (aiError) {
        console.error('AI Service Communication Error:', aiError.message);
      }
    }

    // 4. Return populated post and trust score data
    const populatedPost = await Post.findById(post._id)
      .populate('user', 'name username avatar isVerified reputationBadge');

    return res.status(201).json({
      success: true,
      message: 'Post created and verified successfully',
      post: populatedPost,
      trustScore: trustScoreData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all feed posts with populated trust scores & user details
// @route   GET /api/posts
// @access  Private/Public
const getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'name username avatar isVerified reputationBadge')
      .sort({ createdAt: -1 });

    // Fetch trust score records for retrieved posts
    const postIds = posts.map((p) => p._id);
    const trustScores = await TrustScore.find({ post: { $in: postIds } });

    // Map trust scores by post ID
    const trustScoreMap = {};
    trustScores.forEach((ts) => {
      trustScoreMap[ts.post.toString()] = ts;
    });

    const feed = posts.map((p) => ({
      ...p.toObject(),
      trustScore: trustScoreMap[p._id.toString()] || null
    }));

    return res.status(200).json({
      success: true,
      count: feed.length,
      posts: feed
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single post by ID with trust score
// @route   GET /api/posts/:id
// @access  Public
const getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'name username avatar isVerified reputationBadge');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const trustScore = await TrustScore.findOne({ post: post._id });

    return res.status(200).json({
      success: true,
      post: {
        ...post.toObject(),
        trustScore: trustScore || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete a post and its associated trust score
// @route   DELETE /api/posts/:id
// @access  Private
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Verify ownership
    if (post.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }

    await Post.findByIdAndDelete(req.params.id);
    await TrustScore.findOneAndDelete({ post: req.params.id });

    return res.status(200).json({
      success: true,
      message: 'Post and associated trust score removed successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  deletePost
};