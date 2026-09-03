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

    const users = await userService.search(query);
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/users/by-username/:username
router.get('/by-username/:username', protect, async (req, res) => {
  try {
    const user = await userService.getByUsername(req.params.username);

    // Also check if the current user is following this user
    const currentUserId = req.user._id;
    const targetUserId = user._id;
    const isFollowing = currentUserId.toString() !== targetUserId.toString()
      ? !!(await Follower.findOne({ follower: currentUserId, following: targetUserId }))
      : false;

    const result = typeof user.toObject === 'function' ? user.toObject() : user;
    result.isFollowing = isFollowing;

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

    res.status(200).json({
      success: true,
      count: followers.length,
      users: followers.map(f => f.follower),
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

    res.status(200).json({
      success: true,
      count: following.length,
      users: following.map(f => f.following),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
