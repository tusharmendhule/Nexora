const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Activity = require('../models/activity.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. SEARCH USERS BY NAME / HANDLE
// ==========================================
// @route   GET /api/users/search
// @access  Private
router.get('/search', protect, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim() === '') {
      return res.status(200).json({ success: true, users: [] });
    }

    // Escape regex special characters to prevent NoSQL injection
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { handle: { $regex: escaped, $options: 'i' } }
      ]
    }).select('name avatar handle status badge followers following');

    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. GET CURRENT USER PROFILE
// ==========================================
// @route   GET /api/users/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const user = await User.findById(currentUserId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 3. GET USER PROFILE BY ID
// ==========================================
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('followers', 'name avatar handle')
      .populate('following', 'name avatar handle');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 4. UPDATE USER PROFILE & STATUS
// ==========================================
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;
    const { name, bio, avatar, status } = req.body;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name;
    if (bio) user.bio = bio;
    if (avatar) user.avatar = avatar;
    if (status) {
      user.status = {
        text: status.text || user.status?.text || '',
        emoji: status.emoji || user.status?.emoji || '',
        updatedAt: new Date()
      };
    }

    await user.save();
    res.status(200).json({ success: true, message: 'Profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 5. FOLLOW / UNFOLLOW A USER
// ==========================================
// @route   POST /api/users/:id/follow
// @access  Private
router.post('/:id/follow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (targetUserId.toString() === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      // --- UNFOLLOW ---
      currentUser.following = currentUser.following.filter(id => id.toString() !== targetUserId.toString());
      targetUser.followers = targetUser.followers.filter(id => id.toString() !== currentUserId.toString());

      await currentUser.save();
      await targetUser.save();

      return res.status(200).json({
        success: true,
        message: `Unfollowed ${targetUser.name}`,
        isFollowing: false,
        followersCount: targetUser.followers.length
      });
    } else {
      // --- FOLLOW ---
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);

      await currentUser.save();
      await targetUser.save();

      // Trigger Notification Activity
      await Activity.create({
        user: targetUserId,
        type: 'USER_FOLLOWED',
        metadata: { text: `${currentUser.name} started following you!` }
      });

      return res.status(200).json({
        success: true,
        message: `Followed ${targetUser.name}`,
        isFollowing: true,
        followersCount: targetUser.followers.length
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 6. GET FOLLOWERS & FOLLOWING NETWORK
// ==========================================
// @route   GET /api/users/:id/network
// @access  Private
router.get('/:id/network', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('followers', 'name avatar handle status')
      .populate('following', 'name avatar handle status');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      followersCount: user.followers.length,
      followingCount: user.following.length,
      followers: user.followers,
      following: user.following
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;