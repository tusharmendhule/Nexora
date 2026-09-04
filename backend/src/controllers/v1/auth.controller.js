const authService = require('../../services/auth.service');

// ─── Local Auth (email/password → MongoDB only) ──────────

/**
 * POST /api/v1/auth/register-local
 *
 * Register a new user with email + password (stored in MongoDB only, no Firebase).
 * Body: { email, password, name, username }
 */
exports.registerLocal = async (req, res, next) => {
  try {
    const { email, password, name, username } = req.body;

    if (!email || !password || !name || !username) {
      return res.status(400).json({
        success: false,
        message: 'All fields (email, password, name, username) are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const result = await authService.registerLocal({ email, password, name, username });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/login-local
 *
 * Login with email/username + password (MongoDB only, no Firebase).
 * Body: { identifier, password }
 */
exports.loginLocal = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username and password are required',
      });
    }

    const result = await authService.loginLocal({ identifier, password });

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Firebase Auth (Google sign-in) ─────────────────────

/**
 * POST /api/v1/auth/register
 *
 * Register a new user via Firebase Authentication.
 * Body: { idToken, name, username, avatar? }
 */
exports.register = async (req, res, next) => {
  try {
    const { idToken, name, username, avatar } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required',
      });
    }

    if (!name || !username) {
      return res.status(400).json({
        success: false,
        message: 'Name and username are required',
      });
    }

    const result = await authService.register({ idToken, name, username, avatar });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/login
 *
 * Login an existing user via Firebase Authentication.
 * Body: { idToken, avatar? }
 */
exports.login = async (req, res, next) => {
  try {
    const { idToken, avatar } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required',
      });
    }

    const result = await authService.login({ idToken, avatar });

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/lookup-email
 *
 * Resolve a username to an email address for the Firebase login flow.
 * Body: { identifier }
 */
exports.lookupEmail = async (req, res, next) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Identifier is required',
      });
    }

    const result = await authService.lookupEmail({ identifier });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 *
 * Get the current authenticated user's profile.
 * Requires: Authorization: Bearer <firebase_id_token>
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user._id);

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout
 *
 * Logout endpoint. Client-side Firebase sign-out is the primary mechanism;
 * this endpoint exists for consistency and any server-side cleanup.
 * Requires: Authorization: Bearer <firebase_id_token>
 */
exports.logout = async (req, res, _next) => {
  try {
    // Server-side token revocation (optional — Firebase handles this well)
    // For now, we just acknowledge the logout. The client should call
    // FirebaseAuth.signOut() to clear the local session.
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    _next(error);
  }
};
