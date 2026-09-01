/**
 * Content Pipeline Routes
 * =======================
 * POST /api/v1/content/analyze/:postId   - trigger analysis
 * POST /api/v1/content/analyze-text      - direct text analysis
 * GET  /api/v1/content/analyze-text/:postId - get analysis by postId
 * GET  /api/v1/content/analyze-text/health  - AI service health check
 * POST /api/v1/content/analyze-link      - direct link analysis (Module 11)
 * GET  /api/v1/content/analyze-link/:postId - get link analysis by postId
 * GET  /api/v1/content/jobs/:jobId       - job status
 * GET  /api/v1/content/jobs/post/:postId - all jobs for a post
 * GET  /api/v1/content/analysis/:postId  - analysis results
 * GET  /api/v1/content/queue/status      - queue health
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');

const {
  triggerAnalysis,
  getJobStatus,
  getJobsForPost,
  getAnalysisResults,
  getQueueStatus,
} = require('../../controllers/v1/content.controller');

const {
  analyzeTextDirect,
  getAnalysisByPostId,
  checkAIServiceHealth,
} = require('../../controllers/v1/text-analysis.controller');

const {
  analyzeVideoDirect,
  getAnalysisByPostId: getVideoAnalysisByPostId,
} = require('../../controllers/v1/video-analysis.controller');

const {
  analyzeAudioDirect,
  getAnalysisByPostId: getAudioAnalysisByPostId,
} = require('../../controllers/v1/audio-analysis.controller');

const {
  analyzeLinkDirect,
  getAnalysisByPostId: getLinkAnalysisByPostId,
} = require('../../controllers/v1/link-analysis.controller');

const {
  extractClaimsDirect,
  getExtractionByPostId: getClaimExtractionByPostId,
} = require('../../controllers/v1/claim-entity.controller');

// ─── Direct Text Analysis ─────────────────────────────────────────────

// POST /api/v1/content/analyze-text
// Direct text analysis without requiring a post to exist first
router.post('/analyze-text', protect, analyzeTextDirect);

// ─── Direct Video Analysis ─────────────────────────────────────────────

// POST /api/v1/content/analyze-video
// Direct video deepfake/manipulation analysis
router.post('/analyze-video', protect, analyzeVideoDirect);

// GET /api/v1/content/analyze-video/:postId
// Get stored video analysis results by postId
router.get(
  '/analyze-video/:postId',
  protect,
  validateObjectId('postId'),
  getVideoAnalysisByPostId
);

// ─── Direct Audio Analysis ─────────────────────────────────────────────

// POST /api/v1/content/analyze-audio
// Direct audio synthetic speech / manipulation analysis
router.post('/analyze-audio', protect, analyzeAudioDirect);

// GET /api/v1/content/analyze-audio/:postId
// Get stored audio analysis results by postId
router.get(
  '/analyze-audio/:postId',
  protect,
  validateObjectId('postId'),
  getAudioAnalysisByPostId
);

// ─── Direct Claim & Entity Extraction (Module 12) ───────────────────

// POST /api/v1/content/extract-claims
// Direct claim and entity extraction from text
router.post('/extract-claims', protect, extractClaimsDirect);

// GET /api/v1/content/extract-claims/:postId
// Get stored claim/entity extraction results by postId
router.get(
  '/extract-claims/:postId',
  protect,
  validateObjectId('postId'),
  getClaimExtractionByPostId
);

// ─── Direct Link Analysis ─────────────────────────────────────────────

// POST /api/v1/content/analyze-link
// Direct link content analysis (SSRF-safe fetch, metadata, claims, fact-check)
router.post('/analyze-link', protect, analyzeLinkDirect);

// GET /api/v1/content/analyze-link/:postId
// Get stored link analysis results by postId
router.get(
  '/analyze-link/:postId',
  protect,
  validateObjectId('postId'),
  getLinkAnalysisByPostId
);

// GET /api/v1/content/analyze-text/health
// Check if the Python AI service is reachable (must be before :postId routes)
router.get('/analyze-text/health', protect, checkAIServiceHealth);

// GET /api/v1/content/analyze-text/:postId
// Get stored analysis results by postId
router.get(
  '/analyze-text/:postId',
  protect,
  validateObjectId('postId'),
  getAnalysisByPostId
);

// ─── Content Pipeline ─────────────────────────────────────────────────

// POST /api/v1/content/analyze/:postId
// Trigger content analysis for a post
router.post(
  '/analyze/:postId',
  protect,
  validateObjectId('postId'),
  triggerAnalysis
);

// GET /api/v1/content/jobs/:jobId
// Get status of a specific processing job
router.get('/jobs/:jobId', protect, getJobStatus);

// GET /api/v1/content/jobs/post/:postId
// Get all jobs for a post
router.get(
  '/jobs/post/:postId',
  protect,
  validateObjectId('postId'),
  getJobsForPost
);

// GET /api/v1/content/analysis/:postId
// Get stored analysis results for a post
router.get(
  '/analysis/:postId',
  protect,
  validateObjectId('postId'),
  getAnalysisResults
);

// GET /api/v1/content/queue/status
// Queue health (admin)
router.get('/queue/status', protect, getQueueStatus);

module.exports = router;
