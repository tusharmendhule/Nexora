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
   * Update a user's phone number.
   */
  async updatePhone(userId, phone) {
    const clean = (phone || '').trim();

    // Basic E.164-ish validation: digits, +, spaces, dashes, parens
    if (!/^[+()\d\s-]{6,20}$/.test(clean)) {
      throw new ApiError(400, 'Please enter a valid phone number');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { phone: clean },
      { new: true, runValidators: true },
    ).select('-password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    try {
      await auditService.logAccountEvent({
        eventType: 'PHONE_CHANGED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['phone'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    return user;
  }

  /**
   * Update a user's email address.
   *
   * Local (email/password) users must confirm their current password.
   * Firebase (Google sign-in) users cannot change email through this API
   * because their sign-in identifier lives in Firebase Auth.
   */
  async updateEmail(userId, { newEmail, currentPassword }) {
    const cleanEmail = (newEmail || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new ApiError(400, 'Please enter a valid email address');
    }

    const existing = await User.findOne({
      email: cleanEmail,
      _id: { $ne: userId },
    });
    if (existing) {
      throw new ApiError(409, 'An account already exists with this email');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.authMethod === 'firebase' || !user.password) {
      throw new ApiError(
        400,
        'Email changes are not available for Google sign-in accounts. '
        + 'Contact support for help updating your email.'
      );
    }

    if (!currentPassword) {
      throw new ApiError(400, 'Enter your current password to change your email');
    }

    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ApiError(400, 'Current password is incorrect');
    }

    user.email = cleanEmail;
    await user.save();

    try {
      await auditService.logAccountEvent({
        eventType: 'EMAIL_CHANGED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['email'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    return _toPlain(await User.findById(userId).select('-password'));
  }

  /**
   * Get a user's account history (account-related audit records).
   */
  async getAccountHistory(userId, { limit = 50 } = {}) {
    const AuditLog = require('../models/audit-log.model');
    const { AUDIT_EVENT_CATEGORY } = AuditLog;

    const records = await AuditLog.find({
      category: AUDIT_EVENT_CATEGORY.ACCOUNT,
      $or: [{ actorId: userId }, { targetId: userId }],
    })
      .select('eventType description metadata createdAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100));

    return records.map((r) => _toPlain(r));
  }

  /**
   * Deactivate a user's account (temporary, reversible).
   */
  async deactivateAccount(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    user.accountStatus = 'deactivated';
    user.deactivatedAt = new Date();
    await user.save();

    try {
      await auditService.logAccountEvent({
        eventType: 'ACCOUNT_DEACTIVATED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['accountStatus'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    return _toPlain(await User.findById(userId).select('-password'));
  }

  /**
   * Reactivate a deactivated user's account.
   */
  async reactivateAccount(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.accountStatus !== 'deactivated') {
      throw new ApiError(400, 'Account is not deactivated');
    }

    user.accountStatus = 'active';
    user.deactivatedAt = null;
    await user.save();

    try {
      await auditService.logAccountEvent({
        eventType: 'ACCOUNT_REACTIVATED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['accountStatus'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    return _toPlain(await User.findById(userId).select('-password'));
  }

  /**
   * Permanently delete a user's account and related data.
   *
   * Removes the user's content and references so no orphaned data
   * points at a deleted user. Audit logs are immutable and remain
   * (privacy-preserving, they never store PII).
   */
  async deleteAccount(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const Post = require('../models/post.model');
    const Comment = require('../models/comment.model');
    const Like = require('../models/like.model');
    const SavedPost = require('../models/saved-post.model');
    const Follower = require('../models/follower.model');
    const Conversation = require('../models/conversation.model');
    const Message = require('../models/message.model');
    const Notification = require('../models/notification.model');
    const Reshare = require('../models/reshare.model');
    const Block = require('../models/block.model');
    const Settings = require('../models/settings.model');
    const Activity = require('../models/activity.model');
    const Highlight = require('../models/highlight.model');
    const Story = require('../models/story.model');
    const Report = require('../models/report.model');

    // Log before deletion (audit logs are immutable, so this must happen first)
    try {
      await auditService.logAccountEvent({
        eventType: 'ACCOUNT_DELETED',
        actor: { _id: userId, role: user.role },
        target: { _id: userId, username: user.username },
        changes: ['account'],
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Conversations the user participates in → delete conversation + its messages
    const conversations = await Conversation.find({ participants: userId }).select('_id');
    const conversationIds = conversations.map((c) => c._id);
    if (conversationIds.length > 0) {
      await Message.deleteMany({ conversation: { $in: conversationIds } });
      await Conversation.deleteMany({ _id: { $in: conversationIds } });
    }

    await Promise.all([
      Post.deleteMany({ user: userId }),
      Comment.deleteMany({ user: userId }),
      Like.deleteMany({ user: userId }),
      SavedPost.deleteMany({ user: userId }),
      Reshare.deleteMany({ user: userId }),
      Follower.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
      Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] }),
      Block.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] }),
      Settings.deleteMany({ user: userId }),
      Activity.deleteMany({ user: userId }),
      Highlight.deleteMany({ user: userId }),
      Story.deleteMany({ user: userId }),
      Report.deleteMany({ reporter: userId }),
    ]);

    await User.findByIdAndDelete(userId);

    return { deleted: true };
  }

  /**
   * Build a JSON data export for the authenticated user.
   * Only includes data belonging to the user.
   */
  async exportData(userId) {
    const Post = require('../models/post.model');
    const Comment = require('../models/comment.model');
    const Like = require('../models/like.model');
    const SavedPost = require('../models/saved-post.model');
    const Follower = require('../models/follower.model');
    const Conversation = require('../models/conversation.model');
    const Message = require('../models/message.model');
    const Notification = require('../models/notification.model');
    const Settings = require('../models/settings.model');

    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const [
      posts,
      comments,
      likes,
      savedPosts,
      followers,
      following,
      conversations,
      messages,
      notifications,
      settings,
      history,
    ] = await Promise.all([
      Post.find({ user: userId }).lean(),
      Comment.find({ user: userId }).lean(),
      Like.find({ user: userId }).lean(),
      SavedPost.find({ user: userId }).lean(),
      Follower.find({ following: userId }).select('follower').lean(),
      Follower.find({ follower: userId }).select('following').lean(),
      Conversation.find({ participants: userId }).lean(),
      Message.find({ $or: [{ sender: userId }, { recipient: userId }] }).lean(),
      Notification.find({ recipient: userId }).lean(),
      Settings.findOne({ user: userId }).lean(),
      this.getAccountHistory(userId, { limit: 100 }),
    ]);

    // Resolve follower/following usernames (privacy-safe: names only)
    const followerIds = followers.map((f) => f.follower);
    const followingIds = following.map((f) => f.following);
    const [followerUsers, followingUsers] = await Promise.all([
      User.find({ _id: { $in: followerIds } }).select('username name').lean(),
      User.find({ _id: { $in: followingIds } }).select('username name').lean(),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: _toPlain(user),
      posts,
      comments,
      likes,
      savedPosts,
      followers: followerUsers,
      following: followingUsers,
      conversations,
      messages,
      notifications,
      settings: settings || null,
      accountHistory: history,
    };
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
