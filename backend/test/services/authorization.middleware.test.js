/**
 * Authorization Middleware Tests (Module 24)
 * ==========================================
 * Tests for requireRole and authorizeOwner middleware.
 *
 * Run with: npm test -- --testPathPatterns=authorization.middleware
 */

const { requireRole, authorizeOwner } = require('../../src/middleware/authorize.middleware');

describe('Authorization Middleware', () => {
  // ─── requireRole ──────────────────────────────────────────────────

  describe('requireRole', () => {
    it('should allow user with matching role', () => {
      const req = { user: { role: 'ADMIN' } };
      const next = jest.fn();
      requireRole('ADMIN')(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should allow user with one of multiple roles', () => {
      const req = { user: { role: 'MODERATOR' } };
      const next = jest.fn();
      requireRole('MODERATOR', 'ADMIN')(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject user with non-matching role', () => {
      const req = { user: { role: 'USER' } };
      const res = {};
      const next = jest.fn();
      requireRole('MODERATOR', 'ADMIN')(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should reject unauthenticated request (no user)', () => {
      const req = {};
      const res = {};
      const next = jest.fn();
      requireRole('ADMIN')(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should work with single role argument', () => {
      const req = { user: { role: 'ADMIN' } };
      const next = jest.fn();
      requireRole('ADMIN')(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should include role names in error message', () => {
      const req = { user: { role: 'USER' } };
      const next = jest.fn();
      requireRole('MODERATOR', 'ADMIN')(req, {}, next);
      const error = next.mock.calls[0][0];
      expect(error.message).toContain('MODERATOR');
      expect(error.message).toContain('ADMIN');
    });
  });

  // ─── authorizeOwner ───────────────────────────────────────────────

  describe('authorizeOwner', () => {
    it('should allow when user owns the resource', () => {
      const req = {
        user: { _id: 'user_123' },
        params: { id: 'resource_1' },
      };
      const getOwnerId = jest.fn().mockReturnValue('user_123');
      const next = jest.fn();

      authorizeOwner(getOwnerId)(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject when user does not own the resource', () => {
      const req = {
        user: { _id: 'user_123' },
        params: { id: 'resource_1' },
      };
      const getOwnerId = jest.fn().mockReturnValue('user_456');
      const next = jest.fn();

      authorizeOwner(getOwnerId)(req, {}, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should reject when userId is missing', () => {
      const req = { user: {} };
      const getOwnerId = jest.fn().mockReturnValue('owner_id');
      const next = jest.fn();

      authorizeOwner(getOwnerId)(req, {}, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should reject when ownerId is missing', () => {
      const req = { user: { _id: 'user_123' } };
      const getOwnerId = jest.fn().mockReturnValue(null);
      const next = jest.fn();

      authorizeOwner(getOwnerId)(req, {}, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should compare string representations of IDs', () => {
      const req = {
        user: { _id: 'user_123' },
      };
      const getOwnerId = jest.fn().mockReturnValue('user_123');
      const next = jest.fn();

      authorizeOwner(getOwnerId)(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should use req.resourceOwner as fallback when getOwnerId is not a function', () => {
      const req = {
        user: { _id: 'user_123' },
        resourceOwner: 'user_123',
      };
      const next = jest.fn();

      // Pass null for getOwnerId to test fallback
      authorizeOwner(null)(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
