/**
 * Verification Orchestrator — Edge Cases (unit tests)
 * ===================================================
 *
 * External dependencies (Google Fact Check API, MongoDB, claim-extraction AI
 * service) are mocked with the EXACT response shapes the real services
 * produce — verified against fact-check.service.js source:
 *
 *   - API succeeded but no matching ClaimReview for the claim:
 *       one result PER CLAIM with status NO_EVIDENCE and reviews [],
 *       aggregateStatus UNKNOWN (determineAggregateStatus() returns UNKNOWN
 *       when there are no true/false/mixed counts)
 *   - API key missing: one result PER CLAIM with status UNKNOWN and
 *       errorCode 'UNAVAILABLE' (queryFactCheckAPI() short-circuit)
 *
 * The Trust Score engine (trust-score.service.js) and the pure fact-check
 * helpers (computeFactualVerificationScore, isConfirmedFalse,
 * verificationStatusToScore) are NOT mocked — label and score assertions
 * run against the real production logic.
 */

// ─── Mocks ───────────────────────────────────────────────────────────
// Mock all external dependencies
jest.mock('../../src/models/pipeline-stage.model', () => {
  const mockSave = jest.fn();
  const MockPipelineStage = function (data) {
    Object.assign(this, data);
    this._id = 'mock_pipeline_' + Date.now();
    this.save = mockSave.mockResolvedValue(this);
  };
  MockPipelineStage.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPipelineStage(data);
    return Promise.resolve(doc);
  });
  MockPipelineStage.findOne = jest.fn();
  MockPipelineStage.findOneAndUpdate = jest.fn();
  MockPipelineStage.find = jest.fn();
  MockPipelineStage.countDocuments = jest.fn();
  return MockPipelineStage;
});

jest.mock('../../src/models/post.model', () => {
  const mockSave = jest.fn();
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'mock_post_' + Date.now();
    this.save = mockSave.mockResolvedValue(this);
  };
  MockPost.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPost(data);
    return Promise.resolve(doc);
  });
  MockPost.findById = jest.fn();
  MockPost.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  MockPost.find = jest.fn();
  MockPost.countDocuments = jest.fn();
  return MockPost;
});

// Persistence model: unit tests never touch MongoDB. Without this mock,
// mongoose would buffer the upsert and time out after 10s per test.
jest.mock('../../src/models/trust-score.model', () => {
  const MockTrustScore = jest.fn();
  MockTrustScore.findOneAndUpdate = jest.fn().mockResolvedValue({});
  MockTrustScore.findOne = jest.fn().mockResolvedValue(null);
  return MockTrustScore;
});

jest.mock('../../src/services/content-router.service', () => ({
  classifyContentType: jest.fn(),
  pipelineForContentType: jest.fn(),
  createJob: jest.fn(),
  markProcessing: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
  getPendingJobs: jest.fn(),
}));

// Mock text analysis service - returns successful result
jest.mock('../../src/services/text-analysis.service', () => ({
  analyzeText: jest.fn().mockResolvedValue({
    status: 'COMPLETED',
    results: {
      claims: [],
      factualVerification: 0.5,
      sourceCredibility: 0.5,
      modelConfidence: 0.5,
    },
  }),
  getAnalysisForPost: jest.fn(),
}));

// Claim extraction: the real service calls the Python AI service over HTTP.
// Return one extracted claim so the Google Fact Check step is exercised.
jest.mock('../../src/services/claim-entity-extraction.service', () => ({
  extractClaimsAndEntities: jest.fn().mockResolvedValue({
    status: 'COMPLETED',
    savedAnalysis: {
      claims: [{ text: 'Extracted test claim', textHash: 'test_hash_001' }],
    },
  }),
}));

// Fact-check service: keep the REAL pure helpers so scoring matches
// production; only the networked factCheckClaims() entry point is mocked.
jest.mock('../../src/services/fact-check.service', () => ({
  ...jest.requireActual('../../src/services/fact-check.service'),
  factCheckClaims: jest.fn(),
}));

// NOTE: '../../src/services/trust-score.service' is intentionally NOT mocked.

// ─── Import mocks for assertions ─────────────────────────────────────

process.env.GOOGLE_FACT_CHECK_API_KEY = 'test-key-for-testing';

const assert = require('assert');
const { orchestrateVerification } = require('../../src/services/verification-orchestrator.service');
const factCheckService = require('../../src/services/fact-check.service');

// ─── Real-service response shapes (fact-check.service.js) ────────────

/** API succeeded, no matching ClaimReview found for the claim. */
function noMatchResponse() {
  return {
    results: [
      {
        claimText: 'Extracted test claim',
        claimId: null,
        postId: null,
        status: 'NO_EVIDENCE',
        reviews: [],
        classifiedRatings: [],
        apiError: null,
        errorCode: null,
        source: 'api',
        matchCount: 0,
        processingTimeMs: 1,
      },
    ],
    aggregateStatus: 'UNKNOWN',
    summary: { total: 1, verified: 0, false: 0, mixed: 0, noEvidence: 1, unknown: 0 },
    processingTimeMs: 1,
  };
}

