const express = require('express');
const router = express.Router();
const Follower = require('../models/follower.model');
const User = require('../models/user.model');
const { protect } = require('../middleware/auth.middleware');
const notificationService = require('../services/notification.service');

// ==========================================
// 1. FOLLOW A USER
// ==========================================
// @route   POST /api/users/:id/follow
// @access  Private
router.post('/:id/follow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const existingFollow = await Follower.findOne({ follower: currentUserId, following: targetUserId });
    if (existingFollow) {
      return res.status(400).json({ success: false, message: 'Already following this user' });
    }

    await Follower.create({ follower: currentUserId, following: targetUserId });

    // Update counts
    await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: 1 } });

    // Notify the followed user (fire-and-forget)
    notificationService.notifyNewFollower({
      recipientId: targetUserId,
      followerId: currentUserId,
    }).catch(() => {});

    res.status(200).json({ success: true, message: 'User followed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. UNFOLLOW A USER
// ==========================================
// @route   POST /api/users/:id/unfollow
// @access  Private
router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const existingFollow = await Follower.findOne({ follower: currentUserId, following: targetUserId });
    if (!existingFollow) {
      return res.status(200).json({ success: true, message: 'Not following', isFollowing: false });
    }

    await Follower.findOneAndDelete({ follower: currentUserId, following: targetUserId });

    // Update counts
    await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: -1 } });

    res.status(200).json({ success: true, message: 'User unfollowed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 3. GET FOLLOWERS LIST
// ==========================================
// @route   GET /api/users/:id/followers
// @access  Private
router.get('/:id/followers', protect, async (req, res) => {
  try {
    const followers = await Follower.find({ following: req.params.id }).populate('follower', 'username name avatar');
    res.status(200).json({ success: true, count: followers.length, followers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 4. GET FOLLOWING LIST
// ==========================================
// @route   GET /api/users/:id/following
// @access  Private
router.get('/:id/following', protect, async (req, res) => {
  try {
    const following = await Follower.find({ follower: req.params.id }).populate('following', 'username name avatar');
    res.status(200).json({ success: true, count: following.length, following });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;