/**
 * Community Reporting Service Tests (Module 19)
 * ==============================================
 * Comprehensive tests for the user reporting system.
 *
 * Covers:
 *   1. Report creation (all reasons, descriptions, validation)
 *   2. Duplicate prevention
 *   3. Self-report prevention
 *   4. Target validation
 *   5. Status management (OPEN → UNDER_REVIEW → RESOLVED/DISMISSED)
 *   6. Reporting listing with filters
 *   7. Reporter's own reports
 *   8. Moderation dashboard stats
 *   9. Anti-abuse protections
 *  10. Edge cases and error handling
 *
 * Run with: npm test -- --testPathPatterns=report
 */

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock the Report model
jest.mock('../../src/models/report.model', () => {
  const REPORT_REASON = {
    MISINFORMATION: 'MISINFORMATION',
    HARASSMENT: 'HARASSMENT',
    HARMFUL_CONTENT: 'HARMFUL_CONTENT',
    IMPERSONATION: 'IMPERSONATION',
    MANIPULATED_MEDIA: 'MANIPULATED_MEDIA',
    SPAM: 'SPAM',
    OTHER: 'OTHER',
  };

  const REPORT_STATUS = {
    OPEN: 'OPEN',
    UNDER_REVIEW: 'UNDER_REVIEW',
    RESOLVED: 'RESOLVED',
    DISMISSED: 'DISMISSED',
  };

  const mockReports = [];
  let idCounter = 1;

  const MockReport = function (data) {
    Object.assign(this, data);
    this._id = data._id || `report_${idCounter++}`;
    this.createdAt = data.createdAt || new Date();
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    // populate returns the instance itself (for chaining)
    this.populate = jest.fn().mockReturnValue(this);
  };

  // Static methods
  MockReport.create = jest.fn().mockImplementation((data) => {
    const doc = new MockReport(data);
    mockReports.push(doc);
    return Promise.resolve(doc);
  });

  MockReport.findById = jest.fn().mockImplementation((id) => {
    const found = mockReports.find((r) => r._id === id);
    // Return a chainable query object (like Mongoose)
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => {
      return Promise.resolve(found || null).then(resolve, reject);
    };
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockReport.find = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockReports];
    if (filter.status) results = results.filter((r) => r.status === filter.status);
    if (filter.reason) results = results.filter((r) => r.reason === filter.reason);
    if (filter.targetType) results = results.filter((r) => r.targetType === filter.targetType);
    if (filter.reporter) results = results.filter((r) => r.reporter === filter.reporter);
    if (filter.createdAt) results = results.filter(() => true); // don't filter by date in tests

    // Chainable query mock
    const chain = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => {
      return Promise.resolve(results).then(resolve, reject);
    };
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
    return chain;
  });

  MockReport.countDocuments = jest.fn().mockImplementation((filter = {}) => {
    let results = [...mockReports];
    if (filter.status) results = results.filter((r) => r.status === filter.status);
    if (filter.reporter) results = results.filter((r) => r.reporter === filter.reporter);
    return Promise.resolve(results.length);
  });

  MockReport.aggregate = jest.fn().mockResolvedValue([]);

  // Reset helper
  MockReport._reset = () => {
    mockReports.length = 0;
    idCounter = 1;
  };

  // Access internal reports for test setup
  MockReport._reports = mockReports;

  MockReport.REPORT_REASON = REPORT_REASON;
  MockReport.REPORT_STATUS = REPORT_STATUS;

  return MockReport;
});

// Mock Post model
jest.mock('../../src/models/post.model', () => {
  const mockFindById = jest.fn();
  return { findById: mockFindById };
});

// Mock Comment model
jest.mock('../../src/models/comment.model', () => {
  const mockFindById = jest.fn();
  return { findById: mockFindById };
});

// Mock User model
jest.mock('../../src/models/user.model', () => {
  const mockFindById = jest.fn();
  return { findById: mockFindById };
});

// ─── Imports ──────────────────────────────────────────────────────────

