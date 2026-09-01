const express = require('express');
const router = express.Router();
const Like = require('../models/like.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');

// Toggle Like / Unlike on a post
router.post('/:postId/toggle', protect, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id || req.user.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existingLike = await Like.findOne({ post: postId, user: userId });

    if (existingLike) {
      await existingLike.deleteOne();
      return res.status(200).json({ success: true, isLiked: false, message: 'Post unliked' });
    } else {
      await Like.create({ post: postId, user: userId });
      return res.status(200).json({ success: true, isLiked: true, message: 'Post liked' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get total likes & users who liked a post
router.get('/:postId', protect, async (req, res) => {
  try {
    const likes = await Like.find({ post: req.params.postId }).populate('user', 'username name avatar');
    res.status(200).json({ success: true, count: likes.length, likes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;