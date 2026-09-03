const Like = require('../models/like.model');
const Post = require('../models/post.model');
const { ApiError } = require('../middleware/error.middleware');
const notificationService = require('./notification.service');

class LikeService {
  /**
   * Toggle like on a post. Returns { isLiked, likesCount }.
   */
  async toggle(postId, userId) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Block check: cannot like a post from a blocked user
    const blockService = require('./block.service');
    const hasBlock = await blockService.hasAnyBlock(userId, post.user);
    if (hasBlock) {
      throw new ApiError(400, 'Cannot interact with this content');
    }

    const existingLike = await Like.findOne({ post: postId, user: userId });

    if (existingLike) {
      // Unlike
      await Like.deleteOne({ _id: existingLike._id });
      post.likesCount = Math.max(0, post.likesCount - 1);
      await post.save();
      return { isLiked: false, likesCount: post.likesCount };
    } else {
      // Like
      await Like.create({ post: postId, user: userId });
      post.likesCount += 1;
      await post.save();

      // Notify post owner (fire-and-forget)
      notificationService.notifyPostLiked({
        postOwnerId: post.user,
        likerId: userId,
        postId,
      }).catch(() => {});

      return { isLiked: true, likesCount: post.likesCount };
    }
  }

  /**
   * Remove like from a post.
   */
  async remove(postId, userId) {
    const existingLike = await Like.findOne({ post: postId, user: userId });
    if (!existingLike) {
      throw new ApiError(404, 'Like not found');
    }

    await Like.deleteOne({ _id: existingLike._id });

    const post = await Post.findById(postId);
    if (post) {
      post.likesCount = Math.max(0, post.likesCount - 1);
      await post.save();
    }

    return { isLiked: false, likesCount: post?.likesCount || 0 };
  }

  /**
   * Check if a user has liked a post.
   */
  async hasLiked(postId, userId) {
    const like = await Like.findOne({ post: postId, user: userId });
    return !!like;
  }

  /**
   * Get like count for a post.
   */
  async getCount(postId) {
    const post = await Post.findById(postId).select('likesCount');
    return post?.likesCount || 0;
  }
}

module.exports = new LikeService();
