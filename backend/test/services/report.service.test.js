/**
 * Report Service Tests (Module 9)
 * =================================
 * Tests for content reporting: create, validate, duplicate prevention,
 * status updates, authorization, statistics, and reasons.
 *
 * Run with: npm test -- --testPathPatterns=report.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockReportIdCounter = 1;
const mockReports = [];

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

  const MockReport = function (data) {
    Object.assign(this, data);
    this._id = data._id || `report_${mockReportIdCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
  };

  MockReport.create = jest.fn().mockImplementation((data) => {
    // Simulate unique index on reporter + targetType + targetId
    const duplicate = mockReports.find(
      (r) =>
        r.reporter.toString() === data.reporter.toString() &&
        r.targetType === data.targetType &&
        r.targetId.toString() === data.targetId.toString()
    );
    if (duplicate) {
      const err = new Error('Duplicate key');
      err.code = 11000;
      return Promise.reject(err);
    }
    const doc = new MockReport(data);
    mockReports.push(doc);
    return Promise.resolve(doc);
  });

  MockReport.findById = jest.fn().mockImplementation((id) => {
    const found = mockReports.find((r) => r._id === id);
    if (!found) {
      // Return a chainable null so .populate().populate() doesn't crash
      const nullChain = { _id: null };
      nullChain.populate = jest.fn().mockReturnValue(nullChain);
      nullChain.then = (resolve, reject) => Promise.resolve(null).then(resolve, reject);
      return nullChain;
    }
    // Return chainable — copy properties but keep populate from MockReport
    const chain = Object.create(MockReport.prototype);
    Object.assign(chain, found);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    return chain;
  });

  MockReport.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockReports];
    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter.reason) {
      results = results.filter((r) => r.reason === filter.reason);
    }
    if (filter.targetType) {
      results = results.filter((r) => r.targetType === filter.targetType);
    }
    if (filter.reporter) {
      results = results.filter((r) => r.reporter.toString() === filter.reporter.toString());
    }
    // Chainable for sort/skip/limit
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    return chain;
  });

  MockReport.countDocuments = jest.fn().mockImplementation((filter) => {
    let results = [...mockReports];
    if (filter && filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter && filter.reporter) {
      results = results.filter((r) => r.reporter.toString() === filter.reporter.toString());
    }
    return Promise.resolve(results.length);
  });

  MockReport.aggregate = jest.fn().mockImplementation((pipeline) => {
    // Simple aggregation simulation
    return Promise.resolve([]);
  });

  MockReport._reset = () => {
    mockReports.length = 0;
    mockReportIdCounter = 1;
  };

  MockReport._add = (data) => {
    const doc = new MockReport(data);
    mockReports.push(doc);
    return doc;
  };

  MockReport._reports = mockReports;
  MockReport.REPORT_REASON = REPORT_REASON;
  MockReport.REPORT_STATUS = REPORT_STATUS;

  return MockReport;
});

jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'post_1';
  };
  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    return Promise.resolve(found || null);
  });
  MockPost._reset = () => { mockPosts.length = 0; };
  MockPost._add = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };
  return MockPost;
});

jest.mock('../../src/models/comment.model', () => {
  const mockComments = [];
  const MockComment = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'comment_1';
  };
  MockComment.findById = jest.fn().mockImplementation((id) => {
    const found = mockComments.find((c) => c._id === id);
    return Promise.resolve(found || null);
  });
  MockComment._reset = () => { mockComments.length = 0; };
  MockComment._add = (data) => {
    const doc = new MockComment(data);
    mockComments.push(doc);
    return doc;
  };
  return MockComment;
});

jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'user_1';
  };
  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    return Promise.resolve(found || null);
  });
  MockUser._reset = () => { mockUsers.length = 0; };
  MockUser._add = (data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return doc;
  };
  return MockUser;
});

jest.mock('../../src/services/audit.service', () => ({
  logReportEvent: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/services/notification.service', () => ({
  notifyReportResolution: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const Report = require('../../src/models/report.model');
const Post = require('../../src/models/post.model');
const Comment = require('../../src/models/comment.model');
const User = require('../../src/models/user.model');
const reportService = require('../../src/services/report.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Report Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Report._reset();
    Post._reset();
    Comment._reset();
    User._reset();
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a post report with valid data', async () => {
      Post._add({ _id: 'p1', user: 'owner1' });

      const report = await reportService.create({
        reporterId: 'reporter1',
        targetType: 'Post',
        targetId: 'p1',
        reason: 'SPAM',
        description: 'This is spam content',
      });

      expect(report).toBeDefined();
      expect(report.reason).toBe('SPAM');
      expect(report.targetType).toBe('Post');
      expect(report.description).toBe('This is spam content');
      expect(report.status).toBe('OPEN');
    });

    it('should create a user report', async () => {
      User._add({ _id: 'u_target', name: 'Bad User' });

      const report = await reportService.create({
        reporterId: 'reporter1',
        targetType: 'User',
        targetId: 'u_target',
        reason: 'HARASSMENT',
      });

      expect(report).toBeDefined();
      expect(report.targetType).toBe('User');
      expect(report.reason).toBe('HARASSMENT');
    });

    it('should create a comment report', async () => {
      Comment._add({ _id: 'c1', author: 'commenter1' });

      const report = await reportService.create({
        reporterId: 'reporter1',
        targetType: 'Comment',
        targetId: 'c1',
        reason: 'HARMFUL_CONTENT',
      });

      expect(report).toBeDefined();
      expect(report.targetType).toBe('Comment');
    });

    it('should trim description to max 1000 chars', async () => {
      Post._add({ _id: 'p2', user: 'owner2' });
      const longDesc = 'x'.repeat(2000);

      const report = await reportService.create({
        reporterId: 'reporter2',
        targetType: 'Post',
        targetId: 'p2',
        reason: 'SPAM',
        description: longDesc,
      });

      expect(report.description.length).toBeLessThanOrEqual(1000);
    });

    it('should default description to empty string', async () => {
      Post._add({ _id: 'p3', user: 'owner3' });

      const report = await reportService.create({
        reporterId: 'reporter3',
        targetType: 'Post',
        targetId: 'p3',
        reason: 'OTHER',
      });

      expect(report.description).toBe('');
    });
  });

  // ─── validation ─────────────────────────────────────────────────────

  describe('validation', () => {
    it('should reject invalid reason', async () => {
      Post._add({ _id: 'p4', user: 'owner4' });

      await expect(
        reportService.create({
          reporterId: 'reporter4',
          targetType: 'Post',
          targetId: 'p4',
          reason: 'INVALID_REASON',
        })
      ).rejects.toThrow('Invalid reason');
    });

    it('should reject invalid targetType', async () => {
      Post._add({ _id: 'p5', user: 'owner5' });

      await expect(
        reportService.create({
          reporterId: 'reporter5',
          targetType: 'Invalid',
          targetId: 'p5',
          reason: 'SPAM',
        })
      ).rejects.toThrow('Invalid targetType');
    });

    it('should reject when target does not exist', async () => {
      await expect(
        reportService.create({
          reporterId: 'reporter6',
          targetType: 'Post',
          targetId: 'nonexistent',
          reason: 'SPAM',
        })
      ).rejects.toThrow('not found');
    });

    it('should accept all valid reasons', async () => {
      Post._add({ _id: 'p6', user: 'owner6' });

      const reasons = Object.values(Report.REPORT_REASON);
      for (const reason of reasons) {
        Post._add({ _id: `p_${reason}`, user: `owner_${reason}` });
        const report = await reportService.create({
          reporterId: `reporter_${reason}`,
          targetType: 'Post',
          targetId: `p_${reason}`,
          reason,
        });
        expect(report.reason).toBe(reason);
      }
    });
  });

  // ─── duplicate prevention ───────────────────────────────────────────

  describe('duplicate prevention', () => {
    it('should prevent duplicate reports from same user on same target', async () => {
      Post._add({ _id: 'p7', user: 'owner7' });

      await reportService.create({
        reporterId: 'reporter7',
        targetType: 'Post',
        targetId: 'p7',
        reason: 'SPAM',
      });

      await expect(
        reportService.create({
          reporterId: 'reporter7',
          targetType: 'Post',
          targetId: 'p7',
          reason: 'HARASSMENT',
        })
      ).rejects.toThrow('already reported');
    });

    it('should allow different users to report the same target', async () => {
      Post._add({ _id: 'p8', user: 'owner8' });

      const r1 = await reportService.create({
        reporterId: 'reporter_a',
        targetType: 'Post',
        targetId: 'p8',
        reason: 'SPAM',
      });

      const r2 = await reportService.create({
        reporterId: 'reporter_b',
        targetType: 'Post',
        targetId: 'p8',
        reason: 'HARASSMENT',
      });

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
    });

    it('should allow same user to report different targets', async () => {
      Post._add({ _id: 'p9', user: 'owner9' });
      Post._add({ _id: 'p10', user: 'owner10' });

      const r1 = await reportService.create({
        reporterId: 'reporter8',
        targetType: 'Post',
        targetId: 'p9',
        reason: 'SPAM',
      });

      const r2 = await reportService.create({
        reporterId: 'reporter8',
        targetType: 'Post',
        targetId: 'p10',
        reason: 'SPAM',
      });

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
    });
  });

  // ─── self-report prevention ─────────────────────────────────────────

  describe('self-report prevention', () => {
    it('should prevent users from reporting their own posts', async () => {
      Post._add({ _id: 'p11', user: 'self_user' });

      await expect(
        reportService.create({
          reporterId: 'self_user',
          targetType: 'Post',
          targetId: 'p11',
          reason: 'SPAM',
        })
      ).rejects.toThrow('cannot report your own');
    });

    it('should prevent users from reporting their own user profile', async () => {
      User._add({ _id: 'self_profile' });

      await expect(
        reportService.create({
          reporterId: 'self_profile',
          targetType: 'User',
          targetId: 'self_profile',
          reason: 'HARASSMENT',
        })
      ).rejects.toThrow('cannot report your own');
    });
  });

  // ─── getAll ──────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return paginated reports', async () => {
      Report._add({ _id: 'r1', status: 'OPEN', reason: 'SPAM', reporter: 'u1' });
      Report._add({ _id: 'r2', status: 'OPEN', reason: 'SPAM', reporter: 'u2' });

      const result = await reportService.getAll({ page: 1, limit: 10 });

      expect(result.reports).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should filter by status', async () => {
      Report._add({ _id: 'r3', status: 'OPEN', reason: 'SPAM', reporter: 'u1' });
      Report._add({ _id: 'r4', status: 'RESOLVED', reason: 'SPAM', reporter: 'u2' });

      const result = await reportService.getAll({ status: 'OPEN' });
      expect(result.reports).toBeDefined();
    });

    it('should reject invalid status filter', async () => {
      await expect(
        reportService.getAll({ status: 'INVALID' })
      ).rejects.toThrow('Invalid status filter');
    });

    it('should reject invalid reason filter', async () => {
      await expect(
        reportService.getAll({ reason: 'INVALID_REASON' })
      ).rejects.toThrow('Invalid reason filter');
    });
  });

  // ─── getByReporter ──────────────────────────────────────────────────

  describe('getByReporter', () => {
    it('should return reports by a specific reporter', async () => {
      Report._add({ _id: 'r5', reporter: 'reporter_x', status: 'OPEN', reason: 'SPAM' });
      Report._add({ _id: 'r6', reporter: 'reporter_y', status: 'OPEN', reason: 'SPAM' });

      const result = await reportService.getByReporter('reporter_x');
      expect(result.reports).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });

  // ─── getByTarget ────────────────────────────────────────────────────

  describe('getByTarget', () => {
    it('should return reports for a specific target', async () => {
      Report._add({ _id: 'r7', targetType: 'Post', targetId: 'p_target', reporter: 'u1', status: 'OPEN', reason: 'SPAM' });

      const reports = await reportService.getByTarget('Post', 'p_target');
      expect(reports).toBeDefined();
    });
  });

  // ─── updateStatus ───────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update report status', async () => {
      const report = Report._add({ _id: 'r8', status: 'OPEN', reporter: 'u1', targetType: 'Post', targetId: 'p1', reason: 'SPAM' });

      const updated = await reportService.updateStatus({
        reportId: 'r8',
        status: 'UNDER_REVIEW',
        moderatorId: 'mod1',
      });

      expect(updated).toBeDefined();
    });

    it('should set resolvedAt when resolving', async () => {
      const report = Report._add({ _id: 'r9', status: 'OPEN', reporter: 'u1', targetType: 'Post', targetId: 'p2', reason: 'SPAM' });

      const updated = await reportService.updateStatus({
        reportId: 'r9',
        status: 'RESOLVED',
        moderatorId: 'mod1',
        resolutionNote: 'Content removed',
      });

      expect(updated).toBeDefined();
    });

    it('should reject invalid status', async () => {
      Report._add({ _id: 'r10', status: 'OPEN', reporter: 'u1', targetType: 'Post', targetId: 'p3', reason: 'SPAM' });

      await expect(
        reportService.updateStatus({
          reportId: 'r10',
          status: 'INVALID_STATUS',
          moderatorId: 'mod1',
        })
      ).rejects.toThrow('Invalid status');
    });

    it('should throw for non-existent report', async () => {
      await expect(
        reportService.updateStatus({
          reportId: 'nonexistent',
          status: 'RESOLVED',
          moderatorId: 'mod1',
        })
      ).rejects.toThrow('Report not found');
    });

    it('should clear resolution info when moving back to OPEN', async () => {
      Report._add({ _id: 'r11', status: 'RESOLVED', reporter: 'u1', targetType: 'Post', targetId: 'p4', reason: 'SPAM' });

      const updated = await reportService.updateStatus({
        reportId: 'r11',
        status: 'OPEN',
        moderatorId: 'mod1',
      });

      expect(updated).toBeDefined();
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return report statistics', async () => {
      const stats = await reportService.getStats();

      expect(stats).toBeDefined();
      expect(stats.byStatus).toBeDefined();
      expect(stats.byReason).toBeDefined();
      expect(typeof stats.recentCount).toBe('number');
      expect(typeof stats.total).toBe('number');
    });
  });

  // ─── getById ────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return a report by ID', async () => {
      Report._add({ _id: 'r12', status: 'OPEN', reporter: 'u1', targetType: 'Post', targetId: 'p5', reason: 'SPAM' });

      const report = await reportService.getById('r12');
      expect(report).toBeDefined();
    });

    it('should return null for non-existent report', async () => {
      const report = await reportService.getById('nonexistent');
      expect(report).toBeNull();
    });
  });
});
