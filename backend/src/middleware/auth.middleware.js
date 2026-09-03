const { firebaseAuth } = require('../config/firebase');
const { verifyToken } = require('../utils/generateToken');
const User = require('../models/user.model');
const { ApiError } = require('./error.middleware');

/**
 * requireAuth
 *
 * Verifies the bearer token sent as `Authorization: Bearer <token>`.
 * Supports two token types:
 *   1. Firebase ID token — for Google sign-in users
 *   2. JWT token — for email/password (local) users
 *
 * On success attaches the MongoDB user document to `req.user`.
 *
 * Handles:
 *  - Missing token          → 401
 *  - Invalid / malformed    → 401
 *  - Expired token          → 401
 *  - Disabled account       → 401
 *  - User deleted from DB   → 401
 */
const requireAuth = async (req, _res, next) => {
  try {
    // ── Extract token ──────────────────────────────────
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(new ApiError(401, 'Not authorized — no token provided'));
    }
    const token = header.split(' ')[1];
    if (!token) {
      return next(new ApiError(401, 'Not authorized — no token provided'));
    }

    let user = null;

    // ── Try Firebase ID token first ────────────────────
    try {
      const decoded = await firebaseAuth.verifyIdToken(token);

      // Check disabled Firebase account
      let firebaseUser;
      try {
        firebaseUser = await firebaseAuth.getUser(decoded.uid);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          return next(new ApiError(401, 'Not authorized — user no longer exists'));
        }
        firebaseUser = null;
      }

      if (firebaseUser && firebaseUser.disabled) {
        return next(new ApiError(401, 'Account has been disabled'));
      }

      // Load MongoDB user by Firebase UID
      user = await User.findOne({ firebaseUid: decoded.uid }).select('-password');
    } catch (firebaseErr) {
      // Not a valid Firebase token — try as JWT next
      if (
        firebaseErr.code === 'auth/id-token-expired' ||
        firebaseErr.code === 'auth/id-token-revoked'
      ) {
        return next(new ApiError(401, 'Not authorized — token expired'));
      }
    }

    // ── If not found via Firebase, try as JWT token ─────
    if (!user) {
      try {
        const decoded = verifyToken(token);
        user = await User.findById(decoded.id).select('-password');
      } catch (jwtErr) {
        // Neither Firebase nor JWT — truly invalid
        return next(new ApiError(401, 'Not authorized — invalid token'));
      }
    }

    if (!user) {
      return next(new ApiError(401, 'Not authorized — user profile not found'));
    }

    if (user.isDisabled) {
      return next(new ApiError(401, 'Account has been disabled'));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(401, 'Not authorized'));
  }
};

module.exports = { requireAuth };

// Keep the legacy `protect` export so existing routes don't break during migration
module.exports.protect = requireAuth;
