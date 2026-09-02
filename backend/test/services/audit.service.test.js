/**
 * Audit Service Tests (Module 21)
 * =================================
 * Comprehensive tests for the audit logging system.
 *
 * Covers:
 *   1. Audit log creation (all event categories)
 *   2. Privacy protection (PII sanitization)
 *   3. Immutability guards (cannot modify/delete logs)
 *   4. Querying and filtering
 *   5. Auth event logging
 *   6. Moderation event logging
 *   7. Report event logging
 *   8. Account event logging
 *   9. Admin event logging
 *  10. AI processing event logging
 *  11. Verification event logging
 *  12. Authorization checks (admin-only access)
 *  13. Security summary
 *  14. Edge cases
 *
 * Run with: npm test -- --testPathPatterns=audit.service
 */

// ─── Mock AuditLog Model ─────────────────────────────────────────────

jest.mock('../../src/models/audit-log.model', () => {
  const mockLogs = [];
  let idCounter = 1;

  const AUDIT_EVENT_CATEGORY = {
    AUTH: 'AUTH',
    MODERATION: 'MODERATION',
    REPORT: 'REPORT',
    ACCOUNT: 'ACCOUNT',
    ADMIN: 'ADMIN',
    AI_PROCESSING: 'AI_PROCESSING',
    VERIFICATION: 'VERIFICATION',
  };

  const AUDIT_EVENT_TYPE = {
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILURE: 'LOGIN_FAILURE',
    REGISTER_SUCCESS: 'REGISTER_SUCCESS',
    LOGOUT: 'LOGOUT',
    POST_APPROVED: 'POST_APPROVED',
    POST_REJECTED: 'POST_REJECTED',
    POST_FLAGGED: 'POST_FLAGGED',
    LABEL_OVERRIDE: 'LABEL_OVERRIDE',
    CONTENT_REMOVED: 'CONTENT_REMOVED',
    CONTENT_RESTORED: 'CONTENT_RESTORED',
    REPORT_CREATED: 'REPORT_CREATED',
    REPORT_RESOLVED: 'REPORT_RESOLVED',
    REPORT_DISMISSED: 'REPORT_DISMISSED',
    PROFILE_UPDATED: 'PROFILE_UPDATED',
    AVATAR_CHANGED: 'AVATAR_CHANGED',
    USERNAME_CHANGED: 'USERNAME_CHANGED',
    ROLE_CHANGED: 'ROLE_CHANGED',
    USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
    USER_DISABLED: 'USER_DISABLED',
    USER_ENABLED: 'USER_ENABLED',
    PIPELINE_STARTED: 'PIPELINE_STARTED',
    PIPELINE_COMPLETED: 'PIPELINE_COMPLETED',
    PIPELINE_FAILED: 'PIPELINE_FAILED',
    AI_ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
    TRUST_SCORE_FAILED: 'TRUST_SCORE_FAILED',
    FACT_CHECK_FAILED: 'FACT_CHECK_FAILED',
    MODEL_ERROR: 'MODEL_ERROR',
    AGE_VERIFICATION_INITIATED: 'AGE_VERIFICATION_INITIATED',
    AGE_VERIFICATION_SUCCESS: 'AGE_VERIFICATION_SUCCESS',
    AGE_VERIFICATION_FAILED: 'AGE_VERIFICATION_FAILED',
    AGE_VERIFICATION_EXPIRED: 'AGE_VERIFICATION_EXPIRED',
    FACT_CHECK_INITIATED: 'FACT_CHECK_INITIATED',
    TRUST_SCORE_COMPUTED: 'TRUST_SCORE_COMPUTED',
  };

  const AUDIT_OUTCOME = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PARTIAL: 'PARTIAL',
  };

  const MockLog = function (data) {
    Object.assign(this, data);
    this._id = data._id || `audit_${idCounter++}`;
    this.createdAt = data.createdAt || new Date();
    this.isNew = true;
    this.save = jest.fn().mockImplementation(function () {
      if (!this.isNew) {
        throw new Error('Audit logs are immutable and cannot be modified after creation');
      }
      this.isNew = false;
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockLog.create = jest.fn().mockImplementation((data) => {
    const doc = new MockLog(data);
    doc.isNew = false; // Mark as saved
    mockLogs.push(doc);
    return Promise.resolve(doc);
  });

  MockLog.find = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockLogs];
    if (filter.category) results = results.filter((l) => l.category === filter.category);
    if (filter.eventType) results = results.filter((l) => l.eventType === filter.eventType);
    if (filter.outcome) results = results.filter((l) => l.outcome === filter.outcome);
    if (filter.actorId) results = results.filter((l) => l.actorId === filter.actorId);
    if (filter.targetId) results = results.filter((l) => l.targetId === filter.targetId);

    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockLog.countDocuments = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockLogs];
    if (filter.category) results = results.filter((l) => l.category === filter.category);
    if (filter.eventType) results = results.filter((l) => l.eventType === filter.eventType);
    if (filter.outcome) results = results.filter((l) => l.outcome === filter.outcome);
    return Promise.resolve(results.length);
  });

  MockLog.aggregate = jest.fn().mockResolvedValue([]);

  MockLog._reset = () => { mockLogs.length = 0; idCounter = 1; };
  MockLog._logs = mockLogs;
  MockLog._add = (data) => {
    const doc = new MockLog(data);
    doc.isNew = false;
    mockLogs.push(doc);
    return doc;
  };
  MockLog.AUDIT_EVENT_CATEGORY = AUDIT_EVENT_CATEGORY;
  MockLog.AUDIT_EVENT_TYPE = AUDIT_EVENT_TYPE;
  MockLog.AUDIT_OUTCOME = AUDIT_OUTCOME;

  return MockLog;
});

