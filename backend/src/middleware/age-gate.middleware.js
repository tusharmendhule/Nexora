/**
 * Age Gate Middleware (Module 18)
 *
 * Blocks access for users who have not completed age verification,
 * have failed verification, or whose verification has expired.
 *
 * Usage:
 *   router.get('/some-route', protect, requireAgeVerification, handler);
 *
 * Users with status VERIFIED and a valid (non-expired) verification
 * are allowed through. All others receive a 403.
 *
 * The user's ageVerificationStatus and ageCategory are attached to
 * req.userAgeVerification for downstream handlers.
 */

const AgeVerification = require('../models/age-verification.model');
const { AGE_VERIFICATION_STATUS } = require('../models/age-verification.model');

/**
 * Middleware that requires a verified age verification record.
 *
 * @param {Object} req  - Express request (req.user must be set by protect middleware)
 * @param {Object} res  - Express response
 * @param {Function} next - Next middleware
 */
async function requireAgeVerification(req, res, next) {
  try {
    // req.user is set by the protect (requireAuth) middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const userId = req.user._id;

    // Find the most recent verification record
    const verification = await AgeVerification.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    // No verification attempted at all
    if (!verification) {
      return res.status(403).json({
        success: false,
        message: 'Age verification required',
        code: 'AGE_VERIFICATION_REQUIRED',
        data: {
          status: 'NOT_STARTED',
        },
      });
    }

    // Check if verified and not expired
    if (verification.status === AGE_VERIFICATION_STATUS.VERIFIED) {
      if (verification.expiresAt && verification.expiresAt < new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Age verification has expired — please verify again',
          code: 'AGE_VERIFICATION_EXPIRED',
          data: {
            status: 'EXPIRED',
          },
        });
      }

      // Verified and valid — attach info and pass through
      req.userAgeVerification = {
        status: verification.status,
        ageCategory: verification.ageCategory,
        verifiedAt: verification.verifiedAt,
      };
      return next();
    }

    // All other states block access
    const statusMessages = {
      [AGE_VERIFICATION_STATUS.PENDING]:
        'Age verification is in progress — please complete the verification',
      [AGE_VERIFICATION_STATUS.FAILED]:
        'Age verification failed — please retry or contact support',
      [AGE_VERIFICATION_STATUS.REQUIRES_REVIEW]:
        'Age verification requires review — please wait for a decision',
    };

    return res.status(403).json({
      success: false,
      message: statusMessages[verification.status] || 'Age verification required',
      code: `AGE_VERIFICATION_${verification.status}`,
      data: {
        status: verification.status,
        canRetry: verification.canRetry(),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware that requires the user to be an adult (18+).
 * Must be used after requireAgeVerification.
 */
function requireAdult(req, res, next) {
  if (!req.userAgeVerification) {
    return res.status(403).json({
      success: false,
      message: 'Age verification required',
      code: 'AGE_VERIFICATION_REQUIRED',
    });
  }

  if (req.userAgeVerification.ageCategory !== 'ADULT') {
    return res.status(403).json({
      success: false,
      message: 'This feature requires you to be 18 or older',
      code: 'AGE_RESTRICTED',
      data: {
        ageCategory: req.userAgeVerification.ageCategory,
      },
    });
  }

  next();
}

module.exports = { requireAgeVerification, requireAdult };
