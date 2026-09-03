const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  factCheckClaim,
  VerificationStatus,
  normalizeClaim,
} = require('../services/fact-check.service');

// ==========================================
// 1. QUERY CLAIM & FACT-CHECK SEARCH
// ==========================================
// @route   POST /api/fact-check/search
// @access  Private
router.post('/search', protect, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    // Delegate to the real fact-check service (handles caching, API calls,
    // retry logic, and error handling internally).
    const result = await factCheckClaim(query.trim());

    // Map the service result into the shape the legacy frontend expects.
    const reviews = result.reviews || [];
    const classifiedRatings = result.classifiedRatings || [];
    const ratings = reviews.map((r) => ({
      publisherName: r.publisher?.name || null,
      publisherSite: r.publisher?.site || null,
      url: r.url || null,
      title: r.title || null,
      rating: r.textualRating || null,
      reviewDate: r.reviewDate || null,
    }));

    // Build a claim-shaped result matching the legacy cache schema
    const claims = [
      {
        text: result.claimText || query.trim(),
        claimant: null,
        claimDate: null,
        factCheckRatings: ratings,
      },
    ];

    const statusCode = result.status === VerificationStatus.UNKNOWN && result.apiError
      ? (result.errorCode === 'RATE_LIMITED' ? 429 : 503)
      : 200;

    res.status(statusCode).json({
      success: true,
      source: result.source || 'api',
      query: normalizeClaim(query.trim()),
      results: claims,
      // Extra metadata from the real service
      status: result.status,
      matchCount: result.matchCount || 0,
      classifiedRatings,
      apiError: result.apiError || null,
      errorCode: result.errorCode || null,
      processingTimeMs: result.processingTimeMs || 0,
    });
  } catch (error) {
    console.error('[FactCheck] Legacy search error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;