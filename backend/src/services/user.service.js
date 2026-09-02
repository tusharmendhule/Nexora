const User = require('../models/user.model');
const { ApiError } = require('../middleware/error.middleware');
const auditService = require('./audit.service');

class UserService {
  /**
   * Get user by ID.
   */
  async getById(id) {
    const user = await User.findById(id).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  }

  /**
   * Get user by username.
   */
  async getByUsername(username) {
    const user = await User.findOne({ username: username.toLowerCase() }).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
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
   */
  async search(query, limit = 20) {
    if (!query || query.trim() === '') {
      return [];
    }

    // Escape regex special characters to prevent NoSQL injection
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
      ],
    })
      .select('name username avatar bio isVerified reputationBadge')
      .limit(Math.min(limit, 50));

    return users;
  }
}

module.exports = new UserService();
