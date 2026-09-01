/**
 * Direct Link Analysis Controller
 * =================================
 * POST /api/v1/content/analyze-link
 *
 * Accepts a URL for analysis without requiring a post to exist.
 * Performs SSRF-safe fetching, metadata extraction, claim extraction,
 * fact verification, and returns structured results.
 * Optionally stores results in MongoDB if a postId is provided.
 */

const LinkAnalysis = require('../../models/link-analysis.model');
const linkAnalysisService = require('../../services/link-analysis.service');
const { ApiError } = require('../../middleware/error.middleware');

// -- Validation -----------------------------------------------------

/**
 * Validate the analyze-link request body.
 */
function validateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  if (!body.url || typeof body.url !== 'string' || body.url.trim().length === 0) {
    errors.push('url is required and must be a non-empty string');
  }

  if (body.url && typeof body.url === 'string') {
    const trimmed = body.url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      errors.push('url must be a valid HTTP(S) URL');
    }
    if (trimmed.length > 2048) {
      errors.push('url must not exceed 2048 characters');
    }
  }

  // postId is optional for standalone analysis
  if (body.postId !== undefined && body.postId !== null) {
    if (typeof body.postId !== 'string' || body.postId.trim().length === 0) {
      errors.push('postId must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);
  }

  return {
    url: body.url.trim(),
    postId: body.postId ? body.postId.trim() : null,
  };
}

// -- Controller -----------------------------------------------------

/**
 * POST /api/v1/content/analyze-link
 *
 * Direct link analysis. Input: { url, postId? }
 * Returns structured link content analysis results including:
 *   - URL validation and SSRF protection
 *   - Metadata extraction (title, OG tags, etc.)
 *   - Claim extraction and entity extraction
 *   - Fact verification results
 *   - Trust Score integration
 */
exports.analyzeLinkDirect = async (req, res, next) => {
  try {
    const { url, postId } = validateRequest(req.body);

    // Check if analysis already exists for this postId + URL
    if (postId) {
      const existing = await LinkAnalysis.findOne({
        post: postId,
        originalUrl: url,
        status: 'completed',
      }).sort({ createdAt: -1 });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Link analysis already exists for this post and URL',
          analysis: formatAnalysisResult(existing),
          cached: true,
        });
      }
    }

    // Run the full analysis pipeline
    const result = await linkAnalysisService.analyzeLinkDirect(
      url,
      postId,
      null // no content job for direct analysis
    );

    if (result.savedAnalysis) {
      res.status(200).json({
        success: result.results.success !== false,
        analysis: formatAnalysisResult(result.savedAnalysis),
        cached: false,
      });
    } else {
      res.status(200).json({
        success: result.results.success !== false,
        analysis: result.results,
        cached: false,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/content/analyze-link/:postId
 *
 * Retrieve stored link analysis results for a given post.
 */
exports.getAnalysisByPostId = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || !/^[0-9a-fA-F]{24}$/.test(postId)) {
      throw new ApiError(400, `Invalid postId: "${postId}"`);
    }

    const analysis = await LinkAnalysis.findOne({ post: postId })
      .sort({ createdAt: -1 });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'No link analysis results found for this post',
      });
    }

    res.status(200).json({
      success: true,
      analysis: formatAnalysisResult(analysis),
    });
  } catch (error) {
    next(error);
  }
};

// -- Helpers --------------------------------------------------------

function formatAnalysisResult(analysis) {
  return {
    id: analysis._id,
    post: analysis.post,
    originalUrl: analysis.originalUrl,
    resolvedUrl: analysis.resolvedUrl,
    httpStatus: analysis.httpStatus,
    redirectChain: analysis.redirectChain,
    pageTitle: analysis.pageTitle,
    metaDescription: analysis.metaDescription,
    ogTitle: analysis.ogTitle,
    ogDescription: analysis.ogDescription,
    ogImage: analysis.ogImage,
    ogType: analysis.ogType,
    ogSiteName: analysis.ogSiteName,
    keywords: analysis.keywords,
    canonicalUrl: analysis.canonicalUrl,
    language: analysis.language,
    extractedText: analysis.extractedText
      ? analysis.extractedText.substring(0, 500) + (analysis.extractedText.length > 500 ? '...' : '')
      : null,
    preprocessing: analysis.preprocessing,
    misinformationProbability: analysis.misinformationProbability,
    sourceCredibility: analysis.sourceCredibility,
    claims: analysis.claims,
    entities: analysis.entities,
    factCheckResults: analysis.factCheckResults,
    confidence: analysis.confidence,
    finalScore: analysis.finalScore,
    modelVersion: analysis.modelVersion,
    processingTimeMs: analysis.processingTimeMs,
    errors: analysis.errors,
    createdAt: analysis.createdAt,
  };
}
