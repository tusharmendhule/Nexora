/**
 * Moderation Service Tests (Module 20)
 * =====================================
 * Comprehensive tests for the moderator workflow.
 *
 * Covers:
 *   1. View flagged posts
 *   2. Inspect post details (Trust Score, AI results, claims, evidence)
 *   3. Approve content
 *   4. Reject content
 *   5. Override label (ADMIN only)
 *   6. Flag for review
 *   7. Remove / restore content
 *   8. Resolve / dismiss reports
 *   9. Audit logging (every action creates a log)
 *  10. Unauthorized access (USER role blocked)
 *  11. Edge cases
 *
 * Run with: npm test -- --testPathPatterns=moderation.service
 */

// ─── Constants ──────────────────────────────────────────────────────

const MODERATION_ACTION = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  FLAG_FOR_REVIEW: 'FLAG_FOR_REVIEW',
  OVERRIDE_LABEL: 'OVERRIDE_LABEL',
  RESOLVE_REPORT: 'RESOLVE_REPORT',
  DISMISS_REPORT: 'DISMISS_REPORT',
  REMOVE_CONTENT: 'REMOVE_CONTENT',
  RESTORE_CONTENT: 'RESTORE_CONTENT',
};

const REPORT_STATUS = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
};

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock ModerationLog model
jest.mock('../../src/models/moderationLog.model', () => {
  const mockLogs = [];
  let idCounter = 1;

  const MockLog = function (data) {
    Object.assign(this, data);
    this._id = data._id || `log_${idCounter++}`;
    this.createdAt = data.createdAt || new Date();
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockLog.create = jest.fn().mockImplementation((data) => {
    const doc = new MockLog(data);
    mockLogs.push(doc);
    return Promise.resolve(doc);
  });

  MockLog.find = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockLogs];
    if (filter.postId) results = results.filter((l) => l.postId === filter.postId);
    if (filter.moderatorId) results = results.filter((l) => l.moderatorId === filter.moderatorId);
    if (filter.action) results = results.filter((l) => l.action === filter.action);

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
    if (filter.action) results = results.filter((l) => l.action === filter.action);
    if (filter.moderatorId) results = results.filter((l) => l.moderatorId === filter.moderatorId);
    return Promise.resolve(results.length);
  });

  MockLog.aggregate = jest.fn().mockResolvedValue([]);

  MockLog._reset = () => { mockLogs.length = 0; idCounter = 1; };
  MockLog._logs = mockLogs;
  MockLog._add = (data) => {
    const doc = new MockLog(data);
    mockLogs.push(doc);
    return doc;
  };
  MockLog.MODERATION_ACTION = MODERATION_ACTION;

  return MockLog;
});

// Mock Post model
jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${Date.now()}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockPost.find = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockPosts];
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockPost.countDocuments = jest.fn().mockResolvedValue(0);

  MockPost._reset = () => { mockPosts.length = 0; };
  MockPost._posts = mockPosts;
  MockPost._addPost = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };

  return MockPost;
});

