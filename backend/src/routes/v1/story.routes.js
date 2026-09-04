/**
 * Story / Moment Routes (v1)
 *
 * Manages ephemeral 24-hour stories (called "Moments" in the Flutter UI).
 * Reuses the existing Story model with automatic TTL expiration.
 *
 * GET    /api/v1/stories           — List all active stories (feed)
 * POST   /api/v1/stories           — Create a new story/moment
 * DELETE /api/v1/stories/:id       — Delete a story (owner only)
 * POST   /api/v1/stories/:id/view  — Mark story as viewed
 * POST   /api/v1/stories/:id/like  — Toggle like on a story
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const Story = require('../../models/story.model');
const notificationService = require('../../services/notification.service');

// ─── GET /api/v1/stories — list all active stories ──────
router.get('/', protect, async (req, res) => {
  try {
    // Optional ?authorId=<userId> filters to one user's active moments
    // (used by profile "Memories" grids).
    const storyFilter = {};
    const authorId = req.query.authorId ? String(req.query.authorId) : null;
    if (authorId && /^[0-9a-fA-F]{24}$/.test(authorId)) {
      storyFilter.user = authorId;
    }

    // Optional ?type=moment|clip separates the Moments feed from the Clips
    // feed. Clips must never appear inside moments.
    const storyType = req.query.type ? String(req.query.type) : null;
    if (storyType === 'moment' || storyType === 'clip') {
      storyFilter.storyType = storyType;
    }

    const stories = await Story.find(storyFilter)
      .populate('user', 'username name avatar isVerified')
      .sort({ createdAt: -1 });

    const currentUserId = req.user._id.toString();
    const likesOf = (likes = []) => likes.map((id) => id?.toString?.());

    // Map to the shape the Flutter MomentService expects
    const mapped = stories.map((s) => {
      const userObj = s.user;
      const likeIds = likesOf(s.likes);
      return {
        _id: s._id,
        userId: userObj?._id?.toString() ?? s.user?.toString() ?? '',
        username: userObj?.username ?? '',
        displayName: userObj?.name ?? '',
        avatar: userObj?.avatar ?? '',
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        storyType: s.storyType || 'moment',
        caption: s.caption,
        createdAt: s.createdAt,
        expiresAt: new Date(new Date(s.createdAt).getTime() + 24 * 60 * 60 * 1000),
        viewCount: s.views?.length ?? 0,
        likeCount: likeIds.length,
        likedByMe: likeIds.includes(currentUserId),
        commentCount: s.comments?.length ?? 0,
      };
    });

    res.status(200).json({ success: true, stories: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/v1/stories — create a new story/moment ───
router.post('/', protect, async (req, res) => {
  try {
    const { mediaUrl, mediaType, caption, storyType } = req.body;
    const currentUserId = req.user._id;

    if (!mediaUrl) {
      return res.status(400).json({ success: false, message: 'Media URL is required' });
    }

    // 'clip' must be a video; anything else (or missing) is a moment.
    const type = storyType === 'clip' ? 'clip' : 'moment';
    if (type === 'clip' && mediaType !== 'video') {
      return res.status(400).json({ success: false, message: 'Clips require a video' });
    }

    const story = await Story.create({
      user: currentUserId,
      mediaUrl,
      mediaType: mediaType || 'image',
      storyType: type,
      caption: caption || '',
    });

    // Populate user info for the response
    await story.populate('user', 'username name avatar isVerified');

    const userObj = story.user;
    res.status(201).json({
      success: true,
      story: {
        _id: story._id,
        userId: userObj?._id?.toString() ?? currentUserId.toString(),
        username: userObj?.username ?? '',
        displayName: userObj?.name ?? '',
        avatar: userObj?.avatar ?? '',
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        storyType: story.storyType || 'moment',
        caption: story.caption,
        createdAt: story.createdAt,
        expiresAt: new Date(new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000),
        viewCount: story.views?.length ?? 0,
        likeCount: story.likes?.length ?? 0,
        likedByMe: false,
        commentCount: 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/v1/stories/:id — fetch a single story ────
router.get('/:id', protect, validateObjectId('id'), async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('user', 'username name avatar isVerified');
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const userObj = story.user;
    const currentUserId = req.user._id.toString();
    const likeIds = (story.likes || []).map((id) => id?.toString?.());

    res.status(200).json({
      success: true,
      story: {
        _id: story._id,
        userId: userObj?._id?.toString() ?? story.user?.toString() ?? '',
        username: userObj?.username ?? '',
        displayName: userObj?.name ?? '',
        avatar: userObj?.avatar ?? '',
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        storyType: story.storyType || 'moment',
        caption: story.caption,
        createdAt: story.createdAt,
        expiresAt: new Date(new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000),
        viewCount: story.views?.length ?? 0,
        likeCount: likeIds.length,
        likedByMe: likeIds.includes(currentUserId),
        commentCount: story.comments?.length ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── DELETE /api/v1/stories/:id — delete a story ────────
router.delete('/:id', protect, validateObjectId('id'), async (req, res) => {

  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (story.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this story' });
    }

    await Story.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Story deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/v1/stories/:id/view — mark as viewed ─────
router.post('/:id/view', protect, validateObjectId('id'), async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const alreadyViewed = story.views.some(
      (v) => v.user?.toString() === req.user._id.toString()
    );

    if (!alreadyViewed) {
      story.views.push({ user: req.user._id });
      await story.save();
    }

    res.status(200).json({ success: true, viewed: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/v1/stories/:id/like — toggle like ────────
router.post('/:id/like', protect, validateObjectId('id'), async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (!story.likes) story.likes = [];

    const isLiked = (story.likes || []).some(
      (id) => id && id.toString() === req.user._id.toString()
    );
    if (isLiked) {
      story.likes = story.likes.filter(
        (id) => id && id.toString() !== req.user._id.toString()
      );
    } else {
      story.likes.push(req.user._id);
    }

    await story.save();

    res.status(200).json({
      success: true,
      isLiked: !isLiked,
      likesCount: story.likes.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/v1/stories/:id/reply — reply to a moment ─
router.post('/:id/reply', protect, validateObjectId('id'), async (req, res) => {
  try {
    const { text } = req.body || {};
    const clean = (text || '').trim();

    if (!clean) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }
    if (clean.length > 500) {
      return res.status(400).json({ success: false, message: 'Reply must be under 500 characters' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const reply = {
      user: req.user._id,
      text: clean,
      createdAt: new Date(),
    };
    story.comments = story.comments || [];
    story.comments.push(reply);
    await story.save();

    // Notify the moment owner that they got a reply (fire-and-forget,
    // never blocks the reply itself). Self-replies are skipped by the service.
    notificationService
      .notifyMomentReplied({
        momentOwnerId: story.user,
        replierId: req.user._id,
        momentId: story._id,
        replyText: clean,
      })
      .catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      commentCount: story.comments.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
