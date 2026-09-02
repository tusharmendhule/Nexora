/**
 * Audit Routes (Module 21 — V1)
 * ==============================
 * Admin-only endpoints for querying audit logs.
 *
 * GET /api/v1/audit/logs                  — List logs (filtered)
 * GET /api/v1/audit/logs/user/:userId     — Logs for a specific user
 * GET /api/v1/audit/logs/post/:postId     — Logs for a specific post
 * GET /api/v1/audit/security-summary      — Security event summary
 * GET /api/v1/audit/event-types           — Valid event types (for UI)
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const {
  getLogs,
  getLogsForUser,
  getLogsForPost,
  getSecuritySummary,
  getEventTypes,
} = require('../../controllers/v1/audit.controller');

// All audit routes require ADMIN role
router.use(protect, requireRole('ADMIN'));

// GET /api/v1/audit/logs — list logs with filtering
router.get('/logs', getLogs);

// GET /api/v1/audit/logs/user/:userId — logs for a user
router.get('/logs/user/:userId', validateObjectId('userId'), getLogsForUser);

// GET /api/v1/audit/logs/post/:postId — logs for a post
router.get('/logs/post/:postId', validateObjectId('postId'), getLogsForPost);

// GET /api/v1/audit/security-summary — admin dashboard stats
router.get('/security-summary', getSecuritySummary);

// GET /api/v1/audit/event-types — valid event types for UI
router.get('/event-types', getEventTypes);

module.exports = router;
