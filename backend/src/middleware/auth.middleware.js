const firebaseAdmin = require('../config/firebase');
const User = require('../models/user.model');
const { ApiError } = require('./error.middleware');

/**
 * requireAuth
 *
 * Verifies the Firebase ID token sent as `Authorization: Bearer <token>`.
 * On success attaches the MongoDB user document to `req.user`.
 *
 * Handles:
 *  - Missing token          → 401
 *  - Invalid / malformed    → 401
 *  - Expired token          → 401
 *  - Disabled Firebase account → 401
 *  - User deleted from DB   → 401
 */
const requireAuth = async (req, _res, next) => {
  try {
    // ── Extract token ──────────────────────────────────
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(new ApiError(401, 'Not authorized — no token provided'));
    }
    const idToken = header.split(' ')[1];
    if (!idToken) {
      return next(new ApiError(401, 'Not authorized — no token provided'));
    }

    // ── Verify Firebase ID token ───────────────────────
    let decoded;
    try {
      decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    } catch (err) {
      if (err.code === 'auth/id-token-expired') {
        return next(new ApiError(401, 'Not authorized — token expired'));
      }
      if (err.code === 'auth/id-token-revoked') {
        return next(new ApiError(401, 'Not authorized — token revoked'));
      }
      return next(new ApiError(401, 'Not authorized — invalid token'));
    }

    // ── Check disabled Firebase account ────────────────
    let firebaseUser;
    try {
      firebaseUser = await firebaseAdmin.auth().getUser(decoded.uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return next(new ApiError(401, 'Not authorized — user no longer exists'));
      }
      // If we can't reach Firebase, still allow if the token was valid
      firebaseUser = null;
    }

    if (firebaseUser && firebaseUser.disabled) {
      return next(new ApiError(401, 'Account has been disabled'));
    }

    // ── Load / sync MongoDB user ───────────────────────
    let user = await User.findOne({ firebaseUid: decoded.uid }).select('-password');

    if (!user) {
      // Token is valid but no matching MongoDB record — user may have been
      // deleted from the database while still existing in Firebase.
      return next(new ApiError(401, 'Not authorized — user profile not found'));
    }

    if (user.isDisabled) {
      return next(new ApiError(401, 'Account has been disabled'));
    }

    req.user = user;
    next();
  } catch (error) {
    // Catch-all for unexpected errors
    return next(new ApiError(401, 'Not authorized'));
  }
};

module.exports = { requireAuth };

// Keep the legacy `protect` export so existing routes don't break during migration
module.exports.protect = requireAuth;
