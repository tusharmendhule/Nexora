const express = require('express');
const router = express.Router();
const { getMe, updateMe, getUserById, updateAvatar } = require('../../controllers/v1/user.controller');
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { uploadImageOnly, uploadAvatar } = require('../../middleware/upload.middleware');

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

// GET /api/v1/users/:id
router.get('/:id', protect, validateObjectId('id'), getUserById);

module.exports = router;
