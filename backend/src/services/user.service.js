const User = require('../models/user.model');
const { ApiError } = require('../middleware/error.middleware');

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

    return user;
  }

  /**
   * Search users by name or username.
   */
  async search(query, limit = 20) {
    if (!query || query.trim() === '') {
      return [];
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
      ],
    })
      .select('name username avatar bio isVerified reputationBadge')
      .limit(limit);

    return users;
  }
}

module.exports = new UserService();
