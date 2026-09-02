const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Story = require('../models/story.model');
const Activity = require('../models/activity.model');
const Message = require('../models/message.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// GET GLOBAL PLATFORM METRICS
// ==========================================
// @desc    Get aggregated platform statistics
// @route   GET /api/analytics/dashboard
// @access  Private (Admin/System perspective)
router.get('/dashboard', protect, async (req, res) => {
  try {
    // 1. Core Platform Counts
    const totalUsers = await User.countDocuments();
    const totalStories = await Story.countDocuments();
    const totalActivities = await Activity.countDocuments();
    const totalMessages = await Message.countDocuments();

    // 2. Deep Engagement Analytics
    const allStories = await Story.find();
    let totalLikes = 0;
    let totalPollVotes = 0;
    let storiesWithPolls = 0;

    allStories.forEach(story => {
      totalLikes += story.likes ? story.likes.length : 0;
      
      if (story.poll && story.poll.options) {
        storiesWithPolls++;
        story.poll.options.forEach(opt => {
          totalPollVotes += opt.votes ? opt.votes.length : 0;
        });
      }
    });

    // 3. User Badge Achievements Breakdown
    const allUsers = await User.find().select('badges');
    let totalBadgesAwarded = 0;
    const badgeDistribution = {};

    allUsers.forEach(user => {
      if (user.badges) {
        totalBadgesAwarded += user.badges.length;
        user.badges.forEach(badge => {
          badgeDistribution[badge.title] = (badgeDistribution[badge.title] || 0) + 1;
        });
      }
    });

    res.status(200).json({
      success: true,
      timestamp: new Date(),
      platformHealth: {
        totalUsers,
        totalStories,
        totalMessages,
        totalLoggedEvents: totalActivities
      },
      engagementMetrics: {
        totalLikesAcrossPlatform: totalLikes,
        totalPollsCreated: storiesWithPolls,
        totalVotesCast: totalPollVotes,
        averageLikesPerStory: totalStories > 0 ? (totalLikes / totalStories).toFixed(2) : 0
      },
      gamificationStats: {
        totalBadgesAwarded,
        badgeDistribution
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;