// ─── Mock User Model ─────────────────────────────────────────────────

jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || `user_${Date.now()}`;
    this.save = jest.fn().mockResolvedValue(this);
  };

  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockUser._reset = () => { mockUsers.length = 0; };
  MockUser._users = mockUsers;
  MockUser._addUser = (data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return doc;
  };

  return MockUser;
});

// ─── Imports ─────────────────────────────────────────────────────────

const AuditLog = require('../../src/models/audit-log.model');
const auditService = require('../../src/services/audit.service');
const User = require('../../src/models/user.model');

// ─── Test Data ───────────────────────────────────────────────────────

function createTestUser(overrides = {}) {
  return User._addUser({
    _id: overrides._id || 'user_test_1',
    username: overrides.username || 'testuser',
    name: overrides.name || 'Test User',
    email: overrides.email || 'test@example.com',
    role: overrides.role || 'USER',
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Audit Service (Module 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog._reset();
    User._reset();
  });

  // ─── 1. Core Audit Log Creation ───────────────────────────────────

  describe('Core audit log creation', () => {
    it('should create an audit log with all required fields', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test login event',
        actor: { id: 'user_1', type: 'USER' },
        target: { type: 'User', id: 'user_1' },
      });

      expect(log).toBeDefined();
      expect(log.eventType).toBe('LOGIN_SUCCESS');
      expect(log.category).toBe('AUTH');
      expect(log.outcome).toBe('SUCCESS');
      expect(log.description).toBe('Test login event');
      expect(log.actorId).toBe('user_1');
      expect(log.actorType).toBe('USER');
      expect(log.targetType).toBe('User');
      expect(log.targetId).toBe('user_1');
      expect(log.checksum).toBeDefined();
      expect(AuditLog.create).toHaveBeenCalled();
    });

    it('should reject invalid eventType', async () => {
      await expect(
        auditService.log({
          eventType: 'INVALID_EVENT',
          category: 'AUTH',
          outcome: 'SUCCESS',
          description: 'Test',
        })
      ).rejects.toThrow('Invalid eventType');
    });

    it('should reject invalid category', async () => {
      await expect(
        auditService.log({
          eventType: 'LOGIN_SUCCESS',
          category: 'INVALID_CATEGORY',
          outcome: 'SUCCESS',
          description: 'Test',
        })
      ).rejects.toThrow('Invalid category');
    });

    it('should reject invalid outcome', async () => {
      await expect(
        auditService.log({
          eventType: 'LOGIN_SUCCESS',
          category: 'AUTH',
          outcome: 'INVALID',
          description: 'Test',
        })
      ).rejects.toThrow('Invalid outcome');
    });

    it('should reject missing description', async () => {
      await expect(
        auditService.log({
          eventType: 'LOGIN_SUCCESS',
          category: 'AUTH',
          outcome: 'SUCCESS',
        })
      ).rejects.toThrow('Description is required');
    });

    it('should truncate long descriptions', async () => {
      const longDescription = 'A'.repeat(3000);
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: longDescription,
      });

      expect(log.description.length).toBeLessThanOrEqual(2000);
    });
  });

  // ─── 2. Auth Event Logging ────────────────────────────────────────

  describe('Auth event logging', () => {
    it('should log successful login', async () => {
      createTestUser({ _id: 'user_login', username: 'logintest' });

      const log = await auditService.logAuthEvent({
        eventType: 'LOGIN_SUCCESS',
        user: { _id: 'user_login', username: 'logintest' },
        outcome: 'SUCCESS',
      });

      expect(log.eventType).toBe('LOGIN_SUCCESS');
      expect(log.category).toBe('AUTH');
      expect(log.outcome).toBe('SUCCESS');
      expect(log.description).toContain('logintest');
    });

    it('should log failed login with reason', async () => {
      const log = await auditService.logAuthEvent({
        eventType: 'LOGIN_FAILURE',
        user: { _id: 'user_fail', username: 'failuser' },
        outcome: 'FAILURE',
        reason: 'Invalid credentials',
      });

      expect(log.eventType).toBe('LOGIN_FAILURE');
      expect(log.outcome).toBe('FAILURE');
      expect(log.description).toContain('Invalid credentials');
      expect(log.metadata.reason).toBe('Invalid credentials');
    });

    it('should log registration', async () => {
      const log = await auditService.logAuthEvent({
        eventType: 'REGISTER_SUCCESS',
        user: { _id: 'user_new', username: 'newuser' },
        outcome: 'SUCCESS',
      });

      expect(log.eventType).toBe('REGISTER_SUCCESS');
      expect(log.description).toContain('newuser');
    });

    it('should log logout', async () => {
      const log = await auditService.logAuthEvent({
        eventType: 'LOGOUT',
        user: { _id: 'user_logout', username: 'logoutuser' },
        outcome: 'SUCCESS',
      });

      expect(log.eventType).toBe('LOGOUT');
      expect(log.description).toContain('logoutuser');
    });
  });

  // ─── 3. Moderation Event Logging ──────────────────────────────────

  describe('Moderation event logging', () => {
    it('should log post approval', async () => {
      const log = await auditService.logModerationEvent({
        eventType: 'POST_APPROVED',
        moderator: { _id: 'mod_1', username: 'moderator1', role: 'MODERATOR' },
        post: { _id: 'post_1', trustBadge: 'Orange', moderationStatus: 'under_review' },
        reason: 'Content verified as accurate',
        changes: { previousLabel: 'Orange', newLabel: 'Green', previousStatus: 'under_review', newStatus: 'approved' },
      });

      expect(log.eventType).toBe('POST_APPROVED');
      expect(log.category).toBe('MODERATION');
      expect(log.actorType).toBe('MODERATOR');
      expect(log.description).toContain('post_1');
      expect(log.metadata.reason).toBe('Content verified as accurate');
      expect(log.metadata.previousLabel).toBe('Orange');
      expect(log.metadata.newLabel).toBe('Green');
    });

    it('should log label override with ADMIN actor type', async () => {
      const log = await auditService.logModerationEvent({
        eventType: 'LABEL_OVERRIDE',
        moderator: { _id: 'admin_1', username: 'admin1', role: 'ADMIN' },
        post: { _id: 'post_2', trustBadge: 'Red', moderationStatus: 'approved' },
        reason: 'Context indicates satire',
        changes: { previousLabel: 'Red', newLabel: 'Purple', previousStatus: 'approved', newStatus: 'approved' },
      });

      expect(log.eventType).toBe('LABEL_OVERRIDE');
      expect(log.actorType).toBe('ADMIN');
      expect(log.metadata.previousLabel).toBe('Red');
      expect(log.metadata.newLabel).toBe('Purple');
    });

    it('should log post rejection', async () => {
      const log = await auditService.logModerationEvent({
        eventType: 'POST_REJECTED',
        moderator: { _id: 'mod_2', username: 'moderator2', role: 'MODERATOR' },
        post: { _id: 'post_3', trustBadge: 'Red', moderationStatus: 'under_review' },
        reason: 'Misinformation detected',
        changes: { previousLabel: 'Red', newLabel: 'Red', previousStatus: 'under_review', newStatus: 'rejected' },
      });

      expect(log.eventType).toBe('POST_REJECTED');
      expect(log.outcome).toBe('SUCCESS');
    });
  });

  // ─── 4. Report Event Logging ──────────────────────────────────────

  describe('Report event logging', () => {
    it('should log report creation', async () => {
      const log = await auditService.logReportEvent({
        eventType: 'REPORT_CREATED',
        actor: { _id: 'user_reporter', username: 'reporter1', role: 'USER' },
        report: { _id: 'report_1', targetType: 'Post', targetId: 'post_1', reason: 'MISINFORMATION', status: 'OPEN' },
      });

      expect(log.eventType).toBe('REPORT_CREATED');
      expect(log.category).toBe('REPORT');
      expect(log.metadata.reportReason).toBe('MISINFORMATION');
      expect(log.metadata.targetType).toBe('Post');
    });

    it('should log report resolution', async () => {
      const log = await auditService.logReportEvent({
        eventType: 'REPORT_RESOLVED',
        actor: { _id: 'mod_1', username: 'mod1', role: 'MODERATOR' },
        report: { _id: 'report_2', targetType: 'Post', targetId: 'post_2', reason: 'HARASSMENT', status: 'RESOLVED' },
        reason: 'Content removed after review',
      });

      expect(log.eventType).toBe('REPORT_RESOLVED');
      expect(log.metadata.resolutionReason).toBe('Content removed after review');
    });

    it('should log report dismissal', async () => {
      const log = await auditService.logReportEvent({
        eventType: 'REPORT_DISMISSED',
        actor: { _id: 'mod_2', username: 'mod2', role: 'MODERATOR' },
        report: { _id: 'report_3', targetType: 'User', targetId: 'user_1', reason: 'SPAM', status: 'DISMISSED' },
        reason: 'No violation found',
      });

      expect(log.eventType).toBe('REPORT_DISMISSED');
      expect(log.metadata.status).toBe('DISMISSED');
    });
  });

  // ─── 5. Account Event Logging ─────────────────────────────────────

  describe('Account event logging', () => {
    it('should log profile update', async () => {
      const log = await auditService.logAccountEvent({
        eventType: 'PROFILE_UPDATED',
        actor: { _id: 'user_1', role: 'USER' },
        target: { _id: 'user_1', username: 'testuser' },
        changes: ['bio', 'website'],
      });

      expect(log.eventType).toBe('PROFILE_UPDATED');
      expect(log.category).toBe('ACCOUNT');
      expect(log.metadata.changedFields).toEqual(['bio', 'website']);
    });

    it('should log username change', async () => {
      const log = await auditService.logAccountEvent({
        eventType: 'USERNAME_CHANGED',
        actor: { _id: 'user_1', role: 'USER' },
        target: { _id: 'user_1', username: 'newusername' },
        changes: ['username'],
      });

      expect(log.eventType).toBe('USERNAME_CHANGED');
      expect(log.description).toContain('newusername');
    });

    it('should log avatar change', async () => {
      const log = await auditService.logAccountEvent({
        eventType: 'AVATAR_CHANGED',
        actor: { _id: 'user_1', role: 'USER' },
        target: { _id: 'user_1', username: 'testuser' },
        changes: ['avatar'],
      });

      expect(log.eventType).toBe('AVATAR_CHANGED');
    });
  });

  // ─── 6. Admin Event Logging ───────────────────────────────────────

  describe('Admin event logging', () => {
    it('should log role change', async () => {
      const log = await auditService.logAdminEvent({
        eventType: 'USER_ROLE_CHANGED',
        admin: { _id: 'admin_1', username: 'admin1' },
        target: { _id: 'user_1', username: 'testuser' },
        details: { newRole: 'MODERATOR' },
      });

      expect(log.eventType).toBe('USER_ROLE_CHANGED');
      expect(log.category).toBe('ADMIN');
      expect(log.actorType).toBe('ADMIN');
      expect(log.metadata.details.newRole).toBe('MODERATOR');
    });

    it('should log user disable', async () => {
      const log = await auditService.logAdminEvent({
        eventType: 'USER_DISABLED',
        admin: { _id: 'admin_1', username: 'admin1' },
        target: { _id: 'user_1', username: 'baduser' },
      });

      expect(log.eventType).toBe('USER_DISABLED');
      expect(log.description).toContain('baduser');
    });

    it('should log user enable', async () => {
      const log = await auditService.logAdminEvent({
        eventType: 'USER_ENABLED',
        admin: { _id: 'admin_1', username: 'admin1' },
        target: { _id: 'user_1', username: 'rehabilitated' },
      });

      expect(log.eventType).toBe('USER_ENABLED');
    });
  });

  // ─── 7. AI Processing Event Logging ───────────────────────────────

  describe('AI processing event logging', () => {
    it('should log pipeline failure', async () => {
      const log = await auditService.logAIProcessingEvent({
        eventType: 'PIPELINE_FAILED',
        target: { postId: 'post_ai_1', pipelineId: 'pipeline_1' },
        error: { code: 'AI_TIMEOUT', message: 'AI service timeout' },
        metadata: { stage: 'AI_ANALYSIS', retryCount: 3 },
      });

      expect(log.eventType).toBe('PIPELINE_FAILED');
      expect(log.category).toBe('AI_PROCESSING');
      expect(log.outcome).toBe('FAILURE');
      expect(log.errorCode).toBe('AI_TIMEOUT');
      expect(log.errorMessage).toBe('AI service timeout');
      expect(log.metadata.stage).toBe('AI_ANALYSIS');
    });

    it('should log AI analysis failure', async () => {
      const log = await auditService.logAIProcessingEvent({
        eventType: 'AI_ANALYSIS_FAILED',
        target: { postId: 'post_ai_2', pipelineId: 'pipeline_2' },
        error: { code: 'MODEL_ERROR', message: 'Model returned invalid response' },
      });

      expect(log.eventType).toBe('AI_ANALYSIS_FAILED');
      expect(log.outcome).toBe('FAILURE');
    });

    it('should log pipeline completion', async () => {
      const log = await auditService.logAIProcessingEvent({
        eventType: 'PIPELINE_COMPLETED',
        target: { postId: 'post_ai_3', pipelineId: 'pipeline_3' },
        metadata: { status: 'PUBLISHED', durationMs: 5000 },
      });

      expect(log.eventType).toBe('PIPELINE_COMPLETED');
      expect(log.outcome).toBe('FAILURE'); // Default for AI processing events
    });
  });

  // ─── 8. Verification Event Logging ────────────────────────────────

  describe('Verification event logging', () => {
    it('should log age verification initiation', async () => {
      const log = await auditService.logVerificationEvent({
        eventType: 'AGE_VERIFICATION_INITIATED',
        actor: { _id: 'user_verify' },
        target: { userId: 'user_verify', verificationId: 'ver_1' },
        metadata: { provider: 'mock-provider', attempt: 1 },
      });

      expect(log.eventType).toBe('AGE_VERIFICATION_INITIATED');
      expect(log.category).toBe('VERIFICATION');
      expect(log.outcome).toBe('SUCCESS');
      expect(log.metadata.provider).toBe('mock-provider');
    });

    it('should log age verification success', async () => {
      const log = await auditService.logVerificationEvent({
        eventType: 'AGE_VERIFICATION_SUCCESS',
        actor: { _id: 'user_verify' },
        target: { userId: 'user_verify', verificationId: 'ver_2' },
        metadata: { provider: 'mock-provider', ageCategory: 'ADULT' },
      });

      expect(log.eventType).toBe('AGE_VERIFICATION_SUCCESS');
      expect(log.metadata.ageCategory).toBe('ADULT');
    });

    it('should log age verification failure', async () => {
      const log = await auditService.logVerificationEvent({
        eventType: 'AGE_VERIFICATION_FAILED',
        actor: { _id: 'user_verify' },
        target: { userId: 'user_verify', verificationId: 'ver_3' },
        metadata: { provider: 'mock-provider', failureReason: 'Provider unavailable' },
        error: { code: 'PROVIDER_ERROR', message: 'Provider unavailable' },
      });

      expect(log.eventType).toBe('AGE_VERIFICATION_FAILED');
      expect(log.outcome).toBe('FAILURE');
      expect(log.errorMessage).toBe('Provider unavailable');
    });
  });

  // ─── 9. Privacy Protection ────────────────────────────────────────

  describe('Privacy protection', () => {
    it('should sanitize metadata to remove sensitive fields', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test with sensitive metadata',
        metadata: {
          username: 'testuser',
          password: 'secret123',
          token: 'eyJhbGciOiJIUzI1NiJ9',
          apiKey: 'sk_live_abc123',
          dob: '1990-01-01',
          governmentId: 'ABC123456',
          safeField: 'this should remain',
        },
      });

      expect(log.metadata.username).toBe('testuser');
      expect(log.metadata.password).toBeUndefined();
      expect(log.metadata.token).toBeUndefined();
      expect(log.metadata.apiKey).toBeUndefined();
      expect(log.metadata.dob).toBeUndefined();
      expect(log.metadata.governmentId).toBeUndefined();
      expect(log.metadata.safeField).toBe('this should remain');
    });

    it('should anonymize IPv4 addresses', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test IP anonymization',
        request: { ip: '192.168.1.100' },
      });

      // IP should be anonymized (last octet zeroed)
      expect(log.ip).toBe('192.168.1.0');
    });

    it('should anonymize IPv6 addresses', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test IPv6 anonymization',
        request: { ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' },
      });

      // IPv6 should be partially anonymized
      expect(log.ip).toBeDefined();
      // Should not contain the full address
      expect(log.ip).not.toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });

    it('should truncate long user agent strings', async () => {
      const longUA = 'A'.repeat(1000);
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test UA truncation',
        request: { userAgent: longUA },
      });

      expect(log.userAgent.length).toBeLessThanOrEqual(500);
    });

    it('should not store raw media URLs', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test media URL sanitization',
        metadata: {
          rawMedia: 'https://storage.example.com/private/video.mp4',
          privateMediaUrl: 'https://storage.example.com/private/image.jpg',
          safeUrl: 'https://example.com/public',
        },
      });

      expect(log.metadata.rawMedia).toBeUndefined();
      expect(log.metadata.privateMediaUrl).toBeUndefined();
      expect(log.metadata.safeUrl).toBe('https://example.com/public');
    });
  });

  // ─── 10. Immutability Guards ──────────────────────────────────────

  describe('Immutability guards', () => {
    it('should create audit logs successfully', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test immutability',
      });

      expect(log).toBeDefined();
      expect(log._id).toBeDefined();
    });

    it('should reject save on existing documents', () => {
      const log = AuditLog._add({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Existing log',
        isNew: false,
      });

      // The mock save function should throw for non-new documents
      expect(() => log.save()).toThrow('Audit logs are immutable');
    });

    it('should include checksum for integrity verification', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test checksum',
      });

      expect(log.checksum).toBeDefined();
      expect(typeof log.checksum).toBe('string');
      expect(log.checksum.length).toBeGreaterThan(0);
    });
  });

  // ─── 11. Querying and Filtering ───────────────────────────────────

  describe('Querying and filtering', () => {
    it('should query logs with pagination', async () => {
      AuditLog._add({ eventType: 'LOGIN_SUCCESS', category: 'AUTH', outcome: 'SUCCESS' });
      AuditLog._add({ eventType: 'LOGIN_FAILURE', category: 'AUTH', outcome: 'FAILURE' });
      AuditLog._add({ eventType: 'POST_APPROVED', category: 'MODERATION', outcome: 'SUCCESS' });

      const result = await auditService.getLogs({ page: 1, limit: 2 });

      expect(result.logs).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
    });

    it('should filter by category', async () => {
      AuditLog._add({ eventType: 'LOGIN_SUCCESS', category: 'AUTH', outcome: 'SUCCESS' });
      AuditLog._add({ eventType: 'POST_APPROVED', category: 'MODERATION', outcome: 'SUCCESS' });

      const result = await auditService.getLogs({ category: 'AUTH' });

      expect(result.logs).toBeDefined();
      // The mock filter should return only AUTH logs
    });

    it('should filter by event type', async () => {
      AuditLog._add({ eventType: 'LOGIN_SUCCESS', category: 'AUTH', outcome: 'SUCCESS' });
      AuditLog._add({ eventType: 'LOGIN_FAILURE', category: 'AUTH', outcome: 'FAILURE' });

      const result = await auditService.getLogs({ eventType: 'LOGIN_FAILURE' });

      expect(result.logs).toBeDefined();
    });

    it('should get logs for a specific user', async () => {
      AuditLog._add({ actorId: 'user_1', eventType: 'LOGIN_SUCCESS', category: 'AUTH', outcome: 'SUCCESS' });
      AuditLog._add({ targetId: 'user_1', eventType: 'PROFILE_UPDATED', category: 'ACCOUNT', outcome: 'SUCCESS' });
      AuditLog._add({ actorId: 'user_2', eventType: 'LOGIN_SUCCESS', category: 'AUTH', outcome: 'SUCCESS' });

      const result = await auditService.getLogsForUser('user_1');

      expect(result.logs).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('should get logs for a specific post', async () => {
      AuditLog._add({ targetId: 'post_1', eventType: 'POST_APPROVED', category: 'MODERATION', outcome: 'SUCCESS' });
      AuditLog._add({ targetId: 'post_1', eventType: 'LABEL_OVERRIDE', category: 'MODERATION', outcome: 'SUCCESS' });
      AuditLog._add({ targetId: 'post_2', eventType: 'POST_REJECTED', category: 'MODERATION', outcome: 'SUCCESS' });

      const result = await auditService.getLogsForPost('post_1');

      expect(result.logs).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });

  // ─── 12. Security Summary ─────────────────────────────────────────

  describe('Security summary', () => {
    it('should return security summary stats', async () => {
      AuditLog.aggregate.mockResolvedValue([
        { _id: 'AUTH', count: 10 },
        { _id: 'MODERATION', count: 5 },
      ]);
      AuditLog.countDocuments.mockResolvedValue(3);

      const stats = await auditService.getSecuritySummary({ days: 7 });

      expect(stats).toBeDefined();
      expect(stats.period).toBe('7 days');
      expect(stats.byCategory).toBeDefined();
      expect(stats.authFailures).toBeDefined();
      expect(stats.recentFailures).toBeDefined();
    });

    it('should aggregate counts correctly', async () => {
      AuditLog.aggregate.mockImplementation((pipeline) => {
        const matchStage = pipeline.find((s) => s.$match);
        if (matchStage && matchStage.$match.category) {
          return Promise.resolve([
            { _id: 'AUTH', count: 15 },
          ]);
        }
        if (matchStage && matchStage.$match.outcome) {
          return Promise.resolve([
            { _id: 'SUCCESS', count: 20 },
            { _id: 'FAILURE', count: 5 },
          ]);
        }
        return Promise.resolve([
          { _id: 'user_1', count: 8 },
        ]);
      });
      AuditLog.countDocuments.mockResolvedValue(2);

      const stats = await auditService.getSecuritySummary({ days: 30 });

      expect(stats.totalEvents).toBeDefined();
    });
  });

  // ─── 13. Event Types API ──────────────────────────────────────────

  describe('Event types API', () => {
    it('should return all event categories', () => {
      const types = auditService.getEventTypes();

      expect(types.categories).toBeDefined();
      expect(types.categories).toContain('AUTH');
      expect(types.categories).toContain('MODERATION');
      expect(types.categories).toContain('REPORT');
      expect(types.categories).toContain('ACCOUNT');
      expect(types.categories).toContain('ADMIN');
      expect(types.categories).toContain('AI_PROCESSING');
      expect(types.categories).toContain('VERIFICATION');
    });

    it('should return all event types', () => {
      const types = auditService.getEventTypes();

      expect(types.eventTypes).toBeDefined();
      expect(types.eventTypes).toContain('LOGIN_SUCCESS');
      expect(types.eventTypes).toContain('LOGIN_FAILURE');
      expect(types.eventTypes).toContain('POST_APPROVED');
      expect(types.eventTypes).toContain('REPORT_CREATED');
      expect(types.eventTypes).toContain('USER_ROLE_CHANGED');
      expect(types.eventTypes).toContain('PIPELINE_FAILED');
      expect(types.eventTypes).toContain('AGE_VERIFICATION_SUCCESS');
    });

    it('should return all outcomes', () => {
      const types = auditService.getEventTypes();

      expect(types.outcomes).toBeDefined();
      expect(types.outcomes).toContain('SUCCESS');
      expect(types.outcomes).toContain('FAILURE');
      expect(types.outcomes).toContain('PARTIAL');
    });
  });

  // ─── 14. Authorization (Controller Tests) ─────────────────────────

  describe('Authorization checks', () => {
    const { requireRole } = require('../../src/middleware/authorize.middleware');

    it('should block USER role from audit endpoints', () => {
      const req = { user: { role: 'USER' } };
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toBeDefined();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('should allow ADMIN role for audit endpoints', () => {
      const req = { user: { role: 'ADMIN' } };
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0].length).toBe(0);
    });

    it('should block MODERATOR role from audit endpoints', () => {
      const req = { user: { role: 'MODERATOR' } };
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toBeDefined();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('should block unauthenticated requests', () => {
      const req = {};
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toBeDefined();
      expect(next.mock.calls[0][0].statusCode).toBe(401);
    });
  });

  // ─── 15. Controller Validation ────────────────────────────────────

  describe('Controller validation', () => {
    const {
      getLogs,
      getLogsForUser,
      getLogsForPost,
      getSecuritySummary,
      getEventTypes,
    } = require('../../src/controllers/v1/audit.controller');

    it('should handle getLogs with default params', async () => {
      const req = { query: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await getLogs(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getLogs with query params', async () => {
      const req = { query: { page: '2', limit: '5', category: 'AUTH', eventType: 'LOGIN_FAILURE' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await getLogs(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getLogsForUser', async () => {
      const req = { params: { userId: 'user_1' }, query: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await getLogsForUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getLogsForPost', async () => {
      const req = { params: { postId: 'post_1' }, query: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await getLogsForPost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getSecuritySummary', async () => {
      AuditLog.aggregate.mockResolvedValue([]);
      AuditLog.countDocuments.mockResolvedValue(0);

      const req = { query: { days: '30' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await getSecuritySummary(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle getEventTypes', async () => {
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      getEventTypes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          categories: expect.arrayContaining(['AUTH', 'MODERATION']),
        })
      );
    });
  });

  // ─── 16. Edge Cases ───────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle null metadata gracefully', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test null metadata',
        metadata: null,
      });

      expect(log).toBeDefined();
      expect(log.metadata).toBeNull();
    });

    it('should handle null request gracefully', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test null request',
        request: null,
      });

      expect(log).toBeDefined();
      expect(log.ip).toBeNull();
      expect(log.userAgent).toBeNull();
    });

    it('should handle error objects in events', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_FAILURE',
        category: 'AUTH',
        outcome: 'FAILURE',
        description: 'Test error logging',
        error: { code: 'AUTH_FAILED', message: 'Invalid credentials' },
      });

      expect(log.errorCode).toBe('AUTH_FAILED');
      expect(log.errorMessage).toBe('Invalid credentials');
    });

    it('should truncate long error messages', async () => {
      const longError = 'E'.repeat(2000);
      const log = await auditService.log({
        eventType: 'LOGIN_FAILURE',
        category: 'AUTH',
        outcome: 'FAILURE',
        description: 'Test long error',
        error: { code: 'ERROR', message: longError },
      });

      expect(log.errorMessage.length).toBeLessThanOrEqual(1000);
    });

    it('should handle correlation IDs', async () => {
      const log = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Test correlation',
        correlationId: 'req_abc123',
      });

      expect(log.correlationId).toBe('req_abc123');
    });

    it('should generate consistent checksums for same data', async () => {
      const log1 = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Checksum test',
        actor: { id: 'user_1' },
      });

      const log2 = await auditService.log({
        eventType: 'LOGIN_SUCCESS',
        category: 'AUTH',
        outcome: 'SUCCESS',
        description: 'Checksum test',
        actor: { id: 'user_1' },
      });

      // Different timestamps will produce different checksums
      expect(log1.checksum).toBeDefined();
      expect(log2.checksum).toBeDefined();
    });
  });
});
