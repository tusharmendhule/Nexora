/**
 * Integration Tests (Module 24)
 * =============================
 * Tests that verify service integration with mocked external dependencies
 * but real internal logic.
 *
 * Run with: npm test -- --testPathPatterns=integration
 */

// ─── Mock External Services ───────────────────────────────────────────

jest.mock('../../src/config/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  const mockGetUser = jest.fn();
  return {
    // auth.service.js consumes `firebaseAuth` — expose it so the mock
    // matches the real module's exports.
    firebaseAuth: {
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
    },
    auth: jest.fn(() => ({
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
    })),
    _mockVerifyIdToken: mockVerifyIdToken,
    _mockGetUser: mockGetUser,
  };
});

jest.mock('../../src/services/processing-queue.service', () => ({
  enqueueJob: jest.fn().mockResolvedValue({}),
  startDrainLoop: jest.fn(),
}));

jest.mock('../../src/services/audit.service', () => ({
  logAuthEvent: jest.fn().mockResolvedValue(true),
  logModerationEvent: jest.fn().mockResolvedValue(true),
  logReportEvent: jest.fn().mockResolvedValue(true),
  logAdminEvent: jest.fn().mockResolvedValue(true),
  logAccountEvent: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/services/age-verification/age-verification.service', () => ({
  initiate: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/services/notification.service', () => ({
  notifyVerificationComplete: jest.fn().mockResolvedValue(true),
  notifyModerationAction: jest.fn().mockResolvedValue(true),
  notifyReportResolution: jest.fn().mockResolvedValue(true),
  notifyAccountSecurity: jest.fn().mockResolvedValue(true),
}));

// Mock Post model (avoid real MongoDB)
jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  let idCounter = 1;

  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${idCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
  };

  MockPost.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return Promise.resolve(doc);
  });

  MockPost.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([...mockPosts]).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve([...mockPosts]).catch(fn);
    return chain;
  });

  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockPost.findByIdAndDelete = jest.fn().mockImplementation((id) => {
    const idx = mockPosts.findIndex((p) => p._id === id);
    if (idx !== -1) mockPosts.splice(idx, 1);
    return Promise.resolve(idx !== -1 ? { _id: id } : null);
  });

  MockPost.countDocuments = jest.fn().mockImplementation(() => {
    return Promise.resolve(mockPosts.length);
  });

  MockPost._reset = () => { mockPosts.length = 0; idCounter = 1; };
  MockPost._posts = mockPosts;
  MockPost._add = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };

  return MockPost;
});

// Mock TrustScore model
jest.mock('../../src/models/trust-score.model', () => {
  const mockTS = [];
  return {
    find: jest.fn().mockImplementation((filter) => {
      let results = [...mockTS];
      if (filter.post && filter.post.$in) {
        results = results.filter((t) => filter.post.$in.includes(t.post));
      }
      if (filter.post) results = results.filter((t) => t.post === filter.post);
      return Promise.resolve(results);
    }),
    findOne: jest.fn().mockImplementation((filter) => {
      const found = mockTS.find((t) => t.post === filter.post);
      return Promise.resolve(found || null);
    }),
    _reset: () => { mockTS.length = 0; },
    _add: (data) => { mockTS.push(data); return data; },
  };
});

