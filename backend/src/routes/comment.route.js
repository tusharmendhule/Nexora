const express = require('express');
const router = express.Router();
const Comment = require('../models/comment.model');
const Post = require('../models/post.model');
const { protect } = require('../middleware/auth.middleware');

// Add comment to a post
router.post('/:postId', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const { postId } = req.params;
    const userId = req.user._id || req.user.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = await Comment.create({
      post: postId,
      user: userId,
      text
    });

    res.status(201).json({ success: true, comment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get all comments for a post
router.get('/:postId', protect, async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.postId })
      .populate('user', 'username name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: comments.length, comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete a comment
router.delete('/:id', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (comment.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();
    res.status(200).json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;