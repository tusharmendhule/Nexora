/**
 * User Review Request Tests
 * ==========================
 * Verifies the real implementation behind the app's
 * "Request Moderator Review" button:
 *   1. Creates a REAL moderation log entry (REVIEW_REQUESTED)
 *   2. Snapshots the current AI analysis (TrustScore + AI detection)
 *   3. Moves the post into the moderator queue
 *   4. Never fabricates or overwrites the AI result
 *   5. Validates missing/invalid input
 */

const MODERATION_ACTION = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  FLAG_FOR_REVIEW: 'FLAG_FOR_REVIEW',
  OVERRIDE_LABEL: 'OVERRIDE_LABEL',
  RESOLVE_REPORT: 'RESOLVE_REPORT',
  DISMISS_REPORT: 'DISMISS_REPORT',
  REMOVE_CONTENT: 'REMOVE_CONTENT',
  RESTORE_CONTENT: 'RESTORE_CONTENT',
  REVIEW_REQUESTED: 'REVIEW_REQUESTED',
};

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/models/moderationLog.model', () => {
  const mockLogs = [];
  const MockLog = function (data) {
    Object.assign(this, data);
    this._id = data._id || `log_${mockLogs.length + 1}`;
    this.createdAt = new Date();
    this.save = jest.fn().mockResolvedValue(this);
  };
  MockLog.create = jest.fn().mockImplementation((data) => {
    const doc = new MockLog(data);
    mockLogs.push(doc);
    return Promise.resolve(doc);
  });
  MockLog.MODERATION_ACTION = MODERATION_ACTION;
  MockLog._reset = () => { mockLogs.length = 0; };
  MockLog._logs = mockLogs;
  return MockLog;
});

jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
  };
  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    return Promise.resolve(found || null);
  });
  MockPost._reset = () => { mockPosts.length = 0; };
  MockPost._addPost = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };
  return MockPost;
});

jest.mock('../../src/models/trust-score.model', () => {
  const scores = [];
  return {
    findOne: jest.fn().mockImplementation((filter = {}) => {
      const found = scores.find((t) => t.post === filter.post);
      return Promise.resolve(found || null);
    }),
    _reset: () => { scores.length = 0; },
    _add: (data) => { scores.push(data); return data; },
  };
});

jest.mock('../../src/models/text-analysis.model', () => {
  const analyses = [];
  return {
    findOne: jest.fn().mockImplementation((filter = {}) => {
      const found = analyses.find((a) => a.post === filter.post);
      return {
        sort: jest.fn().mockResolvedValue(found || null),
      };
    }),
    _reset: () => { analyses.length = 0; },
    _add: (data) => { analyses.push(data); return data; },
  };
});

jest.mock('../../src/models/report.model', () => {
  return { REPORT_STATUS: { OPEN: 'OPEN' } };
});

jest.mock('../../src/services/audit.service', () => ({
  logModerationEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/notification.service', () => ({
  notifyModerationAction: jest.fn().mockResolvedValue(null),
  notifyVerificationComplete: jest.fn().mockResolvedValue(null),
  notifyReportResolution: jest.fn().mockResolvedValue(null),
}));

const moderationService = require('../../src/services/moderation.service');
const ModerationLog = require('../../src/models/moderationLog.model');
const Post = require('../../src/models/post.model');
const TrustScore = require('../../src/models/trust-score.model');
const TextAnalysis = require('../../src/models/text-analysis.model');

describe('ModerationService.requestUserReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ModerationLog._reset();
    Post._reset();
    TrustScore._reset();
    TextAnalysis._reset();
  });

  it('should create a REVIEW_REQUESTED log with an analysis snapshot', async () => {
    Post._addPost({
      _id: 'post_1',
      text: 'A claim',
      moderationStatus: 'pending',
      verificationStatus: 'VERIFIED',
      trustBadge: 'Orange',
    });
    TrustScore._add({
      post: 'post_1',
      score: 45,
      label: 'Orange',
      authenticity: 0.8,
      factualVerification: 0.4,
      sourceCredibility: 0.5,
      modelConfidence: 0.7,
      explanation: 'Rule 6 (PARTIALLY_VERIFIED): ...',
      modelVersion: 'nexora-trust-v1.0.0',
      ruleVersion: 'nexora-rules-v1.0.0',
    });
    TextAnalysis._add({
      post: 'post_1',
      aiGeneratedProbability: 0.12,
      misinformationProbability: 0.6,
      modelVersion: 'nexora-text-v1.2.0',
      confidence: 0.8,
    });

    const log = await moderationService.requestUserReview({
      postId: 'post_1',
      requesterId: 'user_9',
      reason: 'I believe the analysis is wrong',
    });

    expect(log.action).toBe('REVIEW_REQUESTED');
    expect(log.moderatorId).toBe('user_9');
    expect(log.reason).toBe('I believe the analysis is wrong');
    expect(log.newStatus).toBe('flagged');

    // Real analysis snapshot preserved for the moderator
    expect(log.metadata.analysisSnapshot.trustScore.score).toBe(45);
    expect(log.metadata.analysisSnapshot.trustScore.label).toBe('Orange');
    expect(log.metadata.analysisSnapshot.aiDetection.aiGeneratedProbability).toBe(0.12);
    expect(log.metadata.analysisSnapshot.aiDetection.modelVersion).toBe('nexora-text-v1.2.0');

    // The post moved into the moderator queue
    const post = await Post.findById('post_1');
    expect(post.moderationStatus).toBe('flagged');
    expect(post.verificationStatus).toBe('REVIEW_REQUIRED');

    // The AI result itself is NOT overwritten by the request
    expect(post.trustBadge).toBe('Orange');
  });

  it('should handle a post with no AI analysis yet (null snapshot)', async () => {
    Post._addPost({
      _id: 'post_2',
      text: 'No analysis yet',
      moderationStatus: 'pending',
      verificationStatus: 'PENDING_VERIFICATION',
      trustBadge: null,
    });

    const log = await moderationService.requestUserReview({
      postId: 'post_2',
      requesterId: 'user_9',
      reason: 'Please review this',
    });

    expect(log.metadata.analysisSnapshot.trustScore).toBeNull();
    expect(log.metadata.analysisSnapshot.aiDetection).toBeNull();
    expect(log.newStatus).toBe('flagged');
  });

  it('should throw for a non-existent post', async () => {
    await expect(
      moderationService.requestUserReview({
        postId: 'ghost',
        requesterId: 'user_9',
        reason: 'review',
      })
    ).rejects.toThrow('Post not found');
  });

  it('should throw when reason is missing', async () => {
    Post._addPost({ _id: 'post_3', moderationStatus: 'pending' });

    await expect(
      moderationService.requestUserReview({
        postId: 'post_3',
        requesterId: 'user_9',
        reason: '   ',
      })
    ).rejects.toThrow('Reason is required');
  });

  it('should throw when requester is missing', async () => {
    Post._addPost({ _id: 'post_4', moderationStatus: 'pending' });

    await expect(
      moderationService.requestUserReview({
        postId: 'post_4',
        reason: 'review',
      })
    ).rejects.toThrow('Requester is not authenticated');
  });
});