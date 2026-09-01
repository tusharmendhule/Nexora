const userService = require('../../services/user.service');

/**
 * GET /api/v1/users/me
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await userService.getById(req.user._id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/users/me
 */
exports.updateMe = async (req, res, next) => {
  try {
    const user = await userService.updateProfile(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/users/:id
 */
exports.getUserById = async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/users/me/avatar
 *
 * Upload and update the current user's avatar.
 * Expects multipart/form-data with an "avatar" field.
 * The uploadAvatar middleware attaches req.fileUrl with the Cloudinary URL.
 */
exports.updateAvatar = async (req, res, next) => {
  try {
    if (!req.fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    const user = await userService.updateAvatar(req.user._id, req.fileUrl);
    res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};
