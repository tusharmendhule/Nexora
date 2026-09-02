/**
 * Age Verification Routes (Module 18 — V1)
 *
 * All routes require authentication (Firebase ID token).
 *
 * POST /api/v1/age-verification/initiate   — Start verification
 * GET  /api/v1/age-verification/status      — Check current status
 * POST /api/v1/age-verification/retry       — Retry after failure
 */

const express = require('express');
const router = express.Router();
const {
  initiate,
  getStatus,
  retry,
} = require('../../controllers/v1/age-verification.controller');
const { protect } = require('../../middleware/auth.middleware');

// All age verification routes require authentication
router.use(protect);

// POST /api/v1/age-verification/initiate
router.post('/initiate', initiate);

// GET /api/v1/age-verification/status
router.get('/status', getStatus);

// POST /api/v1/age-verification/retry
router.post('/retry', retry);

module.exports = router;
