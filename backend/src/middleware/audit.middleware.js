/**
 * Audit Middleware (Module 21)
 * ===========================
 * Middleware for intercepting and logging security-sensitive operations.
 *
 * This middleware:
 *   - Attaches request context (IP, user agent) to req.auditContext
 *   - Provides helper functions for controllers/services to log events
 *   - Does NOT block requests — audit logging is always non-blocking
 *
 * Usage in controllers:
 *   const { auditContext } = req;
 *   await auditService.logAuthEvent({ ..., request: auditContext });
 */

const auditService = require('../services/audit.service');

/**
 * Audit context middleware.
 * Attaches request metadata to req.auditContext for use by downstream handlers.
 * Does NOT perform any logging itself — it only prepares context.
 */
const auditContext = (req, _res, next) => {
  req.auditContext = {
    ip: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers?.['user-agent'] || null,
    requestId: req.headers?.['x-request-id'] || null,
  };
  next();
};

/**
 * Helper: Extract client IP from request.
 * Handles Express 4.x and 5.x, plus proxy headers.
 */
function getClientIp(req) {
  // Trust proxy setting in Express
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
}

module.exports = { auditContext, getClientIp };
