const likeService = require('../../services/like.service');

/**
 * POST /api/v1/posts/:id/like
 */
exports.toggleLike = async (req, res, next) => {
  try {
    const result = await likeService.toggle(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/posts/:id/like
 */
exports.removeLike = async (req, res, next) => {
  try {
    const result = await likeService.remove(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
