const reshareService = require('../../services/reshare.service');

/**
 * POST /api/v1/posts/:id/reshare
 */
exports.toggleReshare = async (req, res, next) => {
  try {
    const result = await reshareService.toggle(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/posts/:id/reshare
 */
exports.removeReshare = async (req, res, next) => {
  try {
    const result = await reshareService.remove(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};