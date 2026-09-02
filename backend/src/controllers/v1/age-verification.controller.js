/**
 * Age Verification Controller (Module 18 — V1)
 *
 * Endpoints:
 *   POST /api/v1/age-verification/initiate   — Start verification
 *   GET  /api/v1/age-verification/status      — Check current status
 *   POST /api/v1/age-verification/retry       — Retry after failure
 */

const ageVerificationService = require('../../services/age-verification/age-verification.service');

/**
 * POST /api/v1/age-verification/initiate
 *
 * Start age verification for the authenticated user.
 * Requires: Authorization header with valid Firebase token.
 */
exports.initiate = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await ageVerificationService.initiate({ userId });

    res.status(200).json({
      success: true,
      message: 'Age verification initiated',
      data: {
        verificationId: result.verificationId,
        status: result.status,
        ageCategory: result.ageCategory || null,
        sessionUrl: result.sessionUrl || null,
      },
    });
  } catch (error) {
    if (error.message === 'Age verification provider is currently unavailable') {
      return res.status(503).json({
        success: false,
        message: 'Age verification service is temporarily unavailable. Please try again later.',
      });
    }
    next(error);
  }
};

/**
 * GET /api/v1/age-verification/status
 *
 * Get the current age verification status for the authenticated user.
 */
exports.getStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await ageVerificationService.getStatus({ userId });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/age-verification/retry
 *
 * Retry a failed age verification.
 */
exports.retry = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await ageVerificationService.retry({ userId });

    res.status(200).json({
      success: true,
      message: 'Age verification retry initiated',
      data: {
        verificationId: result.verificationId,
        status: result.status,
        sessionUrl: result.sessionUrl || null,
      },
    });
  } catch (error) {
    if (error.message && error.message.includes('Maximum retry attempts')) {
      return res.status(429).json({
        success: false,
        message: 'Maximum retry attempts exceeded. Please contact support.',
      });
    }
    if (
      error.message && (
        error.message.includes('already completed') ||
        error.message.includes('requires manual review')
      )
    ) {
      return res.status(409).json({
        success: false,
        message: 'Verification already completed or requires manual review.',
      });
    }
    if (error.message === 'Age verification provider is currently unavailable') {
      return res.status(503).json({
        success: false,
        message: 'Age verification service is temporarily unavailable. Please try again later.',
      });
    }
    next(error);
  }
};
