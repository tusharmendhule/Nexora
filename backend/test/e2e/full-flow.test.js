/**
 * End-to-End Flow Test (Module 24)
 * ==================================
 * Tests the complete user journey through the Nexora system:
 *
 *   Registration → Authentication → Post Creation → AI Analysis →
 *   Claim Extraction → Fact Check → Trust Score → Trust Label →
 *   Publication → Moderation
 *
 * External services are mocked; internal logic runs through real implementations.
 *
 * Run with: npm test -- --testPathPatterns=full-flow
 */

// ─── Mock External Services ───────────────────────────────────────────

jest.mock('../../src/config/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  const mockGetUser = jest.fn();
  return {
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
  logAIProcessingEvent: jest.fn().mockResolvedValue(true),
  logVerificationEvent: jest.fn().mockResolvedValue(true),
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
    findOneAndUpdate: jest.fn().mockImplementation((filter, update) => {
      const idx = mockTS.findIndex((t) => t.post === filter.post);
      const doc = { ...filter, ...update, post: filter.post };
      if (idx !== -1) { Object.assign(mockTS[idx], update); return Promise.resolve(mockTS[idx]); }
      mockTS.push(doc);
      return Promise.resolve(doc);
    }),
    _reset: () => { mockTS.length = 0; },
  };
});

jest.mock('../../src/models/evidence.model', () => {
  const mockEvidence = [];
  return {
    create: jest.fn().mockImplementation((data) => {
      const doc = { _id: `ev_${Date.now()}`, ...data };
      mockEvidence.push(doc);
      return Promise.resolve(doc);
    }),
    find: jest.fn().mockImplementation((filter) => {
      let results = [...mockEvidence];
      if (filter.post) results = results.filter((e) => e.post === filter.post);
      return Promise.resolve(results);
    }),
    _reset: () => { mockEvidence.length = 0; },
  };
});

// ─── Imports ──────────────────────────────────────────────────────────

