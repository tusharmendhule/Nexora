const express = require('express');
const router = express.Router();
const Hashtag = require('../models/hashtag.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. GET TRENDING HASHTAGS
// ==========================================
// @route   GET /api/hashtags/trending
// @access  Private
router.get('/trending', protect, async (req, res) => {
  try {
    const trending = await Hashtag.find()
      .sort({ count: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      count: trending.length,
      hashtags: trending
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. SEARCH HASHTAGS BY QUERY
// ==========================================
// @route   GET /api/hashtags/search?q=query
// @access  Private
router.get('/search', protect, async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const hashtags = await Hashtag.find({
      name: { $regex: query.toLowerCase(), $options: 'i' }
    })
      .sort({ count: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      count: hashtags.length,
      hashtags
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. GET ALL POSTS FOR A SPECIFIC HASHTAG
// ==========================================
// @route   GET /api/hashtags/:tag/posts
// @access  Private
router.get('/:tag/posts', protect, async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase().replace('#', '');

    const posts = await Post.find({ hashtags: tag })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      tag,
      count: posts.length,
      posts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;