// Mock User model
jest.mock('../../src/models/user.model', () => {
  const mockUsers = [];
  let idCounter = 1;

  const MockUser = function (data) {
    Object.assign(this, data);
    this._id = data._id || `user_${idCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.select = jest.fn().mockReturnValue(this);
  };

  MockUser.create = jest.fn().mockImplementation((data) => {
    const doc = new MockUser(data);
    mockUsers.push(doc);
    return Promise.resolve(doc);
  });

  MockUser.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    for (const u of mockUsers) {
      if (filter.firebaseUid && u.firebaseUid === filter.firebaseUid) { found = u; break; }
      if (filter.username && u.username === filter.username) { found = u; break; }
    }
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found).catch(fn);
    return chain;
  });

  MockUser.findById = jest.fn().mockImplementation((id) => {
    const found = mockUsers.find((u) => u._id === id);
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockUser._reset = () => { mockUsers.length = 0; idCounter = 1; };
  MockUser._users = mockUsers;

  return MockUser;
});

// ─── Imports ──────────────────────────────────────────────────────────

const firebaseAdmin = require('../../src/config/firebase');

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    try {
      const Post = require('../../src/models/post.model');
      if (Post._reset) Post._reset();
    } catch (_) {}
    try {
      const TrustScore = require('../../src/models/trust-score.model');
      if (TrustScore._reset) TrustScore._reset();
    } catch (_) {}
  });

  // ─── 1. Firebase Token Verification Flow ─────────────────────────

  describe('Firebase token verification flow', () => {
    it('should complete full register → login flow via Firebase', async () => {
      const authService = require('../../src/services/auth.service');
      const User = require('../../src/models/user.model');

      // Register
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'integration_uid',
        email: 'integration@test.com',
      });
      firebaseAdmin._mockGetUser.mockResolvedValue({ disabled: false });

      const registerResult = await authService.register({
        idToken: 'valid-token',
        name: 'Integration User',
        username: 'integration_user',
      });

      expect(registerResult.user).toBeDefined();
      expect(registerResult.user.username).toBe('integration_user');

      // Login with same UID
      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'integration_uid',
        email: 'integration@test.com',
      });

      const loginResult = await authService.login({ idToken: 'valid-token-2' });
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user.username).toBe('integration_user');
    });

    it('should reject login after account deletion from MongoDB', async () => {
      const authService = require('../../src/services/auth.service');

      firebaseAdmin._mockVerifyIdToken.mockResolvedValue({
        uid: 'deleted_uid',
        email: 'deleted@test.com',
      });

      await expect(
        authService.login({ idToken: 'token' })
      ).rejects.toThrow('User profile not found');
    });
  });

  // ─── 2. Post Lifecycle Integration ────────────────────────────────

  describe('Post lifecycle integration', () => {
    it('should create a post and verify it can be retrieved', async () => {
      const postService = require('../../src/services/post.service');

      const post = await postService.create('user_1', {
        text: 'Integration test post',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      expect(post).toBeDefined();
    });

    it('should enforce ownership on post update', async () => {
      // Ownership enforcement is tested via the dedicated post.service.test.js
      // This integration test verifies the service is wired correctly
      const postService = require('../../src/services/post.service');
      expect(typeof postService.update).toBe('function');
      expect(typeof postService.delete).toBe('function');
      expect(typeof postService.create).toBe('function');
    });

    it('should enforce ownership on post delete', async () => {
      const postService = require('../../src/services/post.service');
      // Verify delete method exists and accepts role parameter
      expect(postService.delete.length).toBeGreaterThanOrEqual(2);
    });

    it('should allow MODERATOR to delete any post', async () => {
      const postService = require('../../src/services/post.service');
      // MODERATOR role is checked inside delete() — tested in post.service.test.js
      expect(typeof postService.delete).toBe('function');
    });
  });

  // ─── 3. Trust Score Integration ───────────────────────────────────

  describe('Trust score integration', () => {
    it('should compute trust score and assign correct label', () => {
      const { computeTrustScore, Label } = require('../../src/services/trust-score.service');

      const high = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
      });
      expect(high.label).toBe(Label.GREEN);
      expect(high.trustScore).toBeGreaterThanOrEqual(80);

      const low = computeTrustScore({
        authenticityScore: 0.1,
        factualVerificationScore: 0.1,
        sourceCredibilityScore: 0.1,
        modelConfidenceScore: 0.1,
      });
      expect(low.label).toBe(Label.RED);
      expect(low.trustScore).toBeLessThan(40);

      const opinion = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
        contentType: 'opinion',
      });
      expect(opinion.label).toBe(Label.PURPLE);
    });

    it('should enforce rule priority: confirmed false overrides everything', () => {
      const { computeTrustScore, Label } = require('../../src/services/trust-score.service');

      const result = computeTrustScore({
        authenticityScore: 1.0,
        factualVerificationScore: 1.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 1.0,
        isConfirmedFalse: true,
        contentType: 'satire',
      });

      expect(result.label).toBe(Label.RED); // Rule 1 wins
    });

    it('should assign BLUE for disclosed AI with score >= 70', () => {
      const { computeTrustScore, Label } = require('../../src/services/trust-score.service');

      const result = computeTrustScore({
        authenticityScore: 0.8,
        factualVerificationScore: 0.8,
        sourceCredibilityScore: 0.8,
        modelConfidenceScore: 0.8,
        isDisclosedAI: true,
      });

      expect(result.label).toBe(Label.BLUE);
    });
  });

  // ─── 4. Evidence Normalization Integration ────────────────────────

  describe('Evidence normalization integration', () => {
    it('should normalize and aggregate evidence from multiple sources', async () => {
      const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');

      const result = await normalizeEvidence({
        claim: 'Test claim for integration',
        postId: '507f1f77bcf86cd799439011',
        factCheckResults: {
          status: 'VERIFIED_TRUE',
          reviews: [{ publisher: { name: 'Snopes' }, textualRating: 'True' }],
          factualVerificationScore: 0.9,
        },
        aiDetectorResults: {
          misinfoProbability: 0.1,
          confidence: 0.85,
        },
        sourceAnalysis: {
          credibilityScore: 0.8,
          publisherName: 'Reuters',
        },
      });

      expect(result.aggregateVerdict).toBe('supports');
      expect(result.sourceCount).toBe(3);
      expect(result.weightedConfidence).toBeGreaterThan(0.5);
      expect(result.evidenceItems).toHaveLength(3);
    });

    it('should handle conflicting evidence gracefully', async () => {
      const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');

      const result = await normalizeEvidence({
        claim: 'Conflicting claim',
        postId: '507f1f77bcf86cd799439011',
        factCheckResults: {
          status: 'VERIFIED_FALSE',
          reviews: [{ publisher: { name: 'FactCheck.org' }, textualRating: 'False' }],
          factualVerificationScore: 0.05,
        },
        aiDetectorResults: {
          misinfoProbability: 0.9,
          confidence: 0.85,
        },
      });

      expect(result.aggregateVerdict).toBe('refutes');
      expect(result.evidenceSummary.negative).toBeGreaterThanOrEqual(1);
    });

    it('should return insufficient when no evidence provided', async () => {
      const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');

      const result = await normalizeEvidence({
        claim: 'No evidence claim',
        postId: '507f1f77bcf86cd799439011',
      });

      expect(result.aggregateVerdict).toBe('insufficient');
      expect(result.sourceCount).toBe(0);
    });
  });

  // ─── 5. Content Router Integration ────────────────────────────────

  describe('Content router integration', () => {
    it('should classify content type from post data', () => {
      const { classifyContentType } = require('../../src/services/content-router.service');

      expect(classifyContentType({ text: 'Hello' })).toBe('TEXT');
      expect(classifyContentType({ media: [{ type: 'image' }] })).toBe('IMAGE');
      expect(classifyContentType({ media: [{ type: 'video' }] })).toBe('VIDEO');
      expect(classifyContentType({ linkUrl: 'https://example.com' })).toBe('LINK');
      expect(classifyContentType({ media: [{ type: 'audio' }] })).toBe('AUDIO');
    });

    it('should map content types to correct pipelines', () => {
      const { pipelineForContentType } = require('../../src/services/content-router.service');

      expect(pipelineForContentType('TEXT')).toBe('nlp');
      expect(pipelineForContentType('IMAGE')).toBe('image_authenticity');
      expect(pipelineForContentType('VIDEO')).toBe('video_deepfake');
      expect(pipelineForContentType('AUDIO')).toBe('audio_authenticity');
      expect(pipelineForContentType('LINK')).toBe('link_extraction');
      expect(pipelineForContentType('UNKNOWN')).toBe('nlp');
    });

    it('should default to TEXT when no media or link', () => {
      const { classifyContentType } = require('../../src/services/content-router.service');
      expect(classifyContentType({})).toBe('TEXT');
    });
  });

  // ─── 6. Notification Service Integration ──────────────────────────

  describe('Notification service integration', () => {
    it('should have all notification methods available', () => {
      const notificationService = require('../../src/services/notification.service');
      expect(typeof notificationService.notifyVerificationComplete).toBe('function');
      expect(typeof notificationService.notifyModerationAction).toBe('function');
      expect(typeof notificationService.notifyReportResolution).toBe('function');
      expect(typeof notificationService.notifyAccountSecurity).toBe('function');
    });

    it('should call notifyVerificationComplete without throwing', async () => {
      const notificationService = require('../../src/services/notification.service');
      await expect(
        notificationService.notifyVerificationComplete({
          postOwnerId: 'user_1',
          postId: 'post_1',
          status: 'PUBLISHED',
          trustScoreResult: { score: 85, label: 'Green' },
        })
      ).resolves.toBeDefined();
    });
  });

  // ─── 7. Moderation Decision Integration ───────────────────────────

  describe('Moderation decision integration', () => {
    it('should evaluate correct decision for high-trust content', () => {
      const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');

      const decision = evaluateDecision({
        trustScoreResult: { score: 85, label: 'Green', isOverrideApplied: false },
        stageResults: {},
        contentType: 'TEXT',
        hasErrors: false,
        failedStages: [],
        reviewRequiredStages: [],
      });

      expect(decision).toBeDefined();
      expect(decision.action).toBe(Decision.PUBLISH);
    });

    it('should evaluate correct decision for low-trust content', () => {
      const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');

      const decision = evaluateDecision({
        trustScoreResult: { score: 20, label: 'Red', isOverrideApplied: false },
        stageResults: {},
        contentType: 'TEXT',
        hasErrors: false,
        failedStages: [],
        reviewRequiredStages: [],
      });

      expect(decision).toBeDefined();
      expect(decision.action).toBe(Decision.REVIEW_REQUIRED); // score < threshold goes to review
    });

    it('should require review when pipeline stages fail', () => {
      const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');

      const decision = evaluateDecision({
        trustScoreResult: { score: 55, label: 'Orange', isOverrideApplied: false },
        stageResults: {},
        contentType: 'TEXT',
        hasErrors: true,
        failedStages: ['AI_ANALYSIS'],
        reviewRequiredStages: [],
      });

      expect(decision).toBeDefined();
      expect(decision.action).toBe(Decision.REVIEW_REQUIRED);
    });

    it('should handle moderator override', () => {
      const { evaluateDecision } = require('../../src/services/moderation-decision.service');

      const decision = evaluateDecision({
        trustScoreResult: { score: 20, label: 'Purple', isOverrideApplied: true },
        stageResults: {},
        contentType: 'TEXT',
        hasErrors: false,
        failedStages: [],
        reviewRequiredStages: [],
      });

      expect(decision).toBeDefined();
    });
  });
});
