const Post = require('../models/post.model');
const TrustScore = require('../models/trust-score.model');
const { ApiError } = require('../middleware/error.middleware');

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
   */
  async getAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .populate('user', 'name username avatar isVerified reputationBadge')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments();

    // Attach TrustScore detail for each post
    const postIds = posts.map((p) => p._id);
    const trustScores = await TrustScore.find({ post: { $in: postIds } });
    const trustScoreMap = {};
    trustScores.forEach((ts) => {
      trustScoreMap[ts.post.toString()] = ts;
    });

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
   * Includes TrustScore detail (label, explanation, component scores).
   */
  async getById(postId) {
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

    // Clean up associated likes and comments
    const Like = require('../models/like.model');
    const Comment = require('../models/comment.model');

    await Promise.all([
      Like.deleteMany({ post: postId }),
      Comment.deleteMany({ post: postId }),
    ]);

    return { message: 'Post deleted successfully' };
  }
}

module.exports = new PostService();
