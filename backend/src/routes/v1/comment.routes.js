const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { deleteComment } = require('../../controllers/v1/comment.controller');

// DELETE /api/v1/comments/:id
router.delete('/:id', protect, validateObjectId('id'), deleteComment);

module.exports = router;
