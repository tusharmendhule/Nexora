const User = require("../models/User");
const Notification = require("../models/Notification");

// @desc    Follow or Unfollow a user + Auto Notifications
// @route   PUT /api/users/follow/:id
// @access  Private
const toggleFollowUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    // 1. Prevent users from following themselves
    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: "You cannot follow yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 2. Check if already following
    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      // Unfollow: Remove target user from current user's 'following' array
      currentUser.following = currentUser.following.filter(
        (id) => id.toString() !== targetUserId
      );
      // Remove current user from target user's 'followers' array
      targetUser.followers = targetUser.followers.filter(
        (id) => id.toString() !== currentUserId
      );

      await currentUser.save();
      await targetUser.save();

      return res.status(200).json({ success: true, message: "Unfollowed successfully" });
    } else {
      // Follow: Add target user to current user's 'following' array
      currentUser.following.push(targetUserId);
      // Add current user to target user's 'followers' array
      targetUser.followers.push(currentUserId);

      await currentUser.save();
      await targetUser.save();
      
      // 🚀 AUTOMATION PIPELINE: Create a notification document for the receiver
      await Notification.create({
        receiver: targetUserId,  // The person being followed (e.g., Bobby)
        sender: currentUserId,   // The active user clicking follow (e.g., Tester)
        type: "follow"
      });

      return res.status(200).json({ success: true, message: "Followed successfully" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get user profile details
// @route   GET /api/users/profile/:id
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password") // Do not expose password hashes
      .populate("followers", "name avatar")
      .populate("following", "name avatar");

    if (!user) {
      return res.status(404).json({ success: false, message: "User profile not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  toggleFollowUser,
  getUserProfile
};