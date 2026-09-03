const User = require('../models/user.model');
const Post = require('../models/post.model');
const Follower = require('../models/follower.model');
const { ApiError } = require('../middleware/error.middleware');
const auditService = require('./audit.service');

/**
 * Safely convert a Mongoose document or plain object to a plain JS object.
 */
function _toPlain(doc) {
  if (typeof doc.toJSON === 'function') return doc.toJSON();
  if (typeof doc.toObject === 'function') return doc.toObject();
  return Object.assign({}, doc);
}

class UserService {
  /**
   * Get user by ID.
   */
  async getById(id) {
    const user = await User.findById(id).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    const obj = _toPlain(user);
    // Attach real-time post count (non-critical — fail gracefully)
    try {
      obj.postsCount = await Post.countDocuments({ user: id, isArchived: false });
    } catch (_) {
      obj.postsCount = 0;
    }
    // Reconcile follower/following counts from the Follower collection
    try {
      const [actualFollowersCount, actualFollowingCount] = await Promise.all([
        Follower.countDocuments({ following: id }),
        Follower.countDocuments({ follower: id }),
      ]);
      obj.followersCount = actualFollowersCount;
      obj.followingCount = actualFollowingCount;
      // Also update the cached counts on the User document for consistency
      await User.findByIdAndUpdate(id, {
        $set: { followersCount: actualFollowersCount, followingCount: actualFollowingCount },
      });
    } catch (_) {
      // Fallback to stored counts if reconciliation fails
    }
    return obj;
  }

  /**
   * Get user by username.
   */
  async getByUsername(username) {
    const user = await User.findOne({ username: username.toLowerCase() }).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    const obj = _toPlain(user);
    // Attach real-time post count (non-critical — fail gracefully)
    try {
      obj.postsCount = await Post.countDocuments({ user: user._id, isArchived: false });
    } catch (_) {
      obj.postsCount = 0;
    }
    // Reconcile follower/following counts from the Follower collection
    try {
      const [actualFollowersCount, actualFollowingCount] = await Promise.all([
        Follower.countDocuments({ following: user._id }),
        Follower.countDocuments({ follower: user._id }),
      ]);
      obj.followersCount = actualFollowersCount;
      obj.followingCount = actualFollowingCount;
      // Also update the cached counts on the User document for consistency
      await User.findByIdAndUpdate(user._id, {
        $set: { followersCount: actualFollowersCount, followingCount: actualFollowingCount },
      });
    } catch (_) {
      // Fallback to stored counts if reconciliation fails
    }
    return obj;
  }

  /**
   * Update user profile fields.
   */
  async updateProfile(userId, updates) {
    const allowedFields = ['name', 'bio', 'avatar', 'website', 'isPrivate', 'username'];
    const filtered = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filtered[field] = updates[field];
      }
    }

    // If updating username, check uniqueness
    if (filtered.username) {
      const cleanUsername = filtered.username.toLowerCase().trim();
      const existing = await User.findOne({
        username: cleanUsername,
        _id: { $ne: userId },
      });
      if (existing) {
        throw new ApiError(409, 'Username is already taken');
      }
      filtered.username = cleanUsername;
    }

    const user = await User.findByIdAndUpdate(userId, filtered, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Audit: log account changes (non-critical)
    const changedFields = Object.keys(filtered);
    if (changedFields.length > 0) {
      try {
        await auditService.logAccountEvent({
          eventType: changedFields.includes('username') ? 'USERNAME_CHANGED' : 'PROFILE_UPDATED',
          actor: { _id: userId, role: user.role },
          target: { _id: userId, username: user.username },
          changes: changedFields,
        });
      } catch (_) { /* audit logging is non-critical */ }
    }

    return user;
  }

  /**
   * Update avatar URL for a user.
   */
  async updateAvatar(userId, avatarUrl) {
    const user = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true, runValidators: true },
    ).select('-password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Audit: log avatar change (non-critical)
    try {
      await auditService.logAccountEvent({
        eventType: 'AVATAR_CHANGED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['avatar'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    return user;
  }

  /**
   * Search users by name or username.
   * Optionally excludes blocked users if viewerId is provided.
   */
  async search(query, limit = 20, viewerId = null) {
    if (!query || query.trim() === '') {
      return [];
    }

    // Escape regex special characters to prevent NoSQL injection
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const filter = {
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
      ],
    };

    // Exclude blocked users from search results
    if (viewerId) {
      const blockService = require('./block.service');
      const excludedIds = await blockService.getExcludedIds(viewerId);
      if (excludedIds.length > 0) {
        filter._id = { $nin: excludedIds };
      }
    }

    const users = await User.find(filter)
      .select('name username avatar bio isVerified reputationBadge')
      .limit(Math.min(limit, 50));

    return users;
  }
}

module.exports = new UserService();
