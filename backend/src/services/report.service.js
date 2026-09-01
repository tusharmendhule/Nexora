const Report = require('../models/report.model');
const Post = require('../models/post.model');
const { ApiError } = require('../middleware/error.middleware');

class ReportService {
  /**
   * Create a report for a post.
   */
  async create(postId, userId, reason) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Check for duplicate report by same user
    const existingReport = await Report.findOne({
      reporter: userId,
      targetType: 'Post',
      targetId: postId,
    });

    if (existingReport) {
      throw new ApiError(409, 'You have already reported this post');
    }

    const report = await Report.create({
      reporter: userId,
      targetType: 'Post',
      targetId: postId,
      reason: reason.trim(),
    });

    return report.populate('reporter', 'name username');
  }

  /**
   * Get all reports (admin/moderator view).
   */
  async getAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const reports = await Report.find()
      .populate('reporter', 'name username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Report.countDocuments();

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get reports for a specific post.
   */
  async getByPost(postId) {
    const reports = await Report.find({ targetId: postId, targetType: 'Post' })
      .populate('reporter', 'name username')
      .sort({ createdAt: -1 });

    return reports;
  }
}

module.exports = new ReportService();
