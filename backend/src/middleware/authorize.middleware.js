const { ApiError } = require('./error.middleware');

/**
 * requireRole(...roles)
 *
 * Must be used AFTER `requireAuth`. Checks that `req.user.role` is one of the
 * specified roles.  Returns 403 if the user's role is not permitted.
 *
 * @example
 *   router.get('/reports', requireAuth, requireRole('MODERATOR', 'ADMIN'), handler);
 */
const requireRole = (...roles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          `Not authorized — requires one of: ${roles.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * authorizeOwner(getOwnerId)
 *
 * Checks that `req.user` owns the resource.
 * `getOwnerId` is a function that extracts the owner ID from the request.
 *
 * @example
 *   router.delete('/:id', requireAuth, authorizeOwner((req) => req.post.user), handler);
 */
const authorizeOwner = (getOwnerId) => {
  return (req, _res, next) => {
    const userId = req.user?._id?.toString();
    const ownerId =
      typeof getOwnerId === 'function' ? getOwnerId(req) : req.resourceOwner?.toString();

    if (!userId || !ownerId) {
      return next(new ApiError(403, 'Not authorized'));
    }

    if (userId !== ownerId) {
      return next(
        new ApiError(403, 'You do not have permission to perform this action')
      );
    }

    next();
  };
};

module.exports = { requireRole, authorizeOwner };

// Legacy export kept for backward compatibility
module.exports.authorizeRole = requireRole;
