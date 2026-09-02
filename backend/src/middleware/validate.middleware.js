const { ApiError } = require('./error.middleware');

/**
 * Validation helper: checks required fields exist in body.
 * @param {string[]} fields - Required field names
 * @returns {Function} Express middleware
 */
const requireFields = (fields) => {
  return (req, _res, next) => {
    const missing = fields.filter((f) => {
      const val = req.body[f];
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    });

    if (missing.length > 0) {
      return next(
        new ApiError(
          400,
          `Missing required fields: ${missing.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Validate MongoDB ObjectId format in params.
 * @param {string} paramName - The param to check (e.g., 'id')
 */
const validateObjectId = (paramName) => {
  return (req, _res, next) => {
    const value = req.params[paramName];
    if (!value || !/^[0-9a-fA-F]{24}$/.test(value)) {
      return next(new ApiError(400, `Invalid ${paramName}: "${value}"`));
    }
    next();
  };
};

/**
 * Sanitize and trim string fields in request body.
 */
const sanitizeBody = (fields) => {
  return (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (typeof req.body[field] === 'string') {
          req.body[field] = req.body[field].trim();
        }
      }
    }
    next();
  };
};

/**
 * Sanitize string inputs to prevent stored XSS.
 * Removes HTML tags and dangerous characters from user-provided strings.
 */
const sanitizeInput = (fields) => {
  return (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (typeof req.body[field] === 'string') {
          // Remove HTML tags, script content, and event handlers
          req.body[field] = req.body[field]
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+\s*=/gi, '') // Remove event handlers
            .trim();
        }
      }
    }
    next();
  };
};

/**
 * Escape regex special characters to prevent NoSQL injection.
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = { requireFields, validateObjectId, sanitizeBody, sanitizeInput, escapeRegex };
