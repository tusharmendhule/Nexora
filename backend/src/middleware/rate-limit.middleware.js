/**
 * Rate Limiting Middleware (Module 19 — Community Reporting)
 *
 * In-memory sliding-window rate limiter for abuse prevention.
 * Resets on server restart — acceptable for this use case since
 * rate limits are short-lived and the primary protection layer
 * is the duplicate-report index.
 *
 * For production with multiple instances, swap to Redis-backed
 * rate limiting (e.g. express-rate-limit + rate-limit-redis).
 */

const { ApiError } = require('./error.middleware');

// In-memory store: Map<key, { count, windowStart }>
const store = new Map();

// Periodic cleanup of expired windows (every 60 seconds)
const CLEANUP_INTERVAL = 60_000;
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > entry.windowMs) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Don't let the cleanup timer keep the process alive
  if (cleanupTimer.unref) cleanupTimer.unref();
}

startCleanup();

/**
 * Create a rate limiter middleware.
 *
 * @param {Object} opts
 * @param {number} opts.windowMs   — Time window in milliseconds (default: 15 min)
 * @param {number} opts.max        — Max requests per window (default: 10)
 * @param {string} opts.keyPrefix  — Prefix for the rate-limit key (default: 'rl')
 * @param {string} opts.message    — Custom error message
 * @returns {Function} Express middleware
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = 'rl',
  message = 'Too many requests. Please try again later.',
} = {}) {
  return (req, res, next) => {
    // Extract user ID or fall back to IP
    const userId =
      req.user?._id?.toString() ||
      req.user?.id?.toString() ||
      req.userId ||
      req.ip ||
      'anonymous';

    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      entry = { count: 1, windowStart: now, windowMs };
      store.set(key, entry);
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return next(
        new ApiError(429, message)
      );
    }

    next();
  };
}

/**
 * Pre-configured rate limiters for common use cases.
 */

/** Report creation: 5 reports per 15 minutes per user */
const reportRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:report:create',
  message: 'You are reporting too quickly. Please wait before submitting another report.',
});

/** Report listing: 30 requests per minute */
const reportListRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'rl:report:list',
  message: 'Too many requests. Please slow down.',
});

/** General API rate limit: 100 requests per 15 minutes per user/IP */
const generalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyPrefix: 'rl:general',
  message: 'Too many requests. Please try again later.',
});

/** Auth rate limit: 10 requests per 15 minutes per IP (login/register) */
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl:auth',
  message: 'Too many authentication attempts. Please try again later.',
});

module.exports = {
  createRateLimiter,
  reportRateLimit,
  reportListRateLimit,
  generalRateLimit,
  authRateLimit,
};
