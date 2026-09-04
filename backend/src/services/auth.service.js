const bcrypt = require('bcryptjs');
const { firebaseAuth } = require('../config/firebase');
const User = require('../models/user.model');
const { ApiError } = require('../middleware/error.middleware');
const { generateToken } = require('../utils/generateToken');
const ageVerificationService = require('./age-verification/age-verification.service');
const auditService = require('./audit.service');

/**
 * Normalize an avatar URL supplied by the client (e.g. a Google photo
 * URL from Firebase Auth). Only http(s) URLs are accepted; anything else
 * is treated as "no avatar".
 */
function normalizeAvatar(avatar) {
  if (typeof avatar === 'string') {
    const trimmed = avatar.trim();
    if (/^https?:\/\/.+$/i.test(trimmed) && trimmed.length <= 2048) {
      return trimmed;
    }
  }
  return '';
}

class AuthService {
  // ─── Local (email/password) Registration ────────────────

  /**
   * Register a new user with email + password (stored in MongoDB only).
   *
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @param {string} params.name
   * @param {string} params.username
   */
  async registerLocal({ email, password, name, username }) {
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim();

    // ── Check if email already exists ──────────────────
    const existingByEmail = await User.findOne({ email: cleanEmail });
    if (existingByEmail) {
      throw new ApiError(409, 'An account already exists with this email');
    }

    // ── Check username availability ────────────────────
    const existingByUsername = await User.findOne({ username: cleanUsername });
    if (existingByUsername) {
      throw new ApiError(409, 'Username is already taken');
    }

    // ── Hash password and create user ──────────────────
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      authMethod: 'local',
      role: 'USER',
    });

    // ── Initiate age verification (PENDING) ─────────────
    let ageVerificationStatus = null;
    try {
      await ageVerificationService.initiate({ userId: user._id });
      ageVerificationStatus = 'PENDING';
    } catch (err) {
      console.error('[AuthService] Age verification initiation failed:', err.message);
    }

    // Audit
    try {
      await auditService.logAuthEvent({
        eventType: 'REGISTER_SUCCESS',
        user: { _id: user._id, username: user.username },
        outcome: 'SUCCESS',
      });
    } catch (_) { /* non-critical */ }

    const token = generateToken(user._id);

    return {
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
        reputationBadge: user.reputationBadge,
        overallTrustRating: user.overallTrustRating,
        ageVerificationStatus,
      },
    };
  }

  // ─── Local (email/password) Login ───────────────────────

  /**
   * Login an existing user with email/username + password (MongoDB only).
   *
   * @param {Object} params
   * @param {string} params.identifier - Email or username
   * @param {string} params.password
   */
  async loginLocal({ identifier, password }) {
    const clean = identifier.toLowerCase().trim();

    // ── Find user by email or username ─────────────────
    const user = await User.findOne({
      $or: [
        { email: clean },
        { username: clean },
      ],
    }).select('+password');

    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    if (user.isDisabled) {
      throw new ApiError(401, 'Account has been disabled');
    }

    // ── Verify password ────────────────────────────────
    if (!user.password) {
      throw new ApiError(
        401,
        'This account uses Google sign-in. Please use Continue with Google.'
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password');
    }

    // Audit
    try {
      await auditService.logAuthEvent({
        eventType: 'LOGIN_SUCCESS',
        user: { _id: user._id, username: user.username },
        outcome: 'SUCCESS',
      });
    } catch (_) { /* non-critical */ }

    const token = generateToken(user._id);

    return {
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isVerified: user.isVerified,
        reputationBadge: user.reputationBadge,
        overallTrustRating: user.overallTrustRating,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        ageVerificationStatus: user.ageVerificationStatus || null,
        ageCategory: user.ageCategory || null,
      },
    };
  }

  // ─── Firebase Registration (Google sign-in) ────────────

  /**
   * Register a new user via Firebase Authentication.
   *
   * Flow:
   *  1. Frontend creates a Firebase Auth user with email/password
   *  2. Frontend obtains a Firebase ID token
   *  3. Frontend sends the ID token + profile data here
   *  4. Backend verifies the token and creates the MongoDB user
   *
   * @param {Object} params
   * @param {string} params.idToken   - Firebase ID token
   * @param {string} params.name      - Display name
   * @param {string} params.username  - Unique username
   * @param {string} [params.avatar]  - Profile photo URL (e.g. Google photo)
   */
  async register({ idToken, name, username, avatar }) {
    // ── Verify Firebase ID token ────────────────────────
    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } catch (err) {
      if (err.code === 'auth/id-token-expired') {
        throw new ApiError(401, 'Token expired — please sign in again');
      }
      throw new ApiError(401, 'Invalid authentication token');
    }

    const firebaseUid = decoded.uid;
    const email = decoded.email || '';

    // ── Check if user already exists in MongoDB ─────────
    const existingByUid = await User.findOne({ firebaseUid });
    if (existingByUid) {
      throw new ApiError(409, 'Account already registered');
    }

    // ── Check username availability ─────────────────────
    const cleanUsername = username.toLowerCase().trim();
    const existingByUsername = await User.findOne({ username: cleanUsername });
    if (existingByUsername) {
      throw new ApiError(409, 'Username is already taken');
    }

    // ── Create MongoDB user ────────────────────────────
    const user = await User.create({
      firebaseUid,
      name: name.trim(),
      username: cleanUsername,
      email: email.toLowerCase().trim(),
      avatar: normalizeAvatar(avatar),
      authMethod: 'firebase',
      role: 'USER',
    });

    // ── Initiate age verification (PENDING) ──────────────
    let ageVerificationStatus = null;
    try {
      await ageVerificationService.initiate({ userId: user._id });
      ageVerificationStatus = 'PENDING';
    } catch (err) {
      // Age verification failure should not block account creation;
      // the user can retry later. Log and continue.
      console.error('[AuthService] Age verification initiation failed:', err.message);
    }

    // Audit: log successful registration (non-critical)
    try {
      await auditService.logAuthEvent({
        eventType: 'REGISTER_SUCCESS',
        user: { _id: user._id, username: user.username },
        outcome: 'SUCCESS',
      });
    } catch (_) { /* audit logging is non-critical */ }

    return {
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
        reputationBadge: user.reputationBadge,
        overallTrustRating: user.overallTrustRating,
        ageVerificationStatus,
      },
    };
  }

  // ─── Firebase Login (Google sign-in) ────────────────────

  /**
   * Login an existing user via Firebase Authentication.
   *
   * Flow:
   *  1. Frontend signs in via Firebase Auth SDK
   *  2. Frontend obtains a Firebase ID token
   *  3. Frontend sends the ID token here
   *  4. Backend verifies the token and returns the user profile
   *
   * @param {Object} params
   * @param {string} params.idToken - Firebase ID token
   * @param {string} [params.avatar] - Profile photo URL (e.g. Google photo);
   *   backfills the account's avatar when it doesn't have one yet.
   */
  async login({ idToken, avatar }) {
    // ── Verify Firebase ID token ────────────────────────
    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } catch (err) {
      if (err.code === 'auth/id-token-expired') {
        throw new ApiError(401, 'Token expired — please sign in again');
      }
      throw new ApiError(401, 'Invalid authentication token');
    }

    // ── Check disabled Firebase account ─────────────────
    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.getUser(decoded.uid);
    } catch (err) {
      // If Firebase is unreachable, still allow if the token was valid
      firebaseUser = null;
    }

    if (firebaseUser && firebaseUser.disabled) {
      try {
        await auditService.logAuthEvent({
          eventType: 'LOGIN_FAILURE',
          user: { _id: null, username: decoded.email || 'unknown' },
          outcome: 'FAILURE',
          reason: 'Account has been disabled in Firebase',
        });
      } catch (_) { /* audit logging is non-critical */ }
      throw new ApiError(401, 'Account has been disabled');
    }

    // ── Load MongoDB user ───────────────────────────────
    const user = await User.findOne({ firebaseUid: decoded.uid }).select('-password');

    if (!user) {
      try {
        await auditService.logAuthEvent({
          eventType: 'LOGIN_FAILURE',
          user: { _id: null, username: decoded.email || 'unknown' },
          outcome: 'FAILURE',
          reason: 'User profile not found in MongoDB',
        });
      } catch (_) { /* audit logging is non-critical */ }
      throw new ApiError(
        404,
        'User profile not found — please register first'
      );
    }

    if (user.isDisabled) {
      try {
        await auditService.logAuthEvent({
          eventType: 'LOGIN_FAILURE',
          user: { _id: user._id, username: user.username },
          outcome: 'FAILURE',
          reason: 'Account is disabled',
        });
      } catch (_) { /* audit logging is non-critical */ }
      throw new ApiError(401, 'Account has been disabled');
    }

    // Backfill the profile photo (Google photoURL) for accounts created
    // before avatar support was wired in. Never overwrites a photo the
    // user has already chosen themselves.
    const photo = normalizeAvatar(avatar);
    if (!user.avatar && photo) {
      user.avatar = photo;
      try {
        await user.save();
      } catch (_) { /* non-critical — the photo can be set on a later login */ }
    }

    // Audit: log successful login (non-critical)
    try {
      await auditService.logAuthEvent({
        eventType: 'LOGIN_SUCCESS',
        user: { _id: user._id, username: user.username },
        outcome: 'SUCCESS',
      });
    } catch (_) { /* audit logging is non-critical */ }

    return {
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isVerified: user.isVerified,
        reputationBadge: user.reputationBadge,
        overallTrustRating: user.overallTrustRating,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        ageVerificationStatus: user.ageVerificationStatus || null,
        ageCategory: user.ageCategory || null,
      },
    };
  }

  /**
   * Look up a user's email by username or return the email as-is.
   *
   * Used by the Flutter frontend when the user enters a username instead of
   * an email at the login screen. Firebase Auth requires an email to sign in,
   * so the frontend resolves the username to an email first.
   *
   * @param {Object} params
   * @param {string} params.identifier - Email or username
   */
  async lookupEmail({ identifier }) {
    const clean = identifier.toLowerCase().trim();

    // If it already looks like an email, return it directly
    if (clean.includes('@')) {
      return { email: clean };
    }

    // Otherwise, look up by username
    const user = await User.findOne({ username: clean }).select('email');
    if (!user) {
      throw new ApiError(404, 'No account found with that username');
    }

    return { email: user.email };
  }

  /**
   * Get the current user profile from the authenticated request.
   *
   * @param {string} userId - MongoDB user _id (set by requireAuth middleware)
   */
  async getMe(userId) {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  }
}

module.exports = new AuthService();