/** API key not configured — queryFactCheckAPI() short-circuits per claim. */
function missingKeyResponse() {
  return {
    results: [
      {
        claimText: 'Extracted test claim',
        claimId: null,
        postId: null,
        status: 'UNKNOWN',
        reviews: [],
        classifiedRatings: [],
        apiError: 'Google Fact Check API key not configured',
        errorCode: 'UNAVAILABLE',
        source: 'api',
        matchCount: 0,
        processingTimeMs: 0,
      },
    ],
    aggregateStatus: 'UNKNOWN',
    summary: { total: 1, verified: 0, false: 0, mixed: 0, noEvidence: 0, unknown: 1 },
    processingTimeMs: 0,
  };
}

describe('Verification Orchestrator Edge Cases', () => {

  // ── 1. NO_EVIDENCE Handling ───────────────────────────────────────

  describe('NO_EVIDENCE handling', () => {
    it('should set authenticityScore and modelConfidenceScore to 0.3 when Google Fact Check returns NO_EVIDENCE', async () => {
      // Mock: Google Fact Check succeeds but finds no matching reviews
      factCheckService.factCheckClaims.mockResolvedValue(noMatchResponse());

      const result = await orchestrateVerification({
        postId: 'test_post_001',
        text: 'Scientists confirm that drinking water is essential for human survival.',
        contentType: 'TEXT',
        skipFactCheck: false,
      });

      // Verify the trust score input has explicit 0.3 values for missing evidence
      assert.strictEqual(result.trustScoreResult.componentScores.authenticity, 0.3,
        'authenticityScore should be 0.3 when NO_EVIDENCE (not default 0.5)');
      assert.strictEqual(result.trustScoreResult.componentScores.modelConfidence, 0.3,
        'modelConfidenceScore should be 0.3 when NO_EVIDENCE (not default 0.5)');
      assert.strictEqual(result.trustScoreResult.componentScores.factualVerification, 0.5,
        'factualVerificationScore should be 0.5 when NO_EVIDENCE (neutral, not false)');
      assert.strictEqual(result.trustScoreResult.componentScores.sourceCredibility, 0.5,
        'sourceCredibilityScore should be 0.5 when NO_EVIDENCE (no publisher data)');
      assert.strictEqual(result.trustScoreResult.label, 'Orange',
        'Weighted score for [0.3, 0.5, 0.5, 0.3] = 41 → Rule 6 → Orange');
      assert.strictEqual(result.trustScoreResult.isOverrideApplied, false,
        'Absence of evidence must NOT trigger a Red override (isConfirmedFalse stays false)');
    });

    it('should NOT trigger fallback when Google Fact Check returns NO_EVIDENCE', async () => {
      factCheckService.factCheckClaims.mockResolvedValue(noMatchResponse());

      const result = await orchestrateVerification({
        postId: 'test_post_002',
        text: 'Some claim to verify',
        contentType: 'TEXT',
        skipFactCheck: false,
      });

      // Fallback should NOT be activated when factCheckError is false
      // even if NO_EVIDENCE status is returned.
      // providerStatus carries the provider outcome; verificationStatus is
      // the lifecycle status finalized to COMPLETED on success.
      assert.strictEqual(result.providerUsed, 'GOOGLE_FACT_CHECK',
        'Provider used should be GOOGLE_FACT_CHECK, not a fallback');
      assert.strictEqual(result.providerStatus, 'GOOGLE_FACT_CHECK_COMPLETED',
        'Provider status should be GOOGLE_FACT_CHECK_COMPLETED (Google path completed)');
      assert.strictEqual(result.verificationStatus, 'COMPLETED',
        'Lifecycle status should be COMPLETED — not FALLBACK_COMPLETED or FAILED');
    });
  });

  // ── 2. API Key Missing ──────────────────────────────────────────

  describe('Google Fact Check API key missing', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_FACT_CHECK_API_KEY;
    });

    it('should return UNKNOWN status when API key is not configured', async () => {
      // The real factCheckClaims() never throws for a missing key:
      // queryFactCheckAPI() short-circuits and each claim comes back
      // status UNKNOWN / errorCode UNAVAILABLE. Simulate that exact shape.
      factCheckService.factCheckClaims.mockResolvedValue(missingKeyResponse());

      const result = await orchestrateVerification({
        postId: 'test_post_003',
        text: 'Some claim to verify',
        contentType: 'TEXT',
        skipFactCheck: false,
      });

      // No fabricated verdict: the fact-check result is UNKNOWN, not true/false
      assert.strictEqual(result.factCheckResults[0].status, 'UNKNOWN',
        'Fact-check result status should be UNKNOWN when the API key is missing');
      // Components stay neutral 0.5 → weighted score 50 → Rule 6 → Orange
      assert.strictEqual(result.trustScoreResult.label, 'Orange',
        'When API key missing, score should fall to ~50 → Orange via Rule 6');
      assert.strictEqual(result.providerStatus, 'GOOGLE_FACT_CHECK_COMPLETED',
        'Google Fact Check path should complete (UNKNOWN is not a service failure)');
      assert.strictEqual(result.verificationStatus, 'COMPLETED',
        'Should complete normally, not FAILED');
    });
  });
});
