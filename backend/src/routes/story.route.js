const express = require('express');
const router = express.Router();
const Story = require('../models/story.model');
const Activity = require('../models/activity.model');
const { protect } = require('../middleware/auth.middleware');

// 1. CREATE A NEW STORY / POLL
router.post('/', protect, async (req, res) => {
  try {
    const { mediaUrl, caption, poll } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    const newStory = await Story.create({
      user: currentUserId,
      mediaUrl,
      caption,
      poll: poll ? {
        question: poll.question,
        options: poll.options.map(option => ({ optionText: option, votes: [] }))
      } : undefined
    });

    res.status(201).json({ success: true, story: newStory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 2. GET ALL ACTIVE STORIES (Feed)
router.get('/', protect, async (req, res) => {
  try {
    const stories = await Story.find()
      .populate('user', 'name avatar')
      .populate('comments.user', 'name avatar')
      .populate('comments.replies.user', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: stories.length, stories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 3. TOGGLE LIKE / UNLIKE
router.post('/:id/like', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const story = await Story.findById(req.params.id);

    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const isLiked = story.likes.includes(currentUserId);
    if (isLiked) {
      story.likes = story.likes.filter(id => id.toString() !== currentUserId.toString());
    } else {
      story.likes.push(currentUserId);
      if (story.user.toString() !== currentUserId.toString()) {
        await Activity.create({
          user: story.user,
          type: 'STORY_LIKED',
          metadata: { text: 'Someone liked your story!' }
        });
      }
    }

    await story.save();
    res.status(200).json({ success: true, likesCount: story.likes.length, isLiked: !isLiked });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 4. VOTE ON A STORY POLL
router.post('/:id/poll/vote', protect, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    const story = await Story.findById(req.params.id);
    if (!story || !story.poll) return res.status(404).json({ success: false, message: 'Story or poll not found' });

    story.poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(id => id.toString() !== currentUserId.toString());
    });

    if (story.poll.options[optionIndex]) {
      story.poll.options[optionIndex].votes.push(currentUserId);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid poll option index' });
    }

    await story.save();

    if (story.user.toString() !== currentUserId.toString()) {
      await Activity.create({
        user: story.user,
        type: 'POLL_VOTED',
        metadata: { text: 'Someone voted on your poll!' }
      });
    }

    res.status(200).json({ success: true, poll: story.poll });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 5. ADD A COMMENT
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    story.comments.push({ user: currentUserId, text: text.trim(), createdAt: new Date() });
    await story.save();

    await story.populate('comments.user', 'name avatar');

    if (story.user.toString() !== currentUserId.toString()) {
      await Activity.create({
        user: story.user,
        type: 'STORY_COMMENTED',
        metadata: { text: `New comment on your story: "${text.substring(0, 20)}..."` }
      });
    }

    res.status(201).json({ success: true, message: 'Comment added successfully', comments: story.comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 6. DELETE A COMMENT
router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const { id, commentId } = req.params;

    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const comment = story.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    if (comment.user.toString() !== currentUserId.toString() && story.user.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this comment' });
    }

    comment.deleteOne();
    await story.save();

    res.status(200).json({ success: true, message: 'Comment removed successfully', comments: story.comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 7. ADD A REPLY TO A COMMENT
router.post('/:id/comment/:commentId/reply', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const comment = story.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    comment.replies.push({ user: currentUserId, text: text.trim(), createdAt: new Date() });
    await story.save();

    await story.populate('comments.replies.user', 'name avatar');

    res.status(201).json({ success: true, message: 'Reply added successfully', comments: story.comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 8. DELETE A REPLY FROM A COMMENT
router.delete('/:id/comment/:commentId/reply/:replyId', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const { id, commentId, replyId } = req.params;

    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const comment = story.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

    if (reply.user.toString() !== currentUserId.toString() && story.user.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this reply' });
    }

    reply.deleteOne();
    await story.save();

    res.status(200).json({ success: true, message: 'Reply removed successfully', comments: story.comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;