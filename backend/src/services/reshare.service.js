const Reshare = require('../models/reshare.model');
const Post = require('../models/post.model');
const { ApiError } = require('../middleware/error.middleware');
const notificationService = require('./notification.service');

class ReshareService {
  /**
   * Toggle a reshare on a post. Returns { isReshared, reshareCount }.
   */
  async toggle(postId, userId) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Block check: cannot interact with a post from a blocked user
    const blockService = require('./block.service');
    const hasBlock = await blockService.hasAnyBlock(userId, post.user);
    if (hasBlock) {
      throw new ApiError(400, 'Cannot interact with this content');
    }

    const existing = await Reshare.findOne({ user: userId, originalPost: postId });

    if (existing) {
      // Unreshare
      await Reshare.deleteOne({ _id: existing._id });
      post.sharesCount = Math.max(0, post.sharesCount - 1);
      await post.save();
      return { isReshared: false, reshareCount: post.sharesCount };
    }

    // Reshare — unique index { user, originalPost } prevents duplicates
    await Reshare.create({ user: userId, originalPost: postId });
    post.sharesCount += 1;
    await post.save();

    // Notify post owner (fire-and-forget, skip self-reshares)
    if (post.user.toString() !== userId.toString()) {
      notificationService.notifyPostReshared({
        postOwnerId: post.user,
        resharerId: userId,
        postId,
      }).catch(() => {});
    }

    return { isReshared: true, reshareCount: post.sharesCount };
  }

  /**
   * Remove a reshare (explicit DELETE path — mirrors like removal).
   */
  async remove(postId, userId) {
    const existing = await Reshare.findOne({ user: userId, originalPost: postId });
    if (!existing) {
      throw new ApiError(404, 'Reshare not found');
    }

    await Reshare.deleteOne({ _id: existing._id });

    const post = await Post.findById(postId);
    if (post) {
      post.sharesCount = Math.max(0, post.sharesCount - 1);
      await post.save();
    }

    return { isReshared: false, reshareCount: post?.sharesCount || 0 };
  }

  /**
   * Check if a user has reshared a post.
   */
  async hasReshared(postId, userId) {
    const reshare = await Reshare.findOne({ user: userId, originalPost: postId });
    return !!reshare;
  }

  /**
   * Get the reshare count for a post.
   */
  async getCount(postId) {
    const post = await Post.findById(postId).select('sharesCount');
    return post?.sharesCount || 0;
  }
}

module.exports = new ReshareService();