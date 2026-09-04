const Post = require('../models/post.model');
const TrustScore = require('../models/trust-score.model');
const { ApiError } = require('../middleware/error.middleware');
const { escapeRegex } = require('../middleware/validate.middleware');

class PostService {
  /**
   * Create a new post.
   */
  async create(userId, postData) {
    const {
      text, postType, media, contentType, tags, hashtags,
      linkUrl, linkTitle, linkDescription,
      visibility, mentions, location
    } = postData;

    // Normalize media items — accept both raw URL strings and structured objects
    const normalizedMedia = (media || []).map((item) => {
      if (typeof item === 'string') {
        return { url: item, type: 'image' };
      }
      return {
        url: item.url,
        type: item.type || 'image',
        thumbnailUrl: item.thumbnailUrl || undefined,
        altText: item.altText || '',
        fileSize: item.fileSize || undefined,
        mimeType: item.mimeType || undefined,
      };
    });

    // Auto-detect contentType from media if not explicitly set
    let detectedContentType = contentType || 'text';
    if (detectedContentType === 'text' && normalizedMedia.length > 0) {
      const firstType = normalizedMedia[0].type;
      if (['image', 'video', 'audio'].includes(firstType)) {
        detectedContentType = firstType;
      }
    }

    const post = await Post.create({
      user: userId,
      text: text || '',
      contentType: detectedContentType,
      postType: postType || 'standard',
      media: normalizedMedia,
      tags: tags || [],
      hashtags: hashtags || [],
      linkUrl: linkUrl || null,
      linkTitle: linkTitle || null,
      linkDescription: linkDescription || null,
      visibility: visibility || 'public',
      mentions: mentions || [],
      location: location || null,
      verificationStatus: 'PENDING_VERIFICATION',
      moderationStatus: 'pending',
    });

    return post.populate('user', 'name username avatar isVerified reputationBadge');
  }

  /**
   * Get all posts (feed) with pagination.
   * Includes TrustScore detail (label, explanation, component scores)
   * alongside the numeric trustScore already on the Post model.
   * If userId is provided, each post includes an isLiked flag.
   */
  async getAll(page = 1, limit = 20, userId = null, authorId = null) {
    const skip = (page - 1) * limit;

    // Blocked users are hidden from the feed (and from profile views).
    let excludedIds = [];
    if (userId) {
      const blockService = require('./block.service');
      excludedIds = await blockService.getExcludedIds(userId);
    }

    // Build the post filter
    const postFilter = {};
    if (authorId) {
      // Profile view: only this author's posts
      postFilter.user = excludedIds.length > 0
        ? { $in: [authorId], $nin: excludedIds }
        : authorId;
    } else if (excludedIds.length > 0) {
      postFilter.user = { $nin: excludedIds };
    }

    const posts = await Post.find(postFilter)
      .populate('user', 'name username avatar isVerified reputationBadge')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(postFilter);

    const postIds = posts.map((p) => p._id);

    // Attach TrustScore detail for each post
    const trustScores = await TrustScore.find({ post: { $in: postIds } });
    const trustScoreMap = {};
    trustScores.forEach((ts) => {
      trustScoreMap[ts.post.toString()] = ts;
    });

    // Determine which posts the current user has liked, saved or reshared
    let likedPostIds = new Set();
    let savedPostIds = new Set();
    let resharedPostIds = new Set();
    if (userId && postIds.length > 0) {
      const Like = require('../models/like.model');
      const SavedPost = require('../models/saved-post.model');
      const Reshare = require('../models/reshare.model');
      const [userLikes, userSaves, userReshares] = await Promise.all([
        Like.find({ post: { $in: postIds }, user: userId }).select('post'),
        SavedPost.find({ post: { $in: postIds }, user: userId }).select('post'),
        Reshare.find({ originalPost: { $in: postIds }, user: userId }).select('originalPost'),
      ]);
      likedPostIds = new Set(userLikes.map((l) => l.post.toString()));
      savedPostIds = new Set(userSaves.map((s) => s.post.toString()));
      resharedPostIds = new Set(userReshares.map((r) => r.originalPost.toString()));
    }

    const enrichedPosts = posts.map((p) => {
      const obj = p.toObject();
      const tsDetail = trustScoreMap[p._id.toString()];
      if (tsDetail) {
        obj.trustScoreDetail = {
          score: tsDetail.score,
          label: tsDetail.label,
          explanation: tsDetail.explanation,
          isOverrideApplied: tsDetail.isOverrideApplied,
          authenticity: tsDetail.authenticity,
          factualVerification: tsDetail.factualVerification,
          sourceCredibility: tsDetail.sourceCredibility,
          modelConfidence: tsDetail.modelConfidence,
        };
        // Also update the numeric trustScore from the computed value
        obj.trustScore = tsDetail.score;
      }
      obj.isLiked = likedPostIds.has(p._id.toString());
      obj.isSaved = savedPostIds.has(p._id.toString());
      obj.isReshared = resharedPostIds.has(p._id.toString());
      return obj;
    });

    return {
      posts: enrichedPosts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single post by ID.
   * Includes TrustScore detail (label, explanation, component scores)
   * and isSaved flag if userId is provided.
   */
  async getById(postId, userId = null) {
    const post = await Post.findById(postId).populate(
      'user', 'name username avatar isVerified reputationBadge'
    );

    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Attach TrustScore detail
    const tsDetail = await TrustScore.findOne({ post: postId });
    const obj = post.toObject();
    if (tsDetail) {
      obj.trustScoreDetail = {
        score: tsDetail.score,
        label: tsDetail.label,
        explanation: tsDetail.explanation,
        isOverrideApplied: tsDetail.isOverrideApplied,
        authenticity: tsDetail.authenticity,
        factualVerification: tsDetail.factualVerification,
        sourceCredibility: tsDetail.sourceCredibility,
        modelConfidence: tsDetail.modelConfidence,
      };
      obj.trustScore = tsDetail.score;
    }

    // Attach per-user interaction flags if user is provided
    if (userId) {
      const SavedPost = require('../models/saved-post.model');
      const Reshare = require('../models/reshare.model');
      const Like = require('../models/like.model');
      const [saved, reshared, liked] = await Promise.all([
        SavedPost.findOne({ user: userId, post: postId }),
        Reshare.findOne({ user: userId, originalPost: postId }),
        Like.findOne({ user: userId, post: postId }),
      ]);
      obj.isSaved = !!saved;
      obj.isReshared = !!reshared;
      obj.isLiked = !!liked;
    }

    return obj;
  }

  /**
   * Update a post (text, media, visibility).
   */
  async update(postId, userId, updates) {
    const post = await Post.findById(postId);

    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Ownership check
    if (post.user.toString() !== userId.toString()) {
      throw new ApiError(403, 'Not authorized to update this post');
    }

    const allowedFields = [
      'text', 'postType', 'contentType', 'media', 'visibility',
      'tags', 'hashtags', 'linkUrl', 'linkTitle', 'linkDescription',
      'isPinned', 'isArchived'
    ];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        post[field] = updates[field];
      }
    }

    await post.save();
    return post.populate('user', 'name username avatar isVerified reputationBadge');
  }

