const Block = require('../models/block.model');
const Follower = require('../models/follower.model');
const Settings = require('../models/settings.model');

class BlockService {
  /**
   * Block a user.
   * Also unfollows both directions and cleans up related data.
   */
  async blockUser(blockerId, blockedId) {
    if (blockerId.toString() === blockedId.toString()) {
      throw { statusCode: 400, message: 'You cannot block yourself' };
    }

    const existing = await Block.findOne({ blocker: blockerId, blocked: blockedId });
    if (existing) {
      return { isBlocked: true, message: 'User already blocked' };
    }

    await Block.create({ blocker: blockerId, blocked: blockedId });

    // Remove follow relationships in both directions
    await Promise.all([
      Follower.deleteOne({ follower: blockerId, following: blockedId }),
      Follower.deleteOne({ follower: blockedId, following: blockerId }),
    ]);

    // Remove from blocked users' muted/blocked lists in settings
    await Promise.all([
      Settings.updateOne(
        { user: blockerId },
        { $pull: { mutedAccounts: { $in: [blockedId.toString()] } } }
      ),
      Settings.updateOne(
        { user: blockedId },
        { $pull: { mutedAccounts: { $in: [blockerId.toString()] } } }
      ),
    ]);

    return { isBlocked: true, message: 'User blocked' };
  }

  /**
   * Unblock a user.
   */
  async unblockUser(blockerId, blockedId) {
    const result = await Block.deleteOne({ blocker: blockerId, blocked: blockedId });

    if (result.deletedCount === 0) {
      return { isBlocked: false, message: 'User was not blocked' };
    }

    return { isBlocked: false, message: 'User unblocked' };
  }

  /**
   * Check if user A has blocked user B.
   */
  async isBlocked(blockerId, blockedId) {
    const block = await Block.findOne({ blocker: blockerId, blocked: blockedId });
    return !!block;
  }

  /**
   * Check if there is any block relationship between two users (either direction).
   */
  async hasAnyBlock(userA, userB) {
    const block = await Block.findOne({
      $or: [
        { blocker: userA, blocked: userB },
        { blocker: userB, blocked: userA },
      ],
    });
    return !!block;
  }

  /**
   * Get all user IDs that the given user has blocked.
   */
  async getBlockedIds(userId) {
    const blocks = await Block.find({ blocker: userId }).select('blocked');
    return blocks.map((b) => b.blocked.toString());
  }

  /**
   * Get all user IDs that have blocked the given user.
   */
  async getBlockedByIds(userId) {
    const blocks = await Block.find({ blocked: userId }).select('blocker');
    return blocks.map((b) => b.blocker.toString());
  }

  /**
   * Get the combined set of user IDs that are blocked by or have blocked the given user.
   * This is the full "invisible to each other" set.
   */
  async getExcludedIds(userId) {
    const [blocked, blockedBy] = await Promise.all([
      this.getBlockedIds(userId),
      this.getBlockedByIds(userId),
    ]);
    return [...new Set([...blocked, ...blockedBy])];
  }

  /**
   * Check if a user has a private account.
   */
  async isPrivateAccount(userId) {
    const settings = await Settings.findOne({ user: userId });
    return settings?.isPrivateAccount === true;
  }

  /**
   * Check if viewer can see the target user's content.
   * Returns true if content should be hidden.
   */
  async shouldHideContent(viewerId, targetUserId) {
    // Always hide if blocked (either direction)
    if (await this.hasAnyBlock(viewerId, targetUserId)) {
      return true;
    }

    // Hide private account content from non-followers
    if (await this.isPrivateAccount(targetUserId)) {
      const isFollowing = await Follower.findOne({
        follower: viewerId,
        following: targetUserId,
      });
      if (!isFollowing && viewerId.toString() !== targetUserId.toString()) {
        return true;
      }
    }

    return false;
  }
}

module.exports = new BlockService();
