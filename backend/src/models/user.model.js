const mongoose = require('mongoose');

const ROLES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
};

const userSchema = new mongoose.Schema(
  {
    // Firebase Authentication UID — set for Google sign-in users.
    // Not set for email/password-only users.
    // Firebase Authentication UID — set for Google sign-in users.
    // Not set for email/password-only users.
    // unique + sparse allows multiple local users (firebaseUid is undefined).
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Auth method: 'local' (email+password) or 'firebase' (Google etc.)
    authMethod: {
      type: String,
      enum: ['local', 'firebase'],
      default: 'firebase',
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Password hash — populated for local (email/password) users only.
    // Firebase-only users (Google sign-in) will not have this.
    password: {
      type: String,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxlength: 160,
    },
    website: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },

    // ─── Account Status ──────────────────────────────────
    // 'active'       — normal account
    // 'deactivated'  — user hid their account; can be reactivated
    // 'suspended'    — platform restriction (moderation)
    // 'restricted'   — limited account (moderation)
    // 'deleted'      — account deletion requested/completed
    accountStatus: {
      type: String,
      enum: ['active', 'deactivated', 'suspended', 'restricted', 'deleted'],
      default: 'active',
      index: true,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },

    // ─── Authorization ──────────────────────────────────
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
      required: true,
    },

    isDisabled: {
      type: Boolean,
      default: false,
    },

    // Modern Social & Credibility Badges
    isVerified: {
      type: Boolean,
      default: false,
    },
    reputationBadge: {
      type: String,
      enum: ['Verified Creator', 'Trusted Academic', 'Community Member', 'Under Review'],
      default: 'Community Member',
    },
    overallTrustRating: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    // ─── Age Verification (Module 18) ───────────────────
    // Only the result category is stored — never DOB, government IDs,
    // or biometric data.
    ageVerificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED', 'REQUIRES_REVIEW', null],
      default: null,
    },
    ageCategory: {
      type: String,
      enum: ['ADULT', 'TEEN', 'MINOR', 'UNKNOWN', null],
      default: null,
    },

    // Account Metrics
    followersCount: {
      type: Number,
      default: 0,
    },
    followingCount: {
      type: Number,
      default: 0,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Instance helper — safe role check
userSchema.methods.hasRole = function hasRole(...roles) {
  return roles.includes(this.role);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
