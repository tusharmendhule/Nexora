const postService = require('../../services/post.service');
const contentRouter = require('../../services/content-router.service');
const processingQueue = require('../../services/processing-queue.service');
const { ApiError } = require('../../middleware/error.middleware');

// ─── Media validation helpers ──────────────────────────────

const VALID_MEDIA_TYPES = ['image', 'video', 'audio', 'document'];
const MAX_MEDIA_ITEMS = 10;
const MAX_URL_LENGTH = 2048;

/**
 * Validate a single media item.
 */
function validateMediaItem(item, index) {
  if (!item || typeof item !== 'object') {
    throw new ApiError(400, `Media item at index ${index} is invalid`);
  }

  if (!item.url || typeof item.url !== 'string' || item.url.trim() === '') {
    throw new ApiError(400, `Media item at index ${index} must have a valid URL`);
  }

  if (item.url.length > MAX_URL_LENGTH) {
    throw new ApiError(400, `Media URL at index ${index} exceeds maximum length`);
  }

  if (item.type && !VALID_MEDIA_TYPES.includes(item.type)) {
    throw new ApiError(
      400,
      `Media type at index ${index} must be one of: ${VALID_MEDIA_TYPES.join(', ')}`
    );
  }
}

/**
 * POST /api/v1/posts
 */
exports.createPost = async (req, res, next) => {
  try {
    const {
      text, postType, media, contentType, tags, hashtags,
      linkUrl, linkTitle, linkDescription, visibility,
      mentions, location
    } = req.body;

    if (!text && (!media || media.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Post text or media is required',
      });
    }

    // Validate media array
    if (media && Array.isArray(media)) {
      if (media.length > MAX_MEDIA_ITEMS) {
        return res.status(400).json({
          success: false,
          message: `Too many media items. Maximum allowed: ${MAX_MEDIA_ITEMS}`,
        });
      }

      for (let i = 0; i < media.length; i++) {
        validateMediaItem(media[i], i);
      }
    }

    const post = await postService.create(req.user._id, {
      text, postType, media, contentType, tags, hashtags,
      linkUrl, linkTitle, linkDescription, visibility,
      mentions, location
    });

    // Create content processing job and enqueue for background analysis
    // This is non-blocking -- the post is returned immediately
    try {
      const job = await contentRouter.createJob(post);
      await processingQueue.enqueueJob(job);
    } catch (queueErr) {
      // Log but don't fail the post creation
      console.error('[Content] Failed to enqueue analysis job:', queueErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/posts
 */
exports.getPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await postService.getAll(page, limit);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/posts/:id
 */
exports.getPostById = async (req, res, next) => {
  try {
    const post = await postService.getById(req.params.id);
    res.status(200).json({ success: true, post });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/posts/:id
 */
exports.updatePost = async (req, res, next) => {
  try {
    const post = await postService.update(req.params.id, req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      post,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/posts/:id
 *
 * Owner can delete their own posts.
 * MODERATOR and ADMIN can delete any post.
 */
exports.deletePost = async (req, res, next) => {
  try {
    const result = await postService.delete(
      req.params.id,
      req.user._id,
      req.user.role
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
