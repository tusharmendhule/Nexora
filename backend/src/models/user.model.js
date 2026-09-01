const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    avatar: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: '',
      maxlength: 160
    },
    website: {
      type: String,
      default: ''
    },

    // Modern Social & Credibility Badges
    isVerified: {
      type: Boolean,
      default: false
    },
    reputationBadge: {
      type: String,
      enum: ['Verified Creator', 'Trusted Academic', 'Community Member', 'Under Review'],
      default: 'Community Member'
    },
    overallTrustRating: {
      type: Number,
      default: 75, // Scaled 0 to 100 based on historical post trust scores
      min: 0,
      max: 100
    },

    // Account Metrics
    followersCount: {
      type: Number,
      default: 0
    },
    followingCount: {
      type: Number,
      default: 0
    },
    isPrivate: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);