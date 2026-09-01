/**
 * Verification Routes (Module 13)
 * ================================
 * POST /api/v1/verification/fact-check   — submit claims for fact-checking
 * GET  /api/v1/verification/:postId      — get fact-check results for a post
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { factCheck, getFactCheckByPostId } = require('../../controllers/v1/fact-check.controller');

// POST /api/v1/verification/fact-check
// Submit one or more claims for verification
router.post('/fact-check', protect, factCheck);

// GET /api/v1/verification/:postId
// Retrieve stored fact-check results for a post
router.get('/:postId', protect, getFactCheckByPostId);

module.exports = router;
