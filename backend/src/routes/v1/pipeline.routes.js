/**
 * Pipeline Routes (Module 17)
 * ===========================
 * GET  /api/v1/pipeline/:postId           — pipeline status for a post
 * GET  /api/v1/pipeline/:postId/history   — pipeline run history
 * GET  /api/v1/pipeline/stats             — pipeline statistics (admin)
 * GET  /api/v1/pipeline/stages            — list of pipeline stages
 * POST /api/v1/pipeline/retry/:postId     — re-trigger pipeline for a failed post
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');

const {
  getPipelineStatus,
  getPipelineHistory,
  getPipelineStats,
  retryPipeline,
  getPipelineStages,
} = require('../../controllers/v1/pipeline.controller');

// GET /api/v1/pipeline/stages
// List all pipeline stages (requires auth)
router.get('/stages', protect, getPipelineStages);

// GET /api/v1/pipeline/stats
// Pipeline statistics (admin monitoring)
router.get('/stats', protect, getPipelineStats);

// GET /api/v1/pipeline/:postId
// Get current pipeline status for a post
router.get('/:postId', protect, validateObjectId('postId'), getPipelineStatus);

// GET /api/v1/pipeline/:postId/history
// Get pipeline run history for a post
router.get('/:postId/history', protect, validateObjectId('postId'), getPipelineHistory);

// POST /api/v1/pipeline/retry/:postId
// Re-trigger pipeline for a failed/rejected post
router.post('/retry/:postId', protect, validateObjectId('postId'), retryPipeline);

module.exports = router;
