const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { sanitizeBody } = require('../../middleware/validate.middleware');
const { upload, uploadMedia } = require('../../middleware/upload.middleware');

// Post controllers
const {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
} = require('../../controllers/v1/post.controller');

// Upload controllers
const { uploadMedia: uploadMediaController } = require('../../controllers/v1/upload.controller');

// Like controllers
const { toggleLike, removeLike } = require('../../controllers/v1/like.controller');

// Comment controllers
const {
  createComment,
  getComments,
} = require('../../controllers/v1/comment.controller');

// Report controllers
const { createReport } = require('../../controllers/v1/report.controller');

// ─── Upload routes ─────────────────────────────────────

// POST /api/v1/posts/upload — upload media file to Cloudinary
router.post('/upload', protect, upload.single('file'), uploadMedia, uploadMediaController);

// ─── POST routes ───────────────────────────────────────

// POST /api/v1/posts
router.post('/', protect, sanitizeBody(['text']), createPost);

// GET /api/v1/posts
router.get('/', protect, getPosts);

// GET /api/v1/posts/:id
router.get('/:id', protect, validateObjectId('id'), getPostById);

// PATCH /api/v1/posts/:id
router.patch('/:id', protect, validateObjectId('id'), sanitizeBody(['text']), updatePost);

// DELETE /api/v1/posts/:id
// Owner can delete their own posts; MODERATOR and ADMIN can delete any post
router.delete('/:id', protect, validateObjectId('id'), deletePost);

// ─── Like routes ───────────────────────────────────────

// POST /api/v1/posts/:id/like
router.post('/:id/like', protect, validateObjectId('id'), toggleLike);

// DELETE /api/v1/posts/:id/like
router.delete('/:id/like', protect, validateObjectId('id'), removeLike);

// ─── Comment routes ────────────────────────────────────

// POST /api/v1/posts/:id/comments
router.post('/:id/comments', protect, validateObjectId('id'), sanitizeBody(['text']), createComment);

// GET /api/v1/posts/:id/comments
router.get('/:id/comments', protect, validateObjectId('id'), getComments);

// ─── Report routes ─────────────────────────────────────

// POST /api/v1/posts/:id/report
router.post('/:id/report', protect, validateObjectId('id'), sanitizeBody(['reason']), createReport);

module.exports = router;
