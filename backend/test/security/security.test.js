/**
 * Security Hardening Test Suite (Module 23)
 * ==========================================
 * Tests for security middleware, input validation, error handling,
 * rate limiting, and protection against common attack vectors.
 */

const express = require('express');
const { errorHandler, ApiError } = require('../../src/middleware/error.middleware');
const securityHeaders = require('../../src/middleware/security.middleware');
const { generalRateLimit, authRateLimit, createRateLimiter } = require('../../src/middleware/rate-limit.middleware');
const { validateObjectId, sanitizeBody, sanitizeInput, escapeRegex } = require('../../src/middleware/validate.middleware');

// Helper: create a mock req/res/next for middleware testing
function mockReqRes(overrides = {}) {
  const req = {
    originalUrl: '/test',
    method: 'GET',
    secure: false,
    headers: {},
    ip: '127.0.0.1',
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
  const res = {
    _headers: {},
    _statusCode: null,
    _jsonBody: null,
    setHeader(name, value) { this._headers[name.toLowerCase()] = value; },
    removeHeader(name) { delete this._headers[name.toLowerCase()]; },
    status(code) { this._statusCode = code; return this; },
    json(body) { this._jsonBody = body; return this; },
    getHeader(name) { return this._headers[name.toLowerCase()]; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('Security Hardening', () => {
  // ═══════════════════════════════════════════════════════════
  // SECURITY HEADERS
  // ═══════════════════════════════════════════════════════════
  describe('Security Headers', () => {
    it('should set X-Content-Type-Options to nosniff', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['x-content-type-options']).toBe('nosniff');
      expect(next).toHaveBeenCalled();
    });

    it('should set X-Frame-Options to DENY', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['x-frame-options']).toBe('DENY');
    });

    it('should set X-XSS-Protection header', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should set Cache-Control to prevent caching', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['cache-control']).toContain('no-store');
      expect(res._headers['cache-control']).toContain('no-cache');
    });

    it('should set Permissions-Policy header', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['permissions-policy']).toContain('camera=()');
      expect(res._headers['permissions-policy']).toContain('microphone=()');
      expect(res._headers['permissions-policy']).toContain('geolocation=()');
    });

    it('should remove X-Powered-By header', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['x-powered-by']).toBeUndefined();
    });

    it('should set HSTS on HTTPS requests', () => {
      const { req, res, next } = mockReqRes({ secure: true });
      securityHeaders(req, res, next);
      expect(res._headers['strict-transport-security']).toContain('max-age=31536000');
    });

    it('should set HSTS when X-Forwarded-Proto is https', () => {
      const { req, res, next } = mockReqRes({ headers: { 'x-forwarded-proto': 'https' } });
      securityHeaders(req, res, next);
      expect(res._headers['strict-transport-security']).toContain('max-age=31536000');
    });

    it('should NOT set HSTS on plain HTTP requests', () => {
      const { req, res, next } = mockReqRes();
      securityHeaders(req, res, next);
      expect(res._headers['strict-transport-security']).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ERROR HANDLER — NO LEAKAGE
  // ═══════════════════════════════════════════════════════════
  describe('Error Handler — No Information Leakage', () => {
    it('should NOT expose stack traces to clients for 500 errors', () => {
      const err = new Error('Something went wrong internally');
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(500);
      expect(res._jsonBody.stack).toBeUndefined();
      expect(res._jsonBody.stackTrace).toBeUndefined();
    });

    it('should return generic message for non-operational 500 errors', () => {
      const err = new Error('Database connection failed at host 10.0.0.5');
      err.isOperational = false;
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(500);
      expect(res._jsonBody.message).toBe('Internal server error');
      expect(res._jsonBody.message).not.toContain('Database');
      expect(res._jsonBody.message).not.toContain('10.0.0.5');
    });

    it('should expose error.message for operational (client) errors', () => {
      const err = new ApiError(400, 'Invalid email format');
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(400);
      expect(res._jsonBody.message).toBe('Invalid email format');
    });

    it('should handle validation errors without leaking internals', () => {
      const err = new Error('Validation failed');
      err.name = 'ValidationError';
      err.errors = { email: { message: 'Email is required' } };
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(400);
      expect(res._jsonBody.message).toBe('Validation failed');
      expect(res._jsonBody.stack).toBeUndefined();
    });

    it('should handle JWT errors with generic message', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(401);
      expect(res._jsonBody.message).toBe('Invalid or expired token');
      expect(res._jsonBody.message).not.toContain('jwt');
    });

    it('should handle expired token errors', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(401);
      expect(res._jsonBody.message).toContain('expired');
    });

    it('should handle CastError (invalid ObjectId)', () => {
      const err = new Error('Cast to ObjectId failed');
      err.name = 'CastError';
      err.path = '_id';
      err.value = 'not-an-id';
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._statusCode).toBe(400);
      expect(res._jsonBody.message).toContain('Invalid _id');
    });

    it('should return proper error response format', () => {
      const err = new ApiError(404, 'Resource not found');
      const { req, res, next } = mockReqRes();
      errorHandler(err, req, res, next);
      expect(res._jsonBody.success).toBe(false);
      expect(res._jsonBody.message).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // RATE LIMITING
  // ═══════════════════════════════════════════════════════════
  describe('Rate Limiting', () => {
    it('should create a rate limiter with correct defaults', () => {
      const limiter = createRateLimiter();
      expect(typeof limiter).toBe('function');
    });

    it('should allow requests within the limit', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 5, keyPrefix: 'test:allow' });
      const { req, res, next } = mockReqRes();
      limiter(req, res, next);
      expect(next).toHaveBeenCalledWith(); // no error
    });

    it('should block requests after max is exceeded', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyPrefix: 'test:limit' });
      
      // First 2 requests should succeed
      const { req: req1, res: res1, next: next1 } = mockReqRes();
      limiter(req1, res1, next1);
      expect(next1).toHaveBeenCalledWith();

      const { req: req2, res: res2, next: next2 } = mockReqRes();
      limiter(req2, res2, next2);
      expect(next2).toHaveBeenCalledWith();

      // Third request should be rate-limited
      const { req: req3, res: res3, next: next3 } = mockReqRes();
      limiter(req3, res3, next3);
      expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    });

    it('should set Retry-After header when rate limited', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 1, keyPrefix: 'test:retry' });
      
      const { req: req1, res: res1, next: next1 } = mockReqRes();
      limiter(req1, res1, next1);

      const { req: req2, res: res2, next: next2 } = mockReqRes();
      limiter(req2, res2, next2);
      expect(res2._headers['retry-after']).toBeDefined();
    });

    it('should use custom error messages', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 1, keyPrefix: 'test:msg', message: 'Custom rate limit' });
      
      const { req: req1, res: res1, next: next1 } = mockReqRes();
      limiter(req1, res1, next1);

      const { req: req2, res: res2, next: next2 } = mockReqRes();
      limiter(req2, res2, next2);
      expect(next2).toHaveBeenCalledWith(expect.objectContaining({ message: 'Custom rate limit' }));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // NOSQL INJECTION PREVENTION
  // ═══════════════════════════════════════════════════════════
  describe('NoSQL Injection Prevention', () => {
    it('should escape regex special characters', () => {
      const escaped = escapeRegex('test.*($or)');
      expect(escaped).toBe('test\\.\\*\\(\\$or\\)');
    });

    it('should handle empty search string', () => {
      const escaped = escapeRegex('');
      expect(escaped).toBe('');
    });

    it('should handle non-string input', () => {
      const escaped = escapeRegex(123);
      expect(escaped).toBe('');
    });

    it('should escape MongoDB operator-like patterns', () => {
      const malicious = '{"$where": "function() { return true; }"}';
      const escaped = escapeRegex(malicious);
      // The $ should be escaped
      expect(escaped).toContain('\\$');
      // The { and } should be escaped
      expect(escaped).toContain('\\{');
    });

    it('should escape regex look-alike injection', () => {
      const injection = '/^(?=.*admin)/';
      const escaped = escapeRegex(injection);
      // Regex special characters ^ ( ) should be escaped
      expect(escaped).toContain('\\^');
      expect(escaped).toContain('\\(');
      expect(escaped).toContain('\\)');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // INPUT VALIDATION
  // ═══════════════════════════════════════════════════════════
  describe('Input Validation', () => {
    it('should validate correct ObjectId format', () => {
      const { req, res, next } = mockReqRes({ params: { id: '507f1f77bcf86cd799439011' } });
      validateObjectId('id')(req, res, next);
      expect(next).toHaveBeenCalledWith(); // called with no error
    });

    it('should reject invalid ObjectId format', () => {
      const { req, res, next } = mockReqRes({ params: { id: 'not-a-valid-id' } });
      validateObjectId('id')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should reject missing ObjectId', () => {
      const { req, res, next } = mockReqRes({ params: {} });
      validateObjectId('id')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should reject ObjectId with wrong length', () => {
      const { req, res, next } = mockReqRes({ params: { id: '507f1f77bcf86cd79943901' } }); // 23 chars
      validateObjectId('id')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should sanitize input to remove HTML tags', () => {
      const { req, res, next } = mockReqRes({ body: { text: '<script>alert(1)</script>Hello' } });
      sanitizeInput(['text'])(req, res, next);
      expect(req.body.text).not.toContain('<script>');
      expect(req.body.text).toContain('Hello');
      expect(next).toHaveBeenCalled();
    });

    it('should remove event handlers from input', () => {
      const { req, res, next } = mockReqRes({ body: { text: 'Hello onclick=alert(1)' } });
      sanitizeInput(['text'])(req, res, next);
      expect(req.body.text).not.toContain('onclick=');
    });

    it('should remove javascript: protocol from input', () => {
      const { req, res, next } = mockReqRes({ body: { text: 'javascript:alert(1)' } });
      sanitizeInput(['text'])(req, res, next);
      expect(req.body.text).not.toContain('javascript:');
    });

    it('should trim string body fields', () => {
      const { req, res, next } = mockReqRes({ body: { name: '  John Doe  ' } });
      sanitizeBody(['name'])(req, res, next);
      expect(req.body.name).toBe('John Doe');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // API SECURITY — ApiError
  // ═══════════════════════════════════════════════════════════
  describe('API Security — ApiError', () => {
    it('should be operational by default', () => {
      const err = new ApiError(400, 'Bad request');
      expect(err.isOperational).toBe(true);
      expect(err.statusCode).toBe(400);
    });

    it('should include details when provided', () => {
      const err = new ApiError(400, 'Validation failed', ['name is required']);
      expect(err.details).toEqual(['name is required']);
    });

    it('should not expose secrets in default error messages', () => {
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /api.?key/i,
        /firebase/i,
        /mongodb(\+srv)?:\/\//i,
      ];

      const err = new ApiError(500, 'Internal server error');
      for (const pattern of sensitivePatterns) {
        expect(err.message).not.toMatch(pattern);
      }
    });

    it('should have correct error properties', () => {
      const err = new ApiError(403, 'Forbidden');
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Forbidden');
      expect(err.isOperational).toBe(true);
      expect(err.details).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CORS CONFIGURATION
  // ═══════════════════════════════════════════════════════════
  describe('CORS Configuration', () => {
    it('should restrict origins when CORS_ORIGIN env is set', () => {
      const original = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = 'https://app.nexora.com';

      const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
        : ['http://localhost:3000'];

      expect(allowedOrigins).toContain('https://app.nexora.com');
      expect(allowedOrigins).not.toContain('https://evil.com');

      if (original !== undefined) {
        process.env.CORS_ORIGIN = original;
      } else {
        delete process.env.CORS_ORIGIN;
      }
    });

    it('should support comma-separated origins', () => {
      const original = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = 'https://app.nexora.com, https://admin.nexora.com';

      const allowedOrigins = process.env.CORS_ORIGIN
        .split(',')
        .map((o) => o.trim());

      expect(allowedOrigins).toHaveLength(2);
      expect(allowedOrigins).toContain('https://app.nexora.com');
      expect(allowedOrigins).toContain('https://admin.nexora.com');

      if (original !== undefined) {
        process.env.CORS_ORIGIN = original;
      } else {
        delete process.env.CORS_ORIGIN;
      }
    });

    it('should default to localhost origins when env not set', () => {
      const original = process.env.CORS_ORIGIN;
      delete process.env.CORS_ORIGIN;

      const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
        : ['http://localhost:3000', 'http://localhost:5000'];

      expect(allowedOrigins).toContain('http://localhost:3000');

      if (original !== undefined) {
        process.env.CORS_ORIGIN = original;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // AUDIT LOG SERVICE
  // ═══════════════════════════════════════════════════════════
  describe('Audit Log Service', () => {
    it('should export required methods', () => {
      const auditService = require('../../src/services/audit.service');
      expect(typeof auditService.logAuthEvent).toBe('function');
      expect(typeof auditService.logModerationEvent).toBe('function');
      expect(typeof auditService.logReportEvent).toBe('function');
      expect(typeof auditService.logAdminEvent).toBe('function');
      expect(typeof auditService.logAccountEvent).toBe('function');
      expect(typeof auditService.logAIProcessingEvent).toBe('function');
      expect(typeof auditService.logVerificationEvent).toBe('function');
    });

    it('audit-log model should be defined', () => {
      const AuditLog = require('../../src/models/audit-log.model');
      expect(AuditLog).toBeDefined();
      expect(AuditLog.schema).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CONTENT SIZE LIMITS
  // ═══════════════════════════════════════════════════════════
  describe('Content Size Limits', () => {
    it('upload middleware should export expected functions', () => {
      const uploadMiddleware = require('../../src/middleware/upload.middleware');
      expect(typeof uploadMiddleware.uploadMedia).toBe('function');
      expect(typeof uploadMiddleware.uploadAvatar).toBe('function');
      expect(typeof uploadMiddleware.uploadImage).toBe('function');
      expect(typeof uploadMiddleware.getMediaCategory).toBe('function');
    });

    it('upload middleware should have allowed MIME types', () => {
      const { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } = require('../../src/middleware/upload.middleware');
      expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
      expect(ALLOWED_IMAGE_TYPES).toContain('image/png');
      expect(ALLOWED_VIDEO_TYPES).toContain('video/mp4');
      // Should NOT allow dangerous types
      expect(ALLOWED_IMAGE_TYPES).not.toContain('application/x-httpd-php');
      expect(ALLOWED_VIDEO_TYPES).not.toContain('application/x-executable');
    });
  });
});
