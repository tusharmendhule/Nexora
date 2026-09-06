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
 * GET    /api/v1/stories/:id/comments            — List story comments
 * POST   /api/v1/stories/:id/comments            — Add a comment/reply
 * DELETE /api/v1/stories/:id/comments/:commentId — Delete a comment/reply
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
    const viewedBy = (views = []) => views.map((v) => v?.user?.toString?.());

    // Map to the shape the Flutter MomentService expects
    const mapped = stories.map((s) => {
      const userObj = s.user;
      const likeIds = likesOf(s.likes);
      const viewIds = viewedBy(s.views);
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
        viewCount: viewIds.length,
        viewedByMe: viewIds.includes(currentUserId),
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
        viewedByMe: false,
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
        viewedByMe: (story.views || []).some(
          (v) => v?.user?.toString() === currentUserId
        ),
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

// ─── Inline story comment helpers ───────────────────────

// Story comments live inline on the Story document ({user, text, createdAt,
// replies[]}). serialize maps one to the shape the Flutter Comments screen
// expects (mirrors GET /api/v1/posts/:id/comments items), so clips can reuse
// the same comment UI.
function serializeStoryComment(comment, storyId, parentId = null) {
  const userObj =
    comment.user && typeof comment.user === 'object' ? comment.user : null;
  return {
    _id: (comment._id || '').toString(),
    story: storyId,
    user: userObj
      ? {
          _id: (userObj._id || '').toString(),
          name: userObj.name || userObj.username || '',
          username: userObj.username || '',
          avatar: userObj.avatar || '',
        }
      : null,
    text: comment.text || '',
    createdAt: comment.createdAt || new Date(),
    parentComment: parentId,
    replies: (comment.replies || []).map((r) =>
      serializeStoryComment(
        r.toObject ? r.toObject() : r,
        storyId,
        (comment._id || '').toString() || null
      )
    ),
  };
}

// ─── GET /api/v1/stories/:id/comments — list comments ──
router.get('/:id/comments', protect, validateObjectId('id'), async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('comments.user comments.replies.user', 'name username avatar');
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const comments = (story.comments || []).map((c) =>
      serializeStoryComment(
        c.toObject ? c.toObject() : c,
        req.params.id
      )
    );

    res.status(200).json({
      success: true,
      comments,
      pagination: { page: 1, limit: comments.length, total: comments.length, pages: 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/v1/stories/:id/comments — add a comment ──
router.post('/:id/comments', protect, validateObjectId('id'), async (req, res) => {
  try {
    const { text, parentCommentId } = req.body || {};
    const clean = (text || '').trim();

    if (!clean) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
    if (clean.length > 500) {
      return res.status(400).json({ success: false, message: 'Comment must be under 500 characters' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    story.comments = story.comments || [];

    // Parent given → this is a reply nested under an existing comment.
    if (parentCommentId && /^[0-9a-fA-F]{24}$/.test(String(parentCommentId))) {
      const parent = story.comments.id(parentCommentId);
      if (!parent) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }
      parent.replies = parent.replies || [];
      const reply = parent.replies.create({ user: req.user._id, text: clean });
      parent.replies.push(reply);
      await story.save();

      return res.status(201).json({
        success: true,
        message: 'Reply added successfully',
        comment: serializeStoryComment(
          reply.toObject ? reply.toObject() : reply,
          req.params.id,
          String(parent._id)
        ),
        commentCount: story.comments.length,
      });
    }

    const comment = story.comments.create({ user: req.user._id, text: clean });
    story.comments.push(comment);
    await story.save();

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: serializeStoryComment(
        comment.toObject ? comment.toObject() : comment,
        req.params.id
      ),
      commentCount: story.comments.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── DELETE /api/v1/stories/:id/comments/:commentId ────
// Owner (or MODERATOR/ADMIN) deletes their comment/reply. Deleting a
// top-level comment removes its nested replies too.
router.delete(
  '/:id/comments/:commentId',
  protect,
  validateObjectId('id'),
  validateObjectId('commentId'),
  async (req, res) => {
    try {
      const story = await Story.findById(req.params.id);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }

      story.comments = story.comments || [];
      const isPrivileged =
        req.user.role === 'MODERATOR' || req.user.role === 'ADMIN';
      const canDelete = (comment) =>
        isPrivileged ||
        (comment.user && comment.user.toString() === req.user._id.toString());

      // Top-level comment (with any nested replies).
      const target = story.comments.id(req.params.commentId);
      if (target) {
        if (!canDelete(target)) {
          return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
        }
        story.comments.pull(target._id);
        await story.save();
        return res.status(200).json({
          success: true,
          message: 'Comment deleted successfully',
          commentCount: story.comments.length,
        });
      }

      // Nested reply.
      for (const top of story.comments) {
        top.replies = top.replies || [];
        const reply = top.replies.id(req.params.commentId);
        if (reply) {
          if (!canDelete(reply)) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
          }
          top.replies.pull(reply._id);
          await story.save();
          return res.status(200).json({
            success: true,
            message: 'Comment deleted successfully',
            commentCount: story.comments.length,
          });
        }
      }

      res.status(404).json({ success: false, message: 'Comment not found' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

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