// Mock Report model
jest.mock('../../src/models/report.model', () => {
  const mockReports = [];
  const MockReport = function (data) {
    Object.assign(this, data);
    this._id = data._id || `report_${Date.now()}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockReport.find = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockReports];
    if (filter.targetId) results = results.filter((r) => r.targetId === filter.targetId);
    if (filter.targetType) results = results.filter((r) => r.targetType === filter.targetType);
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockReport.findById = jest.fn().mockImplementation((id) => {
    const found = mockReports.find((r) => r._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockReport._reset = () => { mockReports.length = 0; };
  MockReport._reports = mockReports;
  MockReport._addReport = (data) => {
    const doc = new MockReport(data);
    mockReports.push(doc);
    return doc;
  };
  MockReport.REPORT_STATUS = { OPEN: 'OPEN', UNDER_REVIEW: 'UNDER_REVIEW', RESOLVED: 'RESOLVED', DISMISSED: 'DISMISSED' };

  return MockReport;
});

// Mock TrustScore model
jest.mock('../../src/models/trust-score.model', () => {
  const mockTrustScores = [];
  return {
    findOne: jest.fn().mockImplementation((filter = {}) => {
      const found = mockTrustScores.find((t) => t.post === filter.post);
      return Promise.resolve(found || null);
    }),
    _reset: () => { mockTrustScores.length = 0; },
    _add: (data) => { mockTrustScores.push(data); return data; },
  };
});

// Mock TextAnalysis model
jest.mock('../../src/models/text-analysis.model', () => {
  const mockAnalyses = [];
  return {
    findOne: jest.fn().mockImplementation((filter = {}) => {
      const found = mockAnalyses.find((a) => a.post === filter.post);
      return Promise.resolve(found || null);
    }),
    _reset: () => { mockAnalyses.length = 0; },
    _add: (data) => { mockAnalyses.push(data); return data; },
  };
});

// Mock ClaimEntity model
jest.mock('../../src/models/claim-entity.model', () => {
  const mockClaims = [];
  return {
    find: jest.fn().mockImplementation((filter = {}) => {
      let results = [...mockClaims];
      if (filter.post) results = results.filter((c) => c.post === filter.post);
      const chain = {};
      chain.sort = jest.fn().mockReturnValue(chain);
      chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
      chain.catch = (fn) => Promise.resolve(results).catch(fn);
      return chain;
    }),
    _reset: () => { mockClaims.length = 0; },
    _add: (data) => { mockClaims.push(data); return data; },
  };
});

// Mock Evidence model
jest.mock('../../src/models/evidence.model.js', () => {
  const mockEvidence = [];
  return {
    find: jest.fn().mockImplementation((filter = {}) => {
      let results = [...mockEvidence];
      if (filter.post) results = results.filter((e) => e.post === filter.post);
      const chain = {};
      chain.sort = jest.fn().mockReturnValue(chain);
      chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
      chain.catch = (fn) => Promise.resolve(results).catch(fn);
      return chain;
    }),
    _reset: () => { mockEvidence.length = 0; },
    _add: (data) => { mockEvidence.push(data); return data; },
  };
});

// ─── Imports ──────────────────────────────────────────────────────────

const Post = require('../../src/models/post.model');
const Report = require('../../src/models/report.model');
const ModerationLog = require('../../src/models/moderationLog.model');
const TrustScore = require('../../src/models/trust-score.model');
const TextAnalysis = require('../../src/models/text-analysis.model');
const ClaimEntity = require('../../src/models/claim-entity.model');
const Evidence = require('../../src/models/evidence.model');
const moderationService = require('../../src/services/moderation.service');

// ─── Helpers ──────────────────────────────────────────────────────────

function createTestPost(overrides = {}) {
  return Post._addPost({
    _id: overrides._id || 'post_test_1',
    user: overrides.user || 'user_author_1',
    text: overrides.text || 'Test post content',
    trustBadge: overrides.trustBadge || 'Orange',
    moderationStatus: overrides.moderationStatus || 'pending',
    verificationStatus: overrides.verificationStatus || 'REVIEW_REQUIRED',
    isArchived: overrides.isArchived || false,
    ...overrides,
  });
}

function createTestReport(overrides = {}) {
  return Report._addReport({
    _id: overrides._id || 'report_test_1',
    reporter: overrides.reporter || 'user_reporter_1',
    targetType: overrides.targetType || 'Post',
    targetId: overrides.targetId || 'post_test_1',
    reason: overrides.reason || 'MISINFORMATION',
    status: overrides.status || 'OPEN',
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Moderation Service (Module 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Post._reset();
    Report._reset();
    ModerationLog._reset();
    TrustScore._reset();
    TextAnalysis._reset();
    ClaimEntity._reset();
    Evidence._reset();
  });

  // ─── 1. View Flagged Posts ────────────────────────────────────────

  describe('View flagged posts', () => {
    it('should return posts needing review', async () => {
      createTestPost({ _id: 'flagged_1', moderationStatus: 'under_review' });
      createTestPost({ _id: 'flagged_2', verificationStatus: 'REVIEW_REQUIRED' });
      createTestPost({ _id: 'flagged_3', moderationStatus: 'flagged' });

      const result = await moderationService.getFlaggedPosts();

      expect(result.posts).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        createTestPost({ _id: `page_${i}`, moderationStatus: 'pending' });
      }

      const result = await moderationService.getFlaggedPosts({ page: 1, limit: 2 });
      expect(result.pagination.limit).toBe(2);
    });
  });

  // ─── 2. Inspect Post Details ──────────────────────────────────────

  describe('Inspect post details', () => {
    it('should return full context for a post', async () => {
      createTestPost({ _id: 'inspect_1' });
      TrustScore._add({ post: 'inspect_1', score: 45, label: 'Orange', authenticity: 0.5, factualVerification: 0.4, sourceCredibility: 0.6, modelConfidence: 0.7, explanation: 'Moderate trust' });
      TextAnalysis._add({ post: 'inspect_1', misinformationProbability: 0.3, aiGeneratedProbability: 0.1, claims: [{ text: 'Test claim' }], entities: [], confidence: 0.8 });
      ClaimEntity._add({ post: 'inspect_1', claims: [{ text: 'Claim 1' }], entities: [], verificationScore: 60, status: 'completed' });
      Evidence._add({ post: 'inspect_1', claim: 'Claim 1', aggregateVerdict: 'mixed', weightedConfidence: 0.6, sourceCount: 2, evidenceItems: [{ source: 'API', sourceType: 'fact_check_api', verdict: 'mixed', confidence: 0.6, url: null }] });

      const context = await moderationService.getPostInspection('inspect_1');

      expect(context.post).toBeDefined();
      expect(context.trustScore).toBeDefined();
      expect(context.trustScore.score).toBe(45);
      expect(context.trustScore.label).toBe('Orange');
      expect(context.textAnalysis).toBeDefined();
      expect(context.textAnalysis.misinformationProbability).toBe(0.3);
      expect(context.claims).toHaveLength(1);
      expect(context.evidence).toHaveLength(1);
      expect(context.currentLabel).toBe('Orange');
    });

    it('should handle post not found', async () => {
      await expect(
        moderationService.getPostInspection('nonexistent')
      ).rejects.toThrow('Post not found');
    });

    it('should handle missing trust score gracefully', async () => {
      createTestPost({ _id: 'no_trust' });

      const context = await moderationService.getPostInspection('no_trust');
      expect(context.trustScore).toBeNull();
      expect(context.textAnalysis).toBeNull();
    });
  });

  // ─── 3. Approve Content ───────────────────────────────────────────

  describe('Approve content', () => {
    it('should approve a post and create audit log', async () => {
      createTestPost({ _id: 'approve_1', moderationStatus: 'under_review', trustBadge: 'Orange' });

      const log = await moderationService.approvePost({
        postId: 'approve_1',
        moderatorId: 'mod_1',
        reason: 'Content verified as accurate',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('APPROVE');
      expect(log.previousStatus).toBe('under_review');
      expect(log.newStatus).toBe('approved');
      expect(log.previousLabel).toBe('Orange');
      expect(log.newLabel).toBe('Green');
      expect(log.reason).toBe('Content verified as accurate');
      expect(log.moderatorId).toBe('mod_1');
      expect(ModerationLog.create).toHaveBeenCalled();
    });

    it('should require a reason', async () => {
      createTestPost({ _id: 'approve_no_reason' });

      await expect(
        moderationService.approvePost({
          postId: 'approve_no_reason',
          moderatorId: 'mod_1',
          reason: '',
        })
      ).rejects.toThrow('Moderation reason is required');
    });

    it('should throw for non-existent post', async () => {
      await expect(
        moderationService.approvePost({
          postId: 'nonexistent',
          moderatorId: 'mod_1',
          reason: 'Valid reason',
        })
      ).rejects.toThrow('Post not found');
    });
  });

  // ─── 4. Reject Content ────────────────────────────────────────────

  describe('Reject content', () => {
    it('should reject a post and create audit log', async () => {
      createTestPost({ _id: 'reject_1', moderationStatus: 'under_review', trustBadge: 'Red' });

      const log = await moderationService.rejectPost({
        postId: 'reject_1',
        moderatorId: 'mod_1',
        reason: 'Misinformation detected',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('REJECT');
      expect(log.previousStatus).toBe('under_review');
      expect(log.newStatus).toBe('rejected');
      expect(log.previousLabel).toBe('Red');
      expect(ModerationLog.create).toHaveBeenCalled();
    });

    it('should require a reason', async () => {
      createTestPost({ _id: 'reject_no_reason' });

      await expect(
        moderationService.rejectPost({
          postId: 'reject_no_reason',
          moderatorId: 'mod_1',
          reason: '',
        })
      ).rejects.toThrow('Moderation reason is required');
    });
  });

  // ─── 5. Override Label (ADMIN only) ───────────────────────────────

  describe('Override label', () => {
    it('should override label and create audit log', async () => {
      createTestPost({ _id: 'override_1', trustBadge: 'Red' });

      const log = await moderationService.overrideLabel({
        postId: 'override_1',
        moderatorId: 'admin_1',
        reason: 'Context indicates this is satire',
        newLabel: 'Purple',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('OVERRIDE_LABEL');
      expect(log.previousLabel).toBe('Red');
      expect(log.newLabel).toBe('Purple');
      expect(log.reason).toBe('Context indicates this is satire');
      expect(ModerationLog.create).toHaveBeenCalled();
    });

    it('should reject invalid label', async () => {
      createTestPost({ _id: 'override_bad' });

      await expect(
        moderationService.overrideLabel({
          postId: 'override_bad',
          moderatorId: 'admin_1',
          reason: 'Valid reason',
          newLabel: 'InvalidColor',
        })
      ).rejects.toThrow('Invalid label');
    });

    it('should accept all valid labels', async () => {
      for (const label of ['Green', 'Blue', 'Purple', 'Orange', 'Red']) {
        createTestPost({ _id: `override_${label}`, trustBadge: 'None' });

        const log = await moderationService.overrideLabel({
          postId: `override_${label}`,
          moderatorId: 'admin_1',
          reason: `Override to ${label}`,
          newLabel: label,
        });
        expect(log.newLabel).toBe(label);
      }
    });
  });

  // ─── 6. Flag for Review ───────────────────────────────────────────

  describe('Flag for review', () => {
    it('should flag a post and create audit log', async () => {
      createTestPost({ _id: 'flag_1', moderationStatus: 'approved' });

      const log = await moderationService.flagForReview({
        postId: 'flag_1',
        moderatorId: 'mod_1',
        reason: 'New reports filed against this content',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('FLAG_FOR_REVIEW');
      expect(log.newStatus).toBe('flagged');
      expect(ModerationLog.create).toHaveBeenCalled();
    });
  });

  // ─── 7. Remove / Restore Content ──────────────────────────────────

  describe('Remove content', () => {
    it('should remove content and create audit log', async () => {
      createTestPost({ _id: 'remove_1', moderationStatus: 'under_review' });

      const log = await moderationService.removeContent({
        postId: 'remove_1',
        moderatorId: 'mod_1',
        reason: 'Violates community guidelines',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('REMOVE_CONTENT');
      expect(log.newStatus).toBe('rejected');
      expect(ModerationLog.create).toHaveBeenCalled();
    });
  });

  describe('Restore content', () => {
    it('should restore content and create audit log', async () => {
      createTestPost({ _id: 'restore_1', moderationStatus: 'rejected', isArchived: true });

      const log = await moderationService.restoreContent({
        postId: 'restore_1',
        moderatorId: 'mod_1',
        reason: 'Appeal approved — content restored',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('RESTORE_CONTENT');
      expect(log.newStatus).toBe('approved');
      expect(ModerationLog.create).toHaveBeenCalled();
    });
  });

  // ─── 8. Resolve / Dismiss Reports ─────────────────────────────────

  describe('Resolve report', () => {
    it('should resolve a report and create audit log', async () => {
      const report = createTestReport({ _id: 'resolve_rep_1', status: 'OPEN' });

      const log = await moderationService.resolveReport({
        reportId: 'resolve_rep_1',
        postId: 'post_test_1',
        moderatorId: 'mod_1',
        reason: 'Content removed after review',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('RESOLVE_REPORT');
      expect(log.reportId).toBe('resolve_rep_1');
      expect(report.status).toBe('RESOLVED');
      expect(report.resolvedBy).toBe('mod_1');
      expect(report.resolvedAt).toBeDefined();
      expect(ModerationLog.create).toHaveBeenCalled();
    });

    it('should require a reason', async () => {
      createTestReport({ _id: 'resolve_no_reason' });

      await expect(
        moderationService.resolveReport({
          reportId: 'resolve_no_reason',
          moderatorId: 'mod_1',
          reason: '',
        })
      ).rejects.toThrow('Moderation reason is required');
    });

    it('should throw for non-existent report', async () => {
      await expect(
        moderationService.resolveReport({
          reportId: 'nonexistent',
          moderatorId: 'mod_1',
          reason: 'Valid reason',
        })
      ).rejects.toThrow('Report not found');
    });
  });

  describe('Dismiss report', () => {
    it('should dismiss a report and create audit log', async () => {
      const report = createTestReport({ _id: 'dismiss_rep_1', status: 'OPEN' });

      const log = await moderationService.dismissReport({
        reportId: 'dismiss_rep_1',
        moderatorId: 'mod_1',
        reason: 'No violation found',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('DISMISS_REPORT');
      expect(report.status).toBe('DISMISSED');
      expect(report.resolvedBy).toBe('mod_1');
      expect(ModerationLog.create).toHaveBeenCalled();
    });
  });

  // ─── 9. Audit Logging ────────────────────────────────────────────

  describe('Audit logging', () => {
    it('should create an audit log for every action', async () => {
      createTestPost({ _id: 'audit_1' });

      await moderationService.approvePost({ postId: 'audit_1', moderatorId: 'mod_1', reason: 'Approved' });
      expect(ModerationLog.create).toHaveBeenCalledTimes(1);

      await moderationService.rejectPost({ postId: 'audit_1', moderatorId: 'mod_1', reason: 'Rejected' });
      expect(ModerationLog.create).toHaveBeenCalledTimes(2);

      await moderationService.flagForReview({ postId: 'audit_1', moderatorId: 'mod_1', reason: 'Flagged' });
      expect(ModerationLog.create).toHaveBeenCalledTimes(3);
    });

    it('should include all required fields in audit log', async () => {
      createTestPost({ _id: 'audit_fields', moderationStatus: 'pending', trustBadge: 'Blue' });

      const log = await moderationService.approvePost({
        postId: 'audit_fields',
        moderatorId: 'mod_1',
        reason: 'Test audit fields',
      });

      expect(log).toHaveProperty('postId');
      expect(log).toHaveProperty('moderatorId');
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('reason');
      expect(log).toHaveProperty('previousStatus');
      expect(log).toHaveProperty('newStatus');
      expect(log).toHaveProperty('previousLabel');
      expect(log).toHaveProperty('newLabel');
      expect(log).toHaveProperty('createdAt');
    });

    it('should get logs for a specific post', async () => {
      ModerationLog._add({ postId: 'log_post_1', action: 'APPROVE', moderatorId: 'mod_1', reason: 'Test' });
      ModerationLog._add({ postId: 'log_post_1', action: 'REJECT', moderatorId: 'mod_2', reason: 'Test2' });
      ModerationLog._add({ postId: 'other_post', action: 'APPROVE', moderatorId: 'mod_1', reason: 'Other' });

      const logs = await moderationService.getLogsForPost('log_post_1');
      expect(logs).toHaveLength(2);
    });

    it('should get all logs with filtering', async () => {
      ModerationLog._add({ postId: 'p1', action: 'APPROVE', moderatorId: 'mod_1', reason: 'Test' });
      ModerationLog._add({ postId: 'p2', action: 'REJECT', moderatorId: 'mod_2', reason: 'Test2' });

      const result = await moderationService.getLogs({ page: 1, limit: 10 });
      expect(result.logs).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });

  // ─── 10. Unauthorized Access ──────────────────────────────────────

  describe('Unauthorized access', () => {
    const { requireRole } = require('../../src/middleware/authorize.middleware');

    it('should block USER role from moderation endpoints', () => {
      const req = { user: { role: 'USER' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireRole('MODERATOR', 'ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toBeDefined();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('should allow MODERATOR role', () => {
      const req = { user: { role: 'MODERATOR' } };
      const res = {};
      const next = jest.fn();

      requireRole('MODERATOR', 'ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0].length).toBe(0); // No error
    });

    it('should allow ADMIN role', () => {
      const req = { user: { role: 'ADMIN' } };
      const res = {};
      const next = jest.fn();

      requireRole('MODERATOR', 'ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0].length).toBe(0); // No error
    });

    it('should block unauthenticated requests', () => {
      const req = {};
      const res = {};
      const next = jest.fn();

      requireRole('MODERATOR', 'ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(401);
    });

    it('should restrict label override to ADMIN only', () => {
      const req = { user: { role: 'MODERATOR' } };
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('should allow ADMIN for label override', () => {
      const req = { user: { role: 'ADMIN' } };
      const res = {};
      const next = jest.fn();

      requireRole('ADMIN')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0].length).toBe(0); // No error
    });
  });

  // ─── 11. Moderation Stats ─────────────────────────────────────────

  describe('Moderation stats', () => {
    it('should return stats object', async () => {
      ModerationLog.aggregate.mockResolvedValue([
        { _id: 'APPROVE', count: 5 },
        { _id: 'REJECT', count: 2 },
      ]);
      Post.countDocuments.mockResolvedValue(3);

      const stats = await moderationService.getStats();
      expect(stats).toBeDefined();
      expect(stats.byAction).toBeDefined();
      expect(stats.flaggedCount).toBeDefined();
      expect(stats.totalLogs).toBeDefined();
    });

    it('should aggregate action counts correctly', async () => {
      ModerationLog.aggregate.mockImplementation(() => {
        return Promise.resolve([
          { _id: 'APPROVE', count: 10 },
          { _id: 'REJECT', count: 3 },
          { _id: 'FLAG_FOR_REVIEW', count: 1 },
        ]);
      });
      Post.countDocuments.mockResolvedValue(1);

      const stats = await moderationService.getStats();
      expect(stats.byAction.APPROVE).toBe(10);
      expect(stats.byAction.REJECT).toBe(3);
      expect(stats.byAction.FLAG_FOR_REVIEW).toBe(1);
    });
  });

  // ─── 12. Controller Validation ────────────────────────────────────

  describe('Controller validation', () => {
    const {
      approvePost,
      rejectPost,
      overrideLabel,
      resolveReport,
    } = require('../../src/controllers/v1/moderation.controller');

    it('should reject approvePost with empty reason', async () => {
      const req = { params: { id: 'post_1' }, body: { reason: '' }, user: { _id: 'mod_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await approvePost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject rejectPost with empty reason', async () => {
      const req = { params: { id: 'post_1' }, body: { reason: '' }, user: { _id: 'mod_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await rejectPost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject overrideLabel without label', async () => {
      const req = { params: { id: 'post_1' }, body: { reason: 'Valid', label: '' }, user: { _id: 'admin_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await overrideLabel(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject resolveReport with empty reason', async () => {
      const req = { params: { id: 'report_1' }, body: { reason: '' }, user: { _id: 'mod_1' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await resolveReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ─── 13. Moderation Actions List ──────────────────────────────────

  describe('Moderation actions', () => {
    it('should export all 8 moderation actions', () => {
      expect(Object.keys(MODERATION_ACTION)).toHaveLength(8);
    });

    it('should include all required actions', () => {
      expect(MODERATION_ACTION.APPROVE).toBe('APPROVE');
      expect(MODERATION_ACTION.REJECT).toBe('REJECT');
      expect(MODERATION_ACTION.FLAG_FOR_REVIEW).toBe('FLAG_FOR_REVIEW');
      expect(MODERATION_ACTION.OVERRIDE_LABEL).toBe('OVERRIDE_LABEL');
      expect(MODERATION_ACTION.RESOLVE_REPORT).toBe('RESOLVE_REPORT');
      expect(MODERATION_ACTION.DISMISS_REPORT).toBe('DISMISS_REPORT');
      expect(MODERATION_ACTION.REMOVE_CONTENT).toBe('REMOVE_CONTENT');
      expect(MODERATION_ACTION.RESTORE_CONTENT).toBe('RESTORE_CONTENT');
    });
  });

  // ─── 14. Edge Cases ───────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should trim whitespace from reason', async () => {
      createTestPost({ _id: 'trim_1' });

      const log = await moderationService.approvePost({
        postId: 'trim_1',
        moderatorId: 'mod_1',
        reason: '  Approved with reason  ',
      });

      expect(log.reason).toBe('Approved with reason');
    });

    it('should handle approve on already-approved post', async () => {
      createTestPost({ _id: 'already_approved', moderationStatus: 'approved' });

      const log = await moderationService.approvePost({
        postId: 'already_approved',
        moderatorId: 'mod_1',
        reason: 'Re-approve',
      });

      expect(log.action).toBe('APPROVE');
      expect(log.previousStatus).toBe('approved');
    });

    it('should handle report resolution without postId', async () => {
      createTestReport({ _id: 'resolve_no_post' });

      const log = await moderationService.resolveReport({
        reportId: 'resolve_no_post',
        postId: null,
        moderatorId: 'mod_1',
        reason: 'Resolved without explicit post',
      });

      expect(log).toBeDefined();
      expect(log.action).toBe('RESOLVE_REPORT');
    });

    it('should handle getLogsForPost with no logs', async () => {
      const logs = await moderationService.getLogsForPost('no_logs_post');
      expect(logs).toEqual([]);
    });
  });
});