  /**
   * Search posts by text, hashtags, or tags.
   *
   * Uses MongoDB text search for full-text matching, plus regex fallback
   * for partial matches on text, hashtags, and tags.
   *
   * @param {string} query - Search query string
   * @param {Object} opts - Options
   * @param {number} opts.page - Page number (default 1)
   * @param {number} opts.limit - Results per page (default 20)
   * @param {string} [opts.userId] - Current user ID for isLiked flag
   * @returns {Promise<Object>} { posts, pagination }
   */
  async search(query, opts = {}) {
    const page = opts.page || 1;
    const limit = Math.min(opts.limit || 20, 100);
    const userId = opts.userId || null;
    const skip = (page - 1) * limit;

    if (!query || query.trim() === '') {
      return { posts: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const trimmed = query.trim();
    const escaped = escapeRegex(trimmed);

    // Build search filter: match text, hashtags, or tags
    const filter = {
      $or: [
        { text: { $regex: escaped, $options: 'i' } },
        { hashtags: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
      ],
      visibility: 'public',
      isArchived: false,
    };

    // Exclude blocked users' posts from search
    if (userId) {
      const blockService = require('./block.service');
      const excludedIds = await blockService.getExcludedIds(userId);
      if (excludedIds.length > 0) {
        filter.user = { $nin: excludedIds };
      }
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('user', 'name username avatar isVerified reputationBadge')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    const postIds = posts.map((p) => p._id);

    // Attach TrustScore detail
    const trustScores = await TrustScore.find({ post: { $in: postIds } });
    const trustScoreMap = {};
    trustScores.forEach((ts) => {
      trustScoreMap[ts.post.toString()] = ts;
    });

    // Determine which posts the current user has liked, saved or reshared
    let likedPostIds = new Set();
    let savedPostIds = new Set();
    let resharedPostIds = new Set();
    if (userId && postIds.length > 0) {
      const Like = require('../models/like.model');
      const SavedPost = require('../models/saved-post.model');
      const Reshare = require('../models/reshare.model');
      const [userLikes, userSaves, userReshares] = await Promise.all([
        Like.find({ post: { $in: postIds }, user: userId }).select('post'),
        SavedPost.find({ post: { $in: postIds }, user: userId }).select('post'),
        Reshare.find({ originalPost: { $in: postIds }, user: userId }).select('originalPost'),
      ]);
      likedPostIds = new Set(userLikes.map((l) => l.post.toString()));
      savedPostIds = new Set(userSaves.map((s) => s.post.toString()));
      resharedPostIds = new Set(userReshares.map((r) => r.originalPost.toString()));
    }

    const enrichedPosts = posts.map((p) => {
      const obj = p.toObject();
      const tsDetail = trustScoreMap[p._id.toString()];
      if (tsDetail) {
        obj.trustScoreDetail = {
          score: tsDetail.score,
          label: tsDetail.label,
          explanation: tsDetail.explanation,
          isOverrideApplied: tsDetail.isOverrideApplied,
          authenticity: tsDetail.authenticity,
          factualVerification: tsDetail.factualVerification,
          sourceCredibility: tsDetail.sourceCredibility,
          modelConfidence: tsDetail.modelConfidence,
        };
        obj.trustScore = tsDetail.score;
      }
      obj.isLiked = likedPostIds.has(p._id.toString());
      obj.isSaved = savedPostIds.has(p._id.toString());
      obj.isReshared = resharedPostIds.has(p._id.toString());
      return obj;
    });

    return {
      posts: enrichedPosts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete a post and clean up associated data.
   *
   * Authorization:
   *   - Post owner can always delete their own post.
   *   - MODERATOR and ADMIN can delete any post.
   *
   * @param {string} postId - The post to delete
   * @param {string} userId - The requesting user's MongoDB _id
   * @param {string} [userRole] - The requesting user's role (optional, for admin/mod override)
   */
  async delete(postId, userId, userRole) {
    const post = await Post.findById(postId);

    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Ownership check — allow owner, MODERATOR, or ADMIN
    const isOwner = post.user.toString() === userId.toString();
    const isPrivileged = userRole === 'MODERATOR' || userRole === 'ADMIN';

    if (!isOwner && !isPrivileged) {
      throw new ApiError(403, 'Not authorized to delete this post');
    }

    await Post.findByIdAndDelete(postId);

    // Clean up associated likes, comments, saved posts, and reshares
    const Like = require('../models/like.model');
    const Comment = require('../models/comment.model');
    const SavedPost = require('../models/saved-post.model');
    const Reshare = require('../models/reshare.model');

    await Promise.all([
      Like.deleteMany({ post: postId }),
      Comment.deleteMany({ post: postId }),
      SavedPost.deleteMany({ post: postId }),
      Reshare.deleteMany({ originalPost: postId }),
    ]);

    return { message: 'Post deleted successfully' };
  }

  /**
   * Toggle save / bookmark on a post.
   *
   * @param {string} postId - The post to save/unsave
   * @param {string} userId - The requesting user's MongoDB _id
   * @returns {{ isSaved: boolean, message: string }}
   */
  async toggleSave(postId, userId) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const SavedPost = require('../models/saved-post.model');
    const existing = await SavedPost.findOne({ user: userId, post: postId });

    if (existing) {
      await SavedPost.deleteOne({ _id: existing._id });
      return { isSaved: false, message: 'Post removed from saved posts' };
    } else {
      await SavedPost.create({ user: userId, post: postId });
      return { isSaved: true, message: 'Post saved successfully' };
    }
  }

  /**
   * Get all saved posts for a user, with TrustScore enrichment.
   *
   * @param {string} userId - The requesting user's MongoDB _id
   * @param {number} page - Page number (default 1)
   * @param {number} limit - Results per page (default 20)
   * @returns {{ savedPosts: Array, pagination: Object }}
   */
  async getSavedPosts(userId, page = 1, limit = 20) {
    const SavedPost = require('../models/saved-post.model');
    const skip = (page - 1) * limit;

    const savedEntries = await SavedPost.find({ user: userId })
      .populate({
        path: 'post',
        populate: { path: 'user', select: 'name username avatar isVerified reputationBadge' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SavedPost.countDocuments({ user: userId });

    // Collect post IDs for TrustScore enrichment
    const postIds = savedEntries
      .map((sp) => sp.post?._id)
      .filter(Boolean);

    const trustScores = await TrustScore.find({ post: { $in: postIds } });
    const trustScoreMap = {};
    trustScores.forEach((ts) => {
      trustScoreMap[ts.post.toString()] = ts;
    });

    const enriched = savedEntries.map((sp) => {
      const obj = sp.toObject();
      if (obj.post) {
        const tsDetail = trustScoreMap[obj.post._id?.toString()];
        if (tsDetail) {
          obj.post.trustScoreDetail = {
            score: tsDetail.score,
            label: tsDetail.label,
            explanation: tsDetail.explanation,
            isOverrideApplied: tsDetail.isOverrideApplied,
            authenticity: tsDetail.authenticity,
            factualVerification: tsDetail.factualVerification,
            sourceCredibility: tsDetail.sourceCredibility,
            modelConfidence: tsDetail.modelConfidence,
          };
          obj.post.trustScore = tsDetail.score;
        }
        // Saved posts are always saved
        obj.post.isSaved = true;
      }
      return obj;
    });

    return {
      savedPosts: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new PostService();
