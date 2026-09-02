const commentService = require('../../services/comment.service');

/**
 * POST /api/v1/posts/:id/comments
 */
exports.createComment = async (req, res, next) => {
  try {
    const { text, parentCommentId } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required',
      });
    }

    const comment = await commentService.create(
      req.params.id,
      req.user._id,
      text,
      parentCommentId
    );

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/posts/:id/comments
 */
exports.getComments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const result = await commentService.getByPost(req.params.id, page, limit);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/comments/:id
 *
 * Owner can delete their own comments.
 * MODERATOR and ADMIN can delete any comment.
 */
exports.deleteComment = async (req, res, next) => {
  try {
    const result = await commentService.delete(
      req.params.id,
      req.user._id,
      req.user.role
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
