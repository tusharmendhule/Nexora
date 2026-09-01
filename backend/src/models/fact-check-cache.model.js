const mongoose = require('mongoose');

const factCheckCacheSchema = new mongoose.Schema(
  {
    queryText: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    claimResults: [
      {
        text: String,
        claimant: String,
        claimDate: Date,
        factCheckRatings: [
          {
            publisherName: String,
            publisherSite: String,
            url: String,
            title: String,
            rating: String
          }
        ]
      }
    ],
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

// Auto-delete expired cache documents from MongoDB
factCheckCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FactCheckCache', factCheckCacheSchema);