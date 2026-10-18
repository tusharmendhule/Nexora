/**
 * Media verification — single Trust Score writer
 * =========================================================================
 * The verification pipeline calls verifyAndScoreMedia() during AI_ANALYSIS
 * and then runs its own TRUST_SCORE stage. Persisting a score in both places
 * produced two different labels for the same post (the second, late write
 * disagreed with the post badge).
 *
 * These tests pin the contract: the analysis path only supplies signals;
 * standalone callers still get a stored score unless they opt out.
 */

jest.mock('../../src/services/media-claims.service', () => ({
  verifyMediaContent: jest.fn(),
}));

jest.mock('../../src/services/fact-check.service', () => ({
  computeFactualVerificationScore: jest.fn(),
  isConfirmedFalse: jest.fn(),
}));

jest.mock('../../src/services/source-credibility.service', () => ({
  fromFactCheckResult: jest.fn(),
}));

jest.mock('../../src/services/trust-score.service', () => ({
  computeAndStoreTrustScore: jest.fn(),
  MODEL_VERSION: 'nexora-trust-v1.0.0',
}));

const mediaClaimsService = require('../../src/services/media-claims.service');
const sourceCredibilityService = require('../../src/services/source-credibility.service');
const trustScoreService = require('../../src/services/trust-score.service');
const { verifyAndScoreMedia } = require('../../src/services/media-verification.service');

function mockExtraction() {
  mediaClaimsService.verifyMediaContent.mockResolvedValue({
    extraction: {
      claims: [],
      claimContentType: 'OTHER',
      confidence: 0.44,
      signals: [],
      modelVersion: 'nexora-media-claims-v1.0.0',
    },
    selection: { factCheckable: [], skipped: [] },
    factCheck: null,
    persisted: null,
    summary: {},
  });
  sourceCredibilityService.fromFactCheckResult.mockReturnValue({
    available: false,
    score: 0.5,
  });
  trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
    score: 61,
    label: 'Orange',
  });
}

describe('verifyAndScoreMedia — trust score persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtraction();
  });

  it('skips persistence when the pipeline owns the score', async () => {
    const result = await verifyAndScoreMedia({
      postId: 'post-1',
      contentType: 'IMAGE',
      mediaUrl: 'https://example.com/image.jpg',
      authenticityScore: 0.42,
      modelConfidenceScore: 0.77,
      manipulationProbability: 0.66,
      persistTrustScore: false,
    });

    expect(trustScoreService.computeAndStoreTrustScore).not.toHaveBeenCalled();
    expect(result.trustScoreResult).toBeNull();

    // Signals the pipeline needs are still resolved and returned.
    expect(result.resolvedAuthenticityScore).toBe(0.42);
    expect(result.resolvedModelConfidenceScore).toBe(0.77);
    expect(result.manipulationProbability).toBe(0.66);
  });

  it('still persists a score for standalone callers', async () => {
    const result = await verifyAndScoreMedia({
      postId: 'post-2',
      contentType: 'IMAGE',
      mediaUrl: 'https://example.com/image.jpg',
      authenticityScore: 0.9,
      modelConfidenceScore: 0.8,
    });

    expect(trustScoreService.computeAndStoreTrustScore).toHaveBeenCalledTimes(1);
    expect(result.trustScoreResult).toEqual({ score: 61, label: 'Orange' });
  });
});
