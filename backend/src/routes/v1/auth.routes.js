const express = require('express');
const router = express.Router();
const {
  register,
  login,
  lookupEmail,
  getMe,
  logout,
} = require('../../controllers/v1/auth.controller');
const { protect } = require('../../middleware/auth.middleware');
const { authRateLimit } = require('../../middleware/rate-limit.middleware');

// ─── Public Routes (no auth required, rate limited) ─────

// POST /api/v1/auth/register
// Register a new user via Firebase Auth
router.post('/register', authRateLimit, register);

// POST /api/v1/auth/login
// Login via Firebase Auth
router.post('/login', authRateLimit, login);

// POST /api/v1/auth/lookup-email
// Resolve username → email for the Firebase login flow
router.post('/lookup-email', authRateLimit, lookupEmail);

// ─── Protected Routes (auth required) ──────────────────

// GET /api/v1/auth/me
// Get the current authenticated user's profile
router.get('/me', protect, getMe);

// POST /api/v1/auth/logout
// Logout (client should also call FirebaseAuth.signOut())
router.post('/logout', protect, logout);

module.exports = router;
