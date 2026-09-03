const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getMe, updateMe, getUserById, updateAvatar } = require('../../controllers/v1/user.controller');
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { uploadImageOnly, uploadAvatar } = require('../../middleware/upload.middleware');
const User = require('../../models/user.model');
const Follower = require('../../models/follower.model');
const userService = require('../../services/user.service');
const blockService = require('../../services/block.service');

// ─── Profile routes ──────────────────────────────────────

// GET /api/v1/users/me
router.get('/me', protect, getMe);

// PATCH /api/v1/users/me
router.patch('/me', protect, updateMe);

// PATCH /api/v1/users/me/avatar
// Accepts multipart/form-data with an "avatar" file field
router.patch(
  '/me/avatar',
  protect,
  uploadImageOnly.single('avatar'),
  uploadAvatar,
  updateAvatar,
);

// PATCH /api/v1/users/me/password — change password
router.patch('/me/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only local auth users can change password
    if (user.authMethod !== 'local' || !user.password) {
      return res.status(400).json({
        success: false,
        message: 'Password change is only available for email/password accounts',
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/me/network — get current user's followers and following
router.get('/me/network', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const followers = await Follower.find({ following: userId })
      .populate('follower', 'username name avatar')
      .sort({ createdAt: -1 });

    const following = await Follower.find({ follower: userId })
      .populate('following', 'username name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      followersCount: followers.length,
      followingCount: following.length,
      followers: followers.map(f => f.follower),
      following: following.map(f => f.following),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Search ──────────────────────────────────────────────

// GET /api/v1/users/search?q=...
router.get('/search', protect, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim() === '') {
      return res.status(200).json({ success: true, users: [] });
    }

    const users = await userService.search(query, 20, req.user._id);
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/by-username/:username
router.get('/by-username/:username', protect, async (req, res) => {
  try {
    const user = await userService.getByUsername(req.params.username);

    const currentUserId = req.user._id;
    const targetUserId = user._id;

    // Block check: if either user has blocked the other, return 404
    const hasBlock = await blockService.hasAnyBlock(currentUserId, targetUserId);
    if (hasBlock) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Privacy check: if target is private and viewer is not following, restrict info
    const isFollowing = currentUserId.toString() !== targetUserId.toString()
      ? !!(await Follower.findOne({ follower: currentUserId, following: targetUserId }))
      : false;

    const result = typeof user.toObject === 'function' ? user.toObject() : user;
    result.isFollowing = isFollowing;

    // For private accounts viewed by non-followers, hide follower/following counts
    const isPrivate = await blockService.isPrivateAccount(targetUserId);
    if (isPrivate && !isFollowing && currentUserId.toString() !== targetUserId.toString()) {
      result.isPrivateRestricted = true;
    }

    res.status(200).json({ success: true, user: result });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── User by ID (must be after /search and /by-username) ──

// GET /api/v1/users/:id
router.get('/:id', protect, validateObjectId('id'), getUserById);

// ─── Block / Unblock ──────────────────────────────────────

// POST /api/v1/users/:id/block — block a user
router.post('/:id/block', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    const result = await blockService.blockUser(currentUserId, targetUserId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// POST /api/v1/users/:id/unblock — unblock a user
router.post('/:id/unblock', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    const result = await blockService.unblockUser(currentUserId, targetUserId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/v1/users/:id/is-blocked — check if current user has blocked target (or vice versa)
router.get('/:id/is-blocked', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    const hasBlock = await blockService.hasAnyBlock(currentUserId, targetUserId);
    res.status(200).json({ success: true, isBlocked: hasBlock });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/blocked — list users blocked by the current user
router.get('/blocked', protect, async (req, res) => {
  try {
    const blockedIds = await blockService.getBlockedIds(req.user._id);
    const users = await User.find({ _id: { $in: blockedIds } })
      .select('name username avatar isVerified reputationBadge');
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Follow / Unfollow ────────────────────────────────────

// POST /api/v1/users/:id/follow — toggle follow
router.post('/:id/follow', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Block check: cannot follow a blocked user (either direction)
    const hasBlock = await blockService.hasAnyBlock(currentUserId, targetUserId);
    if (hasBlock) {
      return res.status(400).json({ success: false, message: 'Cannot follow this user' });
    }

    const existingFollow = await Follower.findOne({ follower: currentUserId, following: targetUserId });

    if (existingFollow) {
      // Unfollow
      await Follower.findOneAndDelete({ follower: currentUserId, following: targetUserId });

      // Decrement counts
      await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: -1 } });
      await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: -1 } });

      return res.status(200).json({
        success: true,
        message: 'Unfollowed successfully',
        isFollowing: false,
      });
    } else {
      // Follow
      await Follower.create({ follower: currentUserId, following: targetUserId });

      // Increment counts
      await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: 1 } });
      await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: 1 } });

      // Notify the followed user (fire-and-forget)
      const notificationService = require('../../services/notification.service');
      notificationService.notifyNewFollower({
        recipientId: targetUserId,
        followerId: currentUserId,
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Followed successfully',
        isFollowing: true,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/users/:id/unfollow — explicit unfollow
router.post('/:id/unfollow', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    const existingFollow = await Follower.findOne({ follower: currentUserId, following: targetUserId });
    if (!existingFollow) {
      return res.status(200).json({ success: true, message: 'Not following', isFollowing: false });
    }

    await Follower.findOneAndDelete({ follower: currentUserId, following: targetUserId });
    await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: -1 } });

    res.status(200).json({ success: true, message: 'Unfollowed successfully', isFollowing: false });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/:id/is-following — check if current user follows target
router.get('/:id/is-following', protect, validateObjectId('id'), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(200).json({ success: true, isFollowing: false });
    }

    const follow = await Follower.findOne({ follower: currentUserId, following: targetUserId });
    res.status(200).json({ success: true, isFollowing: !!follow });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/:id/followers — list followers
router.get('/:id/followers', protect, validateObjectId('id'), async (req, res) => {
  try {
    const followers = await Follower.find({ following: req.params.id })
      .populate('follower', 'username name avatar isVerified reputationBadge')
      .sort({ createdAt: -1 });

    // Filter out blocked users from the list
    const currentUserId = req.user._id;
    const filtered = [];
    for (const f of followers) {
      const hasBlock = await blockService.hasAnyBlock(currentUserId, f.follower._id);
      if (!hasBlock) {
        filtered.push(f.follower);
      }
    }

    res.status(200).json({
      success: true,
      count: filtered.length,
      users: filtered,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/:id/following — list following
router.get('/:id/following', protect, validateObjectId('id'), async (req, res) => {
  try {
    const following = await Follower.find({ follower: req.params.id })
      .populate('following', 'username name avatar isVerified reputationBadge')
      .sort({ createdAt: -1 });

    // Filter out blocked users from the list
    const currentUserId = req.user._id;
    const filtered = [];
    for (const f of following) {
      const hasBlock = await blockService.hasAnyBlock(currentUserId, f.following._id);
      if (!hasBlock) {
        filtered.push(f.following);
      }
    }

    res.status(200).json({
      success: true,
      count: filtered.length,
      users: filtered,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
