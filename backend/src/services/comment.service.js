const Comment = require('../models/comment.model');
const Post = require('../models/post.model');
const { ApiError } = require('../middleware/error.middleware');
const notificationService = require('./notification.service');

class CommentService {
  /**
   * Add a comment to a post.
   */
  async create(postId, userId, text, parentCommentId = null) {
    // Validate text is provided and not empty/whitespace
    if (!text || typeof text !== 'string' || text.trim() === '') {
      throw new ApiError(400, 'Comment text is required');
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Block check: cannot comment on a post from a blocked user
    const blockService = require('./block.service');
    const hasBlock = await blockService.hasAnyBlock(userId, post.user);
    if (hasBlock) {
      throw new ApiError(400, 'Cannot interact with this content');
    }

    const comment = await Comment.create({
      post: postId,
      user: userId,
      text: text.trim(),
      parentComment: parentCommentId || null,
    });

    // Increment comment count on post
    post.commentsCount += 1;
    await post.save();

    // Notify post owner (fire-and-forget)
    notificationService.notifyPostCommented({
      postOwnerId: post.user,
      commenterId: userId,
      postId,
      commentText: text.trim(),
    }).catch(() => {});

    return comment.populate('user', 'name username avatar');
  }

  /**
   * Get all comments for a post (top-level only, with replies nested).
   */
  async getByPost(postId, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    // Get top-level comments
    const comments = await Comment.find({ post: postId, parentComment: null })
      .populate('user', 'name username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get replies for each comment
    const commentIds = comments.map((c) => c._id);
    const replies = await Comment.find({
      post: postId,
      parentComment: { $in: commentIds },
    })
      .populate('user', 'name username avatar')
      .sort({ createdAt: 1 });

    // Group replies by parent
    const repliesMap = {};
    for (const reply of replies) {
      const parentId = reply.parentComment.toString();
      if (!repliesMap[parentId]) repliesMap[parentId] = [];
      repliesMap[parentId].push(reply);
    }

    const commentsWithReplies = comments.map((comment) => ({
      ...comment.toObject(),
      replies: repliesMap[comment._id.toString()] || [],
    }));

    const total = await Comment.countDocuments({ post: postId, parentComment: null });

    return {
      comments: commentsWithReplies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete a comment.
   *
   * Authorization:
   *   - Comment author can always delete their own comment.
   *   - MODERATOR and ADMIN can delete any comment.
   *
   * @param {string} commentId - The comment to delete
   * @param {string} userId    - The requesting user's MongoDB _id
   * @param {string} [userRole] - The requesting user's role (optional, for admin/mod override)
   */
  async delete(commentId, userId, userRole) {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new ApiError(404, 'Comment not found');
    }

    // Ownership check — allow owner, MODERATOR, or ADMIN
    const isOwner = comment.user.toString() === userId.toString();
    const isPrivileged = userRole === 'MODERATOR' || userRole === 'ADMIN';

    if (!isOwner && !isPrivileged) {
      throw new ApiError(403, 'Not authorized to delete this comment');
    }

    // Count replies before deletion to properly update comment count
    const repliesCount = await Comment.countDocuments({ parentComment: commentId });
    const totalDeleted = 1 + repliesCount; // 1 for the comment itself + replies

    // Delete all replies to this comment
    await Comment.deleteMany({ parentComment: commentId });
    await Comment.deleteOne({ _id: commentId });

    // Decrement comment count on post by total deleted (comment + replies)
    const post = await Post.findById(comment.post);
    if (post) {
      post.commentsCount = Math.max(0, post.commentsCount - totalDeleted);
      await post.save();
    }

    return { message: 'Comment deleted successfully' };
  }
}

module.exports = new CommentService();