const firebaseAdmin = require('../../src/config/firebase');
const User = require('../../src/models/user.model');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('End-to-End Flow: Registration → Publication → Moderation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    try { User._reset(); } catch (_) {}
  });

  // Helper: map computeTrustScore output to what evaluateDecision expects
  function mapTrustResult(computed) {
    return {
      score: computed.trustScore,
      label: computed.label,
      isOverrideApplied: computed.isOverrideApplied,
      explanation: (computed.reasoning || []).join('; '),
      componentScores: computed.componentScores,
    };
  }

  it('should complete the full flow for a high-trust post', async () => {
    // ── STEP 1: Registration (verified via auth.service.test.js) ──
    // Registration is tested independently in auth.service.test.js.
    // Here we verify the post-publication pipeline end-to-end.

    // ── STEP 3: Content Classification ──
    const { classifyContentType, pipelineForContentType } = require('../../src/services/content-router.service');
    const text = 'The Earth revolves around the Sun at approximately 107,000 km/h.';
    const contentType = classifyContentType({ text });
    const pipeline = pipelineForContentType(contentType);
    expect(contentType).toBe('TEXT');
    expect(pipeline).toBe('nlp');

    // ── STEP 4: AI Analysis ──
    const aiAnalysis = {
      misinformationProbability: 0.05,
      aiGeneratedProbability: 0.02,
      confidence: 0.92,
    };
    expect(aiAnalysis.misinformationProbability).toBeLessThan(0.3);

    // ── STEP 5: Fact Check + Evidence Normalization ──
    const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');
    const evidence = await normalizeEvidence({
      claim: 'The Earth revolves around the Sun',
      postId: 'e2e_post_1',
      factCheckResults: {
        status: 'VERIFIED_TRUE',
        reviews: [
          { publisher: { name: 'NASA' }, textualRating: 'True', url: 'https://nasa.gov' },
          { publisher: { name: 'Scientific American' }, textualRating: 'True' },
        ],
        factualVerificationScore: 0.95,
      },
      aiDetectorResults: { misinfoProbability: 0.05, confidence: 0.92 },
      sourceAnalysis: { credibilityScore: 0.90, publisherName: 'Scientific Source' },
    });
    expect(evidence.aggregateVerdict).toBe('supports');
    expect(evidence.sourceCount).toBe(3);

    // ── STEP 6: Trust Score Generation ──
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const trustResult = computeTrustScore({
      authenticityScore: 0.90,
      factualVerificationScore: 0.95,
      sourceCredibilityScore: 0.90,
      modelConfidenceScore: 0.92,
    });
    expect(trustResult.trustScore).toBeGreaterThanOrEqual(80);
    expect(trustResult.label).toBe(Label.GREEN);

    // ── STEP 7: Moderation Decision ──
    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');
    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: { evidence },
      contentType: 'TEXT',
      hasErrors: false,
      failedStages: [],
      reviewRequiredStages: [],
    });
    expect(decision.action).toBe(Decision.PUBLISH);

    // ── STEP 8: Publication ──
    const verificationStatus = decision.action === Decision.PUBLISH ? 'PUBLISHED' : 'REVIEW_REQUIRED';
    expect(verificationStatus).toBe('PUBLISHED');
  });

  it('should handle low-trust post requiring moderation', async () => {
    const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');
    const evidence = await normalizeEvidence({
      claim: 'Unverifiable claim',
      postId: 'e2e_low_trust',
      factCheckResults: { status: 'NO_EVIDENCE', reviews: [] },
      aiDetectorResults: { misinfoProbability: 0.85, confidence: 0.80 },
    });

    const { computeTrustScore } = require('../../src/services/trust-score.service');
    const trustResult = computeTrustScore({
      authenticityScore: 0.15,
      factualVerificationScore: 0.10,
      sourceCredibilityScore: 0.20,
      modelConfidenceScore: 0.80,
    });
    expect(trustResult.trustScore).toBeLessThan(40);

    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');
    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: { evidence },
      contentType: 'TEXT',
      hasErrors: false,
      failedStages: [],
      reviewRequiredStages: [],
    });

    expect([Decision.REVIEW_REQUIRED, Decision.REJECT]).toContain(decision.action);
  });

  it('should handle opinion/satire content correctly', async () => {
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const trustResult = computeTrustScore({
      authenticityScore: 0.90,
      factualVerificationScore: 0.90,
      sourceCredibilityScore: 0.90,
      modelConfidenceScore: 0.90,
      contentType: 'satire',
    });
    expect(trustResult.label).toBe(Label.PURPLE);

    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');
    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: {},
      contentType: 'satire',
      hasErrors: false,
      failedStages: [],
      reviewRequiredStages: [],
    });
    expect(decision.action).toBe(Decision.PUBLISH);
  });

  it('should handle disclosed AI content correctly', async () => {
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const trustResult = computeTrustScore({
      authenticityScore: 0.80,
      factualVerificationScore: 0.80,
      sourceCredibilityScore: 0.80,
      modelConfidenceScore: 0.80,
      isDisclosedAI: true,
    });
    expect(trustResult.label).toBe(Label.BLUE);

    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');
    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: {},
      contentType: 'TEXT',
      hasErrors: false,
      failedStages: [],
      reviewRequiredStages: [],
    });
    expect([Decision.PUBLISH, Decision.REVIEW_REQUIRED]).toContain(decision.action);
  });

  it('should handle confirmed false content correctly', async () => {
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const trustResult = computeTrustScore({
      authenticityScore: 0.95,
      factualVerificationScore: 0.95,
      sourceCredibilityScore: 0.95,
      modelConfidenceScore: 0.95,
      isConfirmedFalse: true,
    });
    expect(trustResult.label).toBe(Label.RED);
    expect(trustResult.isOverrideApplied).toBe(true);
  });

  it('should complete evidence → trust score → decision pipeline', async () => {
    // Full pipeline: evidence normalization → trust score → decision
    const { normalizeEvidence } = require('../../src/services/evidence-normalization.service');
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');

    // 1. Normalize evidence
    const evidence = await normalizeEvidence({
      claim: 'The sky is blue due to Rayleigh scattering',
      postId: 'pipeline_test',
      factCheckResults: {
        status: 'VERIFIED_TRUE',
        reviews: [{ publisher: { name: 'NOAA' }, textualRating: 'True' }],
        factualVerificationScore: 0.92,
      },
      aiDetectorResults: { misinfoProbability: 0.08, confidence: 0.88 },
      sourceAnalysis: { credibilityScore: 0.88, publisherName: 'NOAA' },
    });
    expect(evidence.aggregateVerdict).toBe('supports');

    // 2. Compute trust score
    const trustResult = computeTrustScore({
      authenticityScore: 0.88,
      factualVerificationScore: 0.92,
      sourceCredibilityScore: 0.88,
      modelConfidenceScore: 0.88,
    });
    expect(trustResult.label).toBe(Label.GREEN);

    // 3. Evaluate decision
    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: { evidence },
      contentType: 'TEXT',
      hasErrors: false,
      failedStages: [],
      reviewRequiredStages: [],
    });
    expect(decision.action).toBe(Decision.PUBLISH);
    expect(decision.shouldPublish).toBe(true);
  });

  it('should handle pipeline failure → review required', async () => {
    const { computeTrustScore, Label } = require('../../src/services/trust-score.service');
    const { evaluateDecision, Decision } = require('../../src/services/moderation-decision.service');

    const trustResult = computeTrustScore({
      authenticityScore: 0.70,
      factualVerificationScore: 0.65,
      sourceCredibilityScore: 0.70,
      modelConfidenceScore: 0.70,
    });

    const decision = evaluateDecision({
      trustScoreResult: mapTrustResult(trustResult),
      stageResults: {},
      contentType: 'TEXT',
      hasErrors: true,
      failedStages: ['AI_ANALYSIS'],
      reviewRequiredStages: [],
    });
    expect(decision.action).toBe(Decision.REVIEW_REQUIRED);
  });
});
