const express = require('express');
const router = express.Router();
const axios = require('axios');

// Models
const Post = require('../models/post.model');
const SavedPost = require('../models/saved-post.model');
const Activity = require('../models/activity.model');
const Hashtag = require('../models/hashtag.model');

// Middleware
const { protect } = require('../middleware/auth.middleware');

// Helper function to extract hashtags
const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.map((tag) => tag.substring(1).toLowerCase()) : [];
};

// ==========================================
// 1. GET ALL FEED POSTS
// ==========================================
// @route   GET /api/posts
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'name avatar')
      .populate('comments.user', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: posts.length,
      posts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. CREATE A NEW POST (WITH FASTAPI AI TRUST ENGINE & HASHTAG SYNC)
// ==========================================
// @route   POST /api/posts
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { text, caption, postType, media, mediaUrl } = req.body;
    const postContent = text || caption || '';
    const currentUserId = req.user?._id || req.user?.id || req.userId;

    if (!postContent && (!media || media.length === 0) && !mediaUrl) {
      return res.status(400).json({ success: false, message: 'Text or media is required' });
    }

    // Process media array to conform with schema sub-documents
    let mediaList = [];
    if (Array.isArray(media)) {
      mediaList = media;
    } else if (mediaUrl) {
      mediaList = [{ url: mediaUrl, type: 'image' }];
    }

    // Call Python FastAPI AI Trust Engine (Port 8000)
    let trustData = {
      trustScore: 75.0,
      badge: 'Blue',
      breakdown: {
        factualVerification: 75,
        authenticity: 75,
        sourceCredibility: 75,
        modelConfidence: 80
      }
    };

    try {
      const aiResponse = await axios.post('http://127.0.0.1:8000/analyze-trust', {
        text: postContent,
        userId: currentUserId ? currentUserId.toString() : null,
        accountAgeDays: 30
      });
      trustData = aiResponse.data;
    } catch (aiErr) {
      console.warn('FastAPI Service unreachable, using default baseline trust score:', aiErr.message);
    }

    const hashtags = extractHashtags(postContent);

    const newPost = await Post.create({
      user: currentUserId,
      text: postContent,
      caption: postContent,
      postType: postType || 'standard',
      media: mediaList,
      mediaUrl: mediaUrl || '',
      hashtags,
      trustScore: trustData.trustScore,
      trustBadge: trustData.badge,
      trustBreakdown: trustData.breakdown
    });

    // Auto-sync hashtag counts in Hashtag collection
    if (hashtags && hashtags.length > 0) {
      for (const tag of hashtags) {
        await Hashtag.findOneAndUpdate(
          { name: tag },
          { $inc: { count: 1 } },
          { upsert: true, new: true }
        );
      }
    }

    await newPost.populate('user', 'name avatar');

    res.status(201).json({
      success: true,
      message: 'Post created and analyzed successfully',
      post: newPost,
      aiAnalysis: trustData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. GET USER'S SAVED POSTS
// (Must stay before /:id to prevent ID collisions)
// ==========================================
// @route   GET /api/posts/saved
// @access  Private
router.get('/saved', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.userId;

    const savedPosts = await SavedPost.find({ user: currentUserId })
      .populate({
        path: 'post',
        populate: { path: 'user', select: 'name avatar' }
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: savedPosts.length,
      savedPosts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. GET SINGLE POST BY ID
// ==========================================
// @route   GET /api/posts/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'name avatar')
      .populate('comments.user', 'name avatar');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({
      success: true,
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. TOGGLE LIKE / UNLIKE POST
// ==========================================
// @route   POST /api/posts/:id/like
// @access  Private
router.post('/:id/like', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.userId;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isLiked = post.likes && post.likes.includes(currentUserId);

    if (isLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== currentUserId.toString());
      post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    } else {
      if (!post.likes) post.likes = [];
      post.likes.push(currentUserId);
      post.likesCount = (post.likesCount || 0) + 1;

      if (post.user.toString() !== currentUserId.toString()) {
        await Activity.create({
          user: post.user,
          type: 'POST_LIKED',
          metadata: { text: 'Someone liked your post!' }
        });
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      likesCount: post.likesCount,
      isLiked: !isLiked
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. ADD COMMENT TO POST
// ==========================================
// @route   POST /api/posts/:id/comment
// @access  Private
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.userId;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    post.comments.push({
      user: currentUserId,
      text: text.trim(),
      createdAt: new Date()
    });
    post.commentsCount = (post.commentsCount || 0) + 1;

    await post.save();
    await post.populate('comments.user', 'name avatar');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comments: post.comments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 7. TOGGLE SAVE / BOOKMARK POST
// ==========================================
// @route   POST /api/posts/:id/save
// @access  Private
router.post('/:id/save', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.userId;
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existingSave = await SavedPost.findOne({ user: currentUserId, post: postId });

    if (existingSave) {
      await SavedPost.deleteOne({ _id: existingSave._id });
      return res.status(200).json({
        success: true,
        isSaved: false,
        message: 'Post removed from saved posts'
      });
    } else {
      await SavedPost.create({ user: currentUserId, post: postId });
      return res.status(201).json({
        success: true,
        isSaved: true,
        message: 'Post saved successfully'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 8. DELETE A POST
// ==========================================
// @route   DELETE /api/posts/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.userId;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.user.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this post' });
    }

    await Post.deleteOne({ _id: post._id });
    await SavedPost.deleteMany({ post: post._id });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;