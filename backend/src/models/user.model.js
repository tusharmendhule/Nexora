const mongoose = require('mongoose');

const ROLES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
};

const userSchema = new mongoose.Schema(
  {
    // Firebase Authentication UID — primary identifier
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    // Kept for legacy routes — Firebase users won't have this populated
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
      default: 75,
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
