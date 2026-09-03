/**
 * Analyze Routes
 * ==============
 * POST /api/v1/analyze/video       — submit video for async analysis
 * GET  /api/v1/analyze/video/:jobId — poll analysis status/results
 * POST /api/v1/analyze/audio       — submit audio for async analysis
 * GET  /api/v1/analyze/audio/:jobId — poll audio analysis status/results
 * POST /api/v1/analyze/link        — submit link for async analysis (Module 11)
 * GET  /api/v1/analyze/link/:jobId  — poll link analysis status/results
 *
 * These are standalone endpoints separate from the content pipeline.
 * Heavy processing runs in the background; the client polls for results.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');

const {
  submitVideoAnalysis,
  getVideoAnalysisStatus,
} = require('../../controllers/v1/analyze-video.controller');

const {
  submitAudioAnalysis,
  getAudioAnalysisStatus,
} = require('../../controllers/v1/analyze-audio.controller');

const {
  submitLinkAnalysis,
  getLinkAnalysisStatus,
} = require('../../controllers/v1/analyze-link.controller');

const {
  submitClaimEntityExtraction,
  getClaimEntityStatus,
} = require('../../controllers/v1/claim-entity.controller');

const {
  submitImageAnalysis,
  getImageAnalysisStatus,
} = require('../../controllers/v1/analyze-image.controller');

// POST /api/v1/analyze/image
// Accepts { mediaUrl, postId? }, returns { jobId } immediately
router.post('/image', protect, submitImageAnalysis);

// GET /api/v1/analyze/image/:jobId
// Returns processing status and results when complete
router.get('/image/:jobId', protect, getImageAnalysisStatus);

// POST /api/v1/analyze/video
// Accepts { mediaUrl, postId? }, returns { jobId } immediately
router.post('/video', protect, submitVideoAnalysis);

// GET /api/v1/analyze/video/:jobId
// Returns processing status and results when complete
router.get('/video/:jobId', protect, getVideoAnalysisStatus);

// POST /api/v1/analyze/audio
// Accepts { mediaUrl, postId? }, returns { jobId } immediately
router.post('/audio', protect, submitAudioAnalysis);

// GET /api/v1/analyze/audio/:jobId
// Returns processing status and results when complete
router.get('/audio/:jobId', protect, getAudioAnalysisStatus);

// POST /api/v1/analyze/link
// Accepts { url, postId? }, returns { jobId } immediately
router.post('/link', protect, submitLinkAnalysis);

// GET /api/v1/analyze/link/:jobId
// Returns processing status and results when complete
router.get('/link/:jobId', protect, getLinkAnalysisStatus);

// ─── Claim & Entity Extraction (Module 12) ────────────────────────────

// POST /api/v1/analyze/claims-entities
// Accepts { text, postId? }, returns { jobId } immediately
router.post('/claims-entities', protect, submitClaimEntityExtraction);

// GET /api/v1/analyze/claims-entities/:jobId
// Returns processing status and results when complete
router.get('/claims-entities/:jobId', protect, getClaimEntityStatus);

module.exports = router;
