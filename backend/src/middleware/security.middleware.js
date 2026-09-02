/**
 * Security Headers Middleware (Module 23)
 * ========================================
 * Lightweight security headers without requiring helmet dependency.
 * Sets headers that protect against common attacks:
 *   - XSS, clickjacking, MIME sniffing, cache leakage, referrer leakage
 */

/**
 * Set security headers on every response.
 * Lightweight replacement for helmet — no external dependency needed.
 */
const securityHeaders = (req, res, next) => {
  // Prevent browser from MIME-sniffing responses away from declared content type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking — page cannot be embedded in iframes
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable browser XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Permissions policy — disable unused browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Strict transport security (HSTS) — tell browsers to use HTTPS
  // Only effective when served over HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Remove potentially dangerous headers
  res.removeHeader('X-Powered-By');

  next();
};

module.exports = securityHeaders;