const Report = require('../../src/models/report.model');
const Post = require('../../src/models/post.model');
const Comment = require('../../src/models/comment.model');
const User = require('../../src/models/user.model');
const reportService = require('../../src/services/report.service');
const { REPORT_REASON, REPORT_STATUS } = require('../../src/models/report.model');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Community Reporting Service (Module 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Report._reset();

    // Default: all targets exist
    Post.findById.mockResolvedValue({ _id: 'post_1', user: 'user_post_author' });
    Comment.findById.mockResolvedValue({ _id: 'comment_1', user: 'user_comment_author' });
    User.findById.mockResolvedValue({ _id: 'user_target', username: 'target_user' });

    // Re-setup findById chainable mock (clearAllMocks may have reset it)
    Report.findById.mockImplementation((id) => {
      const found = Report._reports.find((r) => r._id === id);
      const chain = {};
      chain.populate = jest.fn().mockReturnValue(chain);
      chain.sort = jest.fn().mockReturnValue(chain);
      chain.select = jest.fn().mockReturnValue(chain);
      chain.then = (resolve, reject) => {
        return Promise.resolve(found || null).then(resolve, reject);
      };
      chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
      return chain;
    });
  });

  // ─── 1. Report Creation ────────────────────────────────────────────

  describe('Report creation', () => {
    it('should create a report with valid data', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'MISINFORMATION',
        description: 'This post contains false claims',
      });

      expect(report).toBeDefined();
      expect(report.reason).toBe('MISINFORMATION');
      expect(report.description).toBe('This post contains false claims');
      expect(report.status).toBe('OPEN');
      expect(report.reporter).toBe('reporter_1');
      expect(report.targetType).toBe('Post');
      expect(report.targetId).toBe('post_1');
    });

    it('should create a report with all valid reasons', async () => {
      for (const reason of Object.values(REPORT_REASON)) {
        const report = await reportService.create({
          reporterId: `reporter_${reason}`,
          targetType: 'Post',
          targetId: 'post_1',
          reason,
        });
        expect(report.reason).toBe(reason);
      }
    });

    it('should default status to OPEN', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
      });
      expect(report.status).toBe('OPEN');
    });

    it('should trim and limit description length', async () => {
      const longDesc = 'A'.repeat(2000);
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'OTHER',
        description: longDesc,
      });
      expect(report.description.length).toBeLessThanOrEqual(1000);
    });

    it('should allow empty description', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
      });
      expect(report.description).toBe('');
    });

    it('should create report for Comment target', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Comment',
        targetId: 'comment_1',
        reason: 'HARASSMENT',
      });
      expect(report.targetType).toBe('Comment');
    });

    it('should create report for User target', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'User',
        targetId: 'user_target',
        reason: 'IMPERSONATION',
      });
      expect(report.targetType).toBe('User');
    });
  });

  // ─── 2. Duplicate Prevention ───────────────────────────────────────

  describe('Duplicate prevention', () => {
    it('should reject duplicate report from same user on same target', async () => {
      // First report succeeds
      await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
      });

      // Mock the unique index error for duplicate
      Report.create.mockRejectedValueOnce({ code: 11000 });

      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'Post',
          targetId: 'post_1',
          reason: 'HARASSMENT',
        })
      ).rejects.toThrow('You have already reported this content');
    });

    it('should allow different users to report the same target', async () => {
      const report1 = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
      });
      expect(report1).toBeDefined();

      const report2 = await reportService.create({
        reporterId: 'reporter_2',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'MISINFORMATION',
      });
      expect(report2).toBeDefined();
    });

    it('should allow same user to report different targets', async () => {
      const report1 = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
      });
      expect(report1).toBeDefined();

      const report2 = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_2',
        reason: 'SPAM',
      });
      expect(report2).toBeDefined();
    });
  });

  // ─── 3. Self-Report Prevention ─────────────────────────────────────

  describe('Self-report prevention', () => {
    it('should prevent users from reporting their own posts', async () => {
      await expect(
        reportService.create({
          reporterId: 'user_post_author',
          targetType: 'Post',
          targetId: 'post_1',
          reason: 'SPAM',
        })
      ).rejects.toThrow('You cannot report your own content');
    });

    it('should prevent users from reporting their own comments', async () => {
      await expect(
        reportService.create({
          reporterId: 'user_comment_author',
          targetType: 'Comment',
          targetId: 'comment_1',
          reason: 'HARASSMENT',
        })
      ).rejects.toThrow('You cannot report your own content');
    });

    it('should prevent users from reporting themselves', async () => {
      await expect(
        reportService.create({
          reporterId: 'user_target',
          targetType: 'User',
          targetId: 'user_target',
          reason: 'IMPERSONATION',
        })
      ).rejects.toThrow('You cannot report your own content');
    });
  });

  // ─── 4. Target Validation ──────────────────────────────────────────

  describe('Target validation', () => {
    it('should reject report for non-existent post', async () => {
      Post.findById.mockResolvedValue(null);

      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'Post',
          targetId: 'nonexistent_post',
          reason: 'SPAM',
        })
      ).rejects.toThrow('Post not found');
    });

    it('should reject report for non-existent comment', async () => {
      Comment.findById.mockResolvedValue(null);

      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'Comment',
          targetId: 'nonexistent_comment',
          reason: 'HARASSMENT',
        })
      ).rejects.toThrow('Comment not found');
    });

    it('should reject report for non-existent user', async () => {
      User.findById.mockResolvedValue(null);

      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'User',
          targetId: 'nonexistent_user',
          reason: 'IMPERSONATION',
        })
      ).rejects.toThrow('User not found');
    });

    it('should reject invalid targetType', async () => {
      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'InvalidType',
          targetId: 'post_1',
          reason: 'SPAM',
        })
      ).rejects.toThrow('Invalid targetType');
    });

    it('should reject invalid reason', async () => {
      await expect(
        reportService.create({
          reporterId: 'reporter_1',
          targetType: 'Post',
          targetId: 'post_1',
          reason: 'INVALID_REASON',
        })
      ).rejects.toThrow('Invalid reason');
    });
  });

  // ─── 5. Status Management ──────────────────────────────────────────

  describe('Status management', () => {
    it('should update status to UNDER_REVIEW', async () => {
      const mockReport = new Report({
        _id: 'report_update_1',
        reporter: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'MISINFORMATION',
        status: 'OPEN',
      });
      Report.findById.mockResolvedValue(mockReport);

      const updated = await reportService.updateStatus({
        reportId: 'report_update_1',
        status: 'UNDER_REVIEW',
        moderatorId: 'mod_1',
      });

      expect(updated.status).toBe('UNDER_REVIEW');
      expect(updated.save).toHaveBeenCalled();
    });

    it('should set resolvedAt when status moves to RESOLVED', async () => {
      const mockReport = new Report({
        _id: 'report_resolve_1',
        reporter: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
        status: 'UNDER_REVIEW',
      });
      Report.findById.mockResolvedValue(mockReport);

      const updated = await reportService.updateStatus({
        reportId: 'report_resolve_1',
        status: 'RESOLVED',
        moderatorId: 'mod_1',
        resolutionNote: 'Content removed',
      });

      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedBy).toBe('mod_1');
      expect(updated.resolvedAt).toBeDefined();
      expect(updated.resolutionNote).toBe('Content removed');
    });

    it('should set resolvedAt when status moves to DISMISSED', async () => {
      const mockReport = new Report({
        _id: 'report_dismiss_1',
        reporter: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'OTHER',
        status: 'OPEN',
      });
      Report.findById.mockResolvedValue(mockReport);

      const updated = await reportService.updateStatus({
        reportId: 'report_dismiss_1',
        status: 'DISMISSED',
        moderatorId: 'mod_1',
        resolutionNote: 'No violation found',
      });

      expect(updated.status).toBe('DISMISSED');
      expect(updated.resolvedAt).toBeDefined();
    });

    it('should clear resolution info when moving back to OPEN', async () => {
      const mockReport = new Report({
        _id: 'report_reopen_1',
        reporter: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
        status: 'RESOLVED',
        resolvedBy: 'mod_1',
        resolvedAt: new Date(),
        resolutionNote: 'Was resolved',
      });
      Report.findById.mockResolvedValue(mockReport);

      const updated = await reportService.updateStatus({
        reportId: 'report_reopen_1',
        status: 'OPEN',
        moderatorId: 'mod_2',
      });

      expect(updated.status).toBe('OPEN');
      expect(updated.resolvedAt).toBeNull();
      expect(updated.resolvedBy).toBeNull();
      expect(updated.resolutionNote).toBeNull();
    });

    it('should reject invalid status', async () => {
      const mockReport = new Report({
        _id: 'report_bad_status',
        reporter: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_1',
        reason: 'SPAM',
        status: 'OPEN',
      });
      Report.findById.mockResolvedValue(mockReport);

      await expect(
        reportService.updateStatus({
          reportId: 'report_bad_status',
          status: 'INVALID_STATUS',
          moderatorId: 'mod_1',
        })
      ).rejects.toThrow('Invalid status');
    });

    it('should throw when report not found', async () => {
      Report.findById.mockResolvedValue(null);

      await expect(
        reportService.updateStatus({
          reportId: 'nonexistent',
          status: 'RESOLVED',
          moderatorId: 'mod_1',
        })
      ).rejects.toThrow('Report not found');
    });
  });

  // ─── 6. Report Listing ─────────────────────────────────────────────

  describe('Report listing', () => {
    it('should list all reports with pagination', async () => {
      // Create some reports
      for (let i = 0; i < 5; i++) {
        await reportService.create({
          reporterId: `reporter_${i}`,
          targetType: 'Post',
          targetId: `post_${i}`,
          reason: 'SPAM',
        });
      }

      const result = await reportService.getAll({ page: 1, limit: 3 });
      expect(result.reports).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(3);
    });

    it('should filter reports by status', async () => {
      await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_filter_1',
        reason: 'SPAM',
      });

      const result = await reportService.getAll({ status: 'OPEN' });
      expect(result.reports).toBeDefined();
    });

    it('should filter reports by reason', async () => {
      await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_reason_1',
        reason: 'MISINFORMATION',
      });

      const result = await reportService.getAll({ reason: 'MISINFORMATION' });
      expect(result.reports).toBeDefined();
    });

    it('should reject invalid status filter', async () => {
      await expect(
        reportService.getAll({ status: 'INVALID' })
      ).rejects.toThrow('Invalid status filter');
    });

    it('should reject invalid reason filter', async () => {
      await expect(
        reportService.getAll({ reason: 'INVALID' })
      ).rejects.toThrow('Invalid reason filter');
    });
  });

  // ─── 7. Reporter's Own Reports ─────────────────────────────────────

  describe("Reporter's own reports", () => {
    it('should return reports by a specific reporter', async () => {
      await reportService.create({
        reporterId: 'my_user',
        targetType: 'Post',
        targetId: 'post_my_1',
        reason: 'SPAM',
      });

      await reportService.create({
        reporterId: 'my_user',
        targetType: 'Post',
        targetId: 'post_my_2',
        reason: 'HARASSMENT',
      });

      await reportService.create({
        reporterId: 'other_user',
        targetType: 'Post',
        targetId: 'post_other',
        reason: 'SPAM',
      });

      const result = await reportService.getByReporter('my_user');
      expect(result.reports).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });

  // ─── 8. Get Report by Target ───────────────────────────────────────

  describe('Get report by target', () => {
    it('should return reports for a specific target', async () => {
      await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_targeted',
        reason: 'SPAM',
      });

      await reportService.create({
        reporterId: 'reporter_2',
        targetType: 'Post',
        targetId: 'post_targeted',
        reason: 'MISINFORMATION',
      });

      const reports = await reportService.getByTarget('Post', 'post_targeted');
      expect(reports).toBeDefined();
    });
  });

  // ─── 9. Get Report by ID ───────────────────────────────────────────

  describe('Get report by ID', () => {
    it('should return a report by ID', async () => {
      const created = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_by_id',
        reason: 'SPAM',
      });

      const found = await reportService.getById(created._id);
      expect(found).toBeDefined();
    });

    it('should return null for non-existent report', async () => {
      // The default beforeEach mock already handles this (not in _reports)
      const found = await reportService.getById('nonexistent_id');
      expect(found).toBeNull();
    });
  });

  // ─── 10. Moderation Dashboard Stats ────────────────────────────────

  describe('Moderation dashboard stats', () => {
    it('should return stats object', async () => {
      Report.aggregate.mockResolvedValue([
        { _id: 'OPEN', count: 5 },
        { _id: 'UNDER_REVIEW', count: 2 },
      ]);

      const stats = await reportService.getStats();
      expect(stats).toBeDefined();
      expect(stats.byStatus).toBeDefined();
      expect(stats.byReason).toBeDefined();
      expect(stats.recentCount).toBeDefined();
      expect(stats.total).toBeDefined();
    });

    it('should aggregate status counts correctly', async () => {
      Report.aggregate.mockImplementation((pipeline) => {
        // First call is status counts, second is reason counts
        if (pipeline[0]?.$group?._id === '$status') {
          return Promise.resolve([
            { _id: 'OPEN', count: 10 },
            { _id: 'RESOLVED', count: 5 },
          ]);
        }
        return Promise.resolve([]);
      });

      const stats = await reportService.getStats();
      expect(stats.byStatus.OPEN).toBe(10);
      expect(stats.byStatus.RESOLVED).toBe(5);
    });
  });

  // ─── 11. Report Reasons ────────────────────────────────────────────

  describe('Report reasons', () => {
    it('should export all 7 report reasons', () => {
      expect(Object.keys(REPORT_REASON)).toHaveLength(7);
    });

    it('should include all required categories', () => {
      expect(REPORT_REASON.MISINFORMATION).toBe('MISINFORMATION');
      expect(REPORT_REASON.HARASSMENT).toBe('HARASSMENT');
      expect(REPORT_REASON.HARMFUL_CONTENT).toBe('HARMFUL_CONTENT');
      expect(REPORT_REASON.IMPERSONATION).toBe('IMPERSONATION');
      expect(REPORT_REASON.MANIPULATED_MEDIA).toBe('MANIPULATED_MEDIA');
      expect(REPORT_REASON.SPAM).toBe('SPAM');
      expect(REPORT_REASON.OTHER).toBe('OTHER');
    });
  });

  // ─── 12. Report Statuses ───────────────────────────────────────────

  describe('Report statuses', () => {
    it('should export all 4 report statuses', () => {
      expect(Object.keys(REPORT_STATUS)).toHaveLength(4);
    });

    it('should include all required statuses', () => {
      expect(REPORT_STATUS.OPEN).toBe('OPEN');
      expect(REPORT_STATUS.UNDER_REVIEW).toBe('UNDER_REVIEW');
      expect(REPORT_STATUS.RESOLVED).toBe('RESOLVED');
      expect(REPORT_STATUS.DISMISSED).toBe('DISMISSED');
    });
  });

  // ─── 13. Rate Limiting Middleware ──────────────────────────────────

  describe('Rate limiting middleware', () => {
    const { createRateLimiter } = require('../../src/middleware/rate-limit.middleware');

    it('should allow requests within the limit', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
      const req = { user: { _id: 'user_rl_1' }, ip: '127.0.0.1' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);

      expect(next).toHaveBeenCalledTimes(3);
      // All calls should be successful (no error)
      expect(next.mock.calls.every((c) => c.length === 0)).toBe(true);
    });

    it('should block requests over the limit', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
      const req = { user: { _id: 'user_rl_2' }, ip: '127.0.0.1' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next); // This should be blocked

      expect(next).toHaveBeenCalledTimes(3);
      // Third call should have an error
      expect(next.mock.calls[2][0]).toBeDefined();
      expect(next.mock.calls[2][0].statusCode).toBe(429);
    });

    it('should set Retry-After header when rate limited', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
      const req = { user: { _id: 'user_rl_3' }, ip: '127.0.0.1' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should use IP as fallback when no user', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
      const req = { ip: '192.168.1.1' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(next.mock.calls[1][0].statusCode).toBe(429);
    });

    it('should reset after window expires', async () => {
      const limiter = createRateLimiter({ windowMs: 50, max: 1 });
      const req = { user: { _id: 'user_rl_4' }, ip: '127.0.0.1' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next); // OK
      limiter(req, res, next); // Blocked

      expect(next.mock.calls[1][0].statusCode).toBe(429);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 60));

      next.mockClear();
      limiter(req, res, next); // Should be OK again
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0].length).toBe(0); // No error
    });
  });

  // ─── 14. Controller Validation ─────────────────────────────────────

  describe('Controller validation', () => {
    const { createReport, createGenericReport, getReports, updateReportStatus } = require('../../src/controllers/v1/report.controller');

    it('should reject createReport with empty reason', async () => {
      const req = {
        params: { id: 'post_1' },
        body: { reason: '' },
        user: { _id: 'reporter_1' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await createReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Report reason is required' })
      );
    });

    it('should reject createGenericReport with missing fields', async () => {
      const req = {
        body: { targetType: 'Post' }, // missing targetId and reason
        user: { _id: 'reporter_1' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await createGenericReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject updateReportStatus with missing status', async () => {
      const req = {
        params: { id: 'report_1' },
        body: {},
        user: { _id: 'mod_1' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await updateReportStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ─── 15. Edge Cases ────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle report with whitespace-only description', async () => {
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_edge_1',
        reason: 'SPAM',
        description: '   ',
      });
      expect(report.description).toBe('');
    });

    it('should handle very long description (truncated to 1000 chars)', async () => {
      const longDesc = 'X'.repeat(1500);
      const report = await reportService.create({
        reporterId: 'reporter_1',
        targetType: 'Post',
        targetId: 'post_edge_2',
        reason: 'OTHER',
        description: longDesc,
      });
      expect(report.description.length).toBeLessThanOrEqual(1000);
    });

    it('should handle getAll with default parameters', async () => {
      const result = await reportService.getAll();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should handle getByReporter with default parameters', async () => {
      const result = await reportService.getByReporter('reporter_1');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should handle getByTarget with no results', async () => {
      const reports = await reportService.getByTarget('Post', 'no_reports_post');
      expect(reports).toEqual([]);
    });
  });
});
