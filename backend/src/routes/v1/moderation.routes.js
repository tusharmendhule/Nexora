/**
 * Moderation Routes (Module 20 — V1)
 *
 * All routes require authentication + MODERATOR or ADMIN role.
 * Label override is restricted to ADMIN only.
 *
 * POST /api/v1/moderation/posts          — List flagged posts (use GET)
 * GET  /api/v1/moderation/posts          — List flagged posts
 * GET  /api/v1/moderation/posts/:id      — Inspect post details
 * POST /api/v1/moderation/posts/:id/approve
 * POST /api/v1/moderation/posts/:id/reject
 * POST /api/v1/moderation/posts/:id/override-label  (ADMIN only)
 * POST /api/v1/moderation/posts/:id/flag
 * POST /api/v1/moderation/posts/:id/remove
 * POST /api/v1/moderation/posts/:id/restore
 * POST /api/v1/moderation/reports/:id/resolve
 * POST /api/v1/moderation/reports/:id/dismiss
 * GET  /api/v1/moderation/logs
 * GET  /api/v1/moderation/posts/:id/logs
 * GET  /api/v1/moderation/stats
 * GET  /api/v1/moderation/actions
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const { sanitizeBody } = require('../../middleware/validate.middleware');
const {
  getFlaggedPosts,
  inspectPost,
  approvePost,
  rejectPost,
  overrideLabel,
  flagForReview,
  removeContent,
  restoreContent,
  resolveReport,
  dismissReport,
  getLogs,
  getLogsForPost,
  getStats,
  getActions,
} = require('../../controllers/v1/moderation.controller');

// ─── All routes require auth + MODERATOR or ADMIN ────────
router.use(protect, requireRole('MODERATOR', 'ADMIN'));

// ─── Posts ──────────────────────────────────────────────

// GET /api/v1/moderation/posts — list flagged posts
router.get('/posts', getFlaggedPosts);

// GET /api/v1/moderation/posts/:id — inspect post details
router.get('/posts/:id', validateObjectId('id'), inspectPost);

// POST /api/v1/moderation/posts/:id/approve
router.post(
  '/posts/:id/approve',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  approvePost
);

// POST /api/v1/moderation/posts/:id/reject
router.post(
  '/posts/:id/reject',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  rejectPost
);

// POST /api/v1/moderation/posts/:id/override-label (ADMIN only)
router.post(
  '/posts/:id/override-label',
  validateObjectId('id'),
  requireRole('ADMIN'),
  sanitizeBody(['reason', 'label']),
  overrideLabel
);

// POST /api/v1/moderation/posts/:id/flag
router.post(
  '/posts/:id/flag',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  flagForReview
);

// POST /api/v1/moderation/posts/:id/remove
router.post(
  '/posts/:id/remove',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  removeContent
);

// POST /api/v1/moderation/posts/:id/restore
router.post(
  '/posts/:id/restore',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  restoreContent
);

// GET /api/v1/moderation/posts/:id/logs — audit logs for a post
router.get('/posts/:id/logs', validateObjectId('id'), getLogsForPost);

// ─── Reports ────────────────────────────────────────────

// POST /api/v1/moderation/reports/:id/resolve
router.post(
  '/reports/:id/resolve',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  resolveReport
);

// POST /api/v1/moderation/reports/:id/dismiss
router.post(
  '/reports/:id/dismiss',
  validateObjectId('id'),
  sanitizeBody(['reason']),
  dismissReport
);

// ─── Logs & Stats ───────────────────────────────────────

// GET /api/v1/moderation/logs
router.get('/logs', getLogs);

// GET /api/v1/moderation/stats
router.get('/stats', getStats);

// GET /api/v1/moderation/actions
router.get('/actions', getActions);

module.exports = router;
