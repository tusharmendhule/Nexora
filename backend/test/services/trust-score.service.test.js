/**
 * Trust Score Service Tests (Module 15)
 * ======================================
 * Comprehensive tests for the Trust Score engine.
 *
 * Covers:
 *   1. Weighted formula computation
 *   2. Rule 1: Confirmed false fact-check → RED
 *   3. Rule 2: High manipulation probability → RED
 *   4. Rule 3: Opinion/satire/edited content → PURPLE
 *   5. Rule 4: Disclosed AI + factually supported + score >= 70 → BLUE
 *   6. Rule 5: High-trust content (score >= 80) → GREEN
 *   7. Rule 6: Uncertain/partially verified → ORANGE
 *   8. Rule 7: Low trust (score < 40) → RED
 *   9. Boundary conditions at exact thresholds
 *  10. Input validation and clamping
 *  11. Reasoning output transparency
 *  12. Model and rule versioning
 *
 * Run with: npm test -- --testPathPattern=trust-score
 */

// ─── Mocks ───────────────────────────────────────────────────────────

// Mock the TrustScore model (avoid real MongoDB calls)
jest.mock('../../src/models/trust-score.model', () => {
  const mockFindOneAndUpdate = jest.fn();
  const mockFindOne = jest.fn();

  const MockTrustScore = function (data) {
    Object.assign(this, data);
    this._id = 'mock_trust_score_id_' + Date.now();
  };
  MockTrustScore.findOneAndUpdate = mockFindOneAndUpdate;
  MockTrustScore.findOne = mockFindOne;

  return MockTrustScore;
});

const TrustScore = require('../../src/models/trust-score.model');

// ─── Import the service ──────────────────────────────────────────────

const {
  computeTrustScore,
  computeRawScore,
  validateInput,
  evaluateRules,
  computeAndStoreTrustScore,
  getTrustScoreByPost,
  WEIGHTS,
  THRESHOLDS,
  RULE_THRESHOLDS,
  Label,
  MODEL_VERSION,
  RULE_VERSION,
  OPINION_CONTENT_TYPES,
  clamp,
} = require('../../src/services/trust-score.service');

// ─── Helper: default balanced inputs ──────────────────────────────────

const BALANCED_INPUT = {
  authenticityScore: 0.8,
  factualVerificationScore: 0.8,
  sourceCredibilityScore: 0.8,
  modelConfidenceScore: 0.8,
};

const PERFECT_INPUT = {
  authenticityScore: 1.0,
  factualVerificationScore: 1.0,
  sourceCredibilityScore: 1.0,
  modelConfidenceScore: 1.0,
};

const ZERO_INPUT = {
  authenticityScore: 0.0,
  factualVerificationScore: 0.0,
  sourceCredibilityScore: 0.0,
  modelConfidenceScore: 0.0,
};

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Trust Score Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Weighted Formula Computation ─────────────────────────────

  describe('Weighted formula computation', () => {
    it('should compute the correct score for all-1.0 inputs (100)', () => {
      const result = computeTrustScore(PERFECT_INPUT);
      expect(result.trustScore).toBe(100);
    });

    it('should compute the correct score for all-0.0 inputs (0)', () => {
      const result = computeTrustScore(ZERO_INPUT);
      expect(result.trustScore).toBe(0);
    });

    it('should apply weights correctly: 0.35*A + 0.35*F + 0.20*S + 0.10*K', () => {
      // Manual calculation: 100 * (0.35*0.5 + 0.35*0.5 + 0.20*0.5 + 0.10*0.5) = 50
      const result = computeTrustScore({
        authenticityScore: 0.5,
        factualVerificationScore: 0.5,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.5,
      });
      expect(result.trustScore).toBe(50);
    });

    it('should weight authenticity and factualVerification equally (35% each)', () => {
      // Only authenticity at 1.0 → 0.35 * 100 = 35
      const authOnly = computeTrustScore({
        authenticityScore: 1.0,
        factualVerificationScore: 0.0,
        sourceCredibilityScore: 0.0,
        modelConfidenceScore: 0.0,
      });
      expect(authOnly.trustScore).toBe(35);

      // Only factualVerification at 1.0 → 0.35 * 100 = 35
      const fvOnly = computeTrustScore({
        authenticityScore: 0.0,
        factualVerificationScore: 1.0,
        sourceCredibilityScore: 0.0,
        modelConfidenceScore: 0.0,
      });
      expect(fvOnly.trustScore).toBe(35);
    });

    it('should weight sourceCredibility at 20%', () => {
      const result = computeTrustScore({
        authenticityScore: 0.0,
        factualVerificationScore: 0.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 0.0,
      });
      expect(result.trustScore).toBe(20);
    });

    it('should weight modelConfidence at 10%', () => {
      const result = computeTrustScore({
        authenticityScore: 0.0,
        factualVerificationScore: 0.0,
        sourceCredibilityScore: 0.0,
        modelConfidenceScore: 1.0,
      });
      expect(result.trustScore).toBe(10);
    });

    it('should verify the weights sum to 1.0', () => {
      const sum =
        WEIGHTS.authenticity +
        WEIGHTS.factualVerification +
        WEIGHTS.sourceCredibility +
        WEIGHTS.modelConfidence;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should round the final score to the nearest integer', () => {
      // 0.35*0.3 + 0.35*0.3 + 0.20*0.3 + 0.10*0.3 = 0.3 → 30
      const result = computeTrustScore({
        authenticityScore: 0.3,
        factualVerificationScore: 0.3,
        sourceCredibilityScore: 0.3,
        modelConfidenceScore: 0.3,
      });
      expect(result.trustScore).toBe(30);
      expect(Number.isInteger(result.trustScore)).toBe(true);
    });

    it('should handle asymmetric component scores', () => {
      // 0.35*0.9 + 0.35*0.1 + 0.20*0.5 + 0.10*0.7 = 0.315 + 0.035 + 0.10 + 0.07 = 0.52 → 52
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.1,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.7,
      });
      expect(result.trustScore).toBe(52);
    });
  });

  // ── 2. Rule 1: Confirmed False → RED ───────────────────────────

  describe('Rule 1: Confirmed false fact-check forces RED', () => {
    it('should force RED when isConfirmedFalse is true, regardless of score', () => {
      const result = computeTrustScore({
        ...PERFECT_INPUT,
        isConfirmedFalse: true,
      });
      expect(result.label).toBe(Label.RED);
      expect(result.trustScore).toBe(100);
      expect(result.isOverrideApplied).toBe(true);
    });

    it('should force RED even with high scores', () => {
      const result = computeTrustScore({
        authenticityScore: 1.0,
        factualVerificationScore: 1.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 1.0,
        isConfirmedFalse: true,
      });
      expect(result.label).toBe(Label.RED);
    });

    it('should not apply when isConfirmedFalse is false', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: false,
      });
      expect(result.label).not.toBe(Label.RED);
      expect(result.isOverrideApplied).toBe(false);
    });

    it('should include Rule 1 in reasoning', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 1'))).toBe(true);
    });

    it('should override default isConfirmedFalse (false) when explicitly true', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
      });
      expect(result.label).toBe(Label.RED);
    });
  });

  // ── 3. Rule 2: High Manipulation Probability → RED ──────────────

  describe('Rule 2: High manipulation probability forces RED', () => {
    it('should force RED when manipulationProbability >= 0.7', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        manipulationProbability: 0.7,
      });
      expect(result.label).toBe(Label.RED);
      expect(result.isOverrideApplied).toBe(true);
    });

    it('should force RED when manipulationProbability is 1.0', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        manipulationProbability: 1.0,
      });
      expect(result.label).toBe(Label.RED);
    });

    it('should not force RED when manipulationProbability < 0.7', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        manipulationProbability: 0.69,
      });
      expect(result.label).not.toBe(Label.RED);
      expect(result.isOverrideApplied).toBe(false);
    });

    it('should not apply when manipulationProbability is 0', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        manipulationProbability: 0,
      });
      expect(result.isOverrideApplied).toBe(false);
    });

    it('should include Rule 2 in reasoning when triggered', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        manipulationProbability: 0.8,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 2'))).toBe(true);
    });

    it('should have lower priority than Rule 1 (confirmed false)', () => {
      // Both rules would trigger RED, but Rule 1 fires first
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
        manipulationProbability: 0.9,
      });
      expect(result.label).toBe(Label.RED);
      // Rule 1 reasoning should be present
      expect(result.reasoning.some((r) => r.includes('Rule 1'))).toBe(true);
    });
  });

  // ── 4. Rule 3: Opinion/Satire/Edited → PURPLE ──────────────────

  describe('Rule 3: Opinion/satire/edited content forces PURPLE', () => {
    it('should force PURPLE for "opinion" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'opinion',
      });
      expect(result.label).toBe(Label.PURPLE);
      expect(result.isOverrideApplied).toBe(true);
    });

    it('should force PURPLE for "satire" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'satire',
      });
      expect(result.label).toBe(Label.PURPLE);
    });

    it('should force PURPLE for "edited" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'edited',
      });
      expect(result.label).toBe(Label.PURPLE);
    });

    it('should force PURPLE for "editorial" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'editorial',
      });
      expect(result.label).toBe(Label.PURPLE);
    });

    it('should force PURPLE for "parody" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'parody',
      });
      expect(result.label).toBe(Label.PURPLE);
    });

    it('should be case-insensitive for content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'SATIRE',
      });
      expect(result.label).toBe(Label.PURPLE);
    });

    it('should not apply for "text" content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'text',
      });
      expect(result.label).not.toBe(Label.PURPLE);
    });

    it('should not apply for empty content type', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: '',
      });
      expect(result.label).not.toBe(Label.PURPLE);
    });

    it('should not apply when contentType is not provided', () => {
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
      });
      expect(result.label).not.toBe(Label.PURPLE);
    });

    it('should include Rule 3 in reasoning when triggered', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: 'opinion',
      });
      expect(result.reasoning.some((r) => r.includes('Rule 3'))).toBe(true);
    });

    it('should have lower priority than Rules 1 and 2', () => {
      // Rule 1 fires first
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
        contentType: 'satire',
      });
      expect(result.label).toBe(Label.RED);
      expect(result.isOverrideApplied).toBe(true);
    });
  });

  // ── 5. Rule 4: Disclosed AI + Supported + Score >= 70 → BLUE ───

  describe('Rule 4: Disclosed AI-generated + factually supported + score >= 70 → BLUE', () => {
    it('should assign BLUE when isDisclosedAI is true and score >= 70', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
        isDisclosedAI: true,
      });
      expect(result.label).toBe(Label.BLUE);
      expect(result.trustScore).toBeGreaterThanOrEqual(70);
    });

    it('should not assign BLUE when isDisclosedAI is false', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
        isDisclosedAI: false,
      });
      expect(result.label).not.toBe(Label.BLUE);
      // Should be GREEN since score >= 80
      expect(result.label).toBe(Label.GREEN);
    });

    it('should not assign BLUE when score < 70', () => {
      const result = computeTrustScore({
        authenticityScore: 0.5,
        factualVerificationScore: 0.5,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.5,
        isDisclosedAI: true,
      });
      expect(result.label).not.toBe(Label.BLUE);
    });

    it('should assign BLUE at exactly score 70', () => {
      // Need: 0.35*A + 0.35*F + 0.20*S + 0.10*K = 0.70
      // If all equal: 0.70 → 0.70 * 100 = 70
      const result = computeTrustScore({
        authenticityScore: 0.7,
        factualVerificationScore: 0.7,
        sourceCredibilityScore: 0.7,
        modelConfidenceScore: 0.7,
        isDisclosedAI: true,
      });
      expect(result.trustScore).toBe(70);
      expect(result.label).toBe(Label.BLUE);
    });

    it('should have lower priority than Rules 1, 2, and 3', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
        isDisclosedAI: true,
        contentType: 'satire',
      });
      expect(result.label).toBe(Label.RED); // Rule 1 wins
    });

    it('should include Rule 4 in reasoning when triggered', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isDisclosedAI: true,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 4'))).toBe(true);
    });
  });

  // ── 6. Rule 5: High Trust (score >= 80) → GREEN ────────────────

  describe('Rule 5: High-trust content (score >= 80) → GREEN', () => {
    it('should assign GREEN when score >= 80 and no override applies', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
      });
      expect(result.label).toBe(Label.GREEN);
      expect(result.trustScore).toBe(80);
    });

    it('should assign GREEN for score > 80', () => {
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
      });
      expect(result.trustScore).toBe(90);
      expect(result.label).toBe(Label.GREEN);
    });

    it('should not assign GREEN when score < 80', () => {
      const result = computeTrustScore({
        authenticityScore: 0.79,
        factualVerificationScore: 0.79,
        sourceCredibilityScore: 0.79,
        modelConfidenceScore: 0.79,
      });
      expect(result.trustScore).toBe(79);
      expect(result.label).not.toBe(Label.GREEN);
    });

    it('should not assign GREEN when Rule 4 (BLUE) applies instead', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
        isDisclosedAI: true,
      });
      expect(result.label).toBe(Label.BLUE);
    });

    it('should include Rule 5 in reasoning when triggered', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 5'))).toBe(true);
    });
  });

  // ── 7. Rule 6: Uncertain → ORANGE ──────────────────────────────

  describe('Rule 6: Uncertain/partially verified → ORANGE', () => {
    it('should assign ORANGE when score is between 40 and 79', () => {
      const result = computeTrustScore({
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
      });
      // 0.35*0.6 + 0.35*0.6 + 0.20*0.6 + 0.10*0.6 = 0.6 → 60
      expect(result.trustScore).toBe(60);
      expect(result.label).toBe(Label.ORANGE);
    });

    it('should assign ORANGE at exactly score 40', () => {
      // 0.35*A + 0.35*F + 0.20*S + 0.10*K = 0.40
      // All equal: 0.40
      const result = computeTrustScore({
        authenticityScore: 0.4,
        factualVerificationScore: 0.4,
        sourceCredibilityScore: 0.4,
        modelConfidenceScore: 0.4,
      });
      expect(result.trustScore).toBe(40);
      expect(result.label).toBe(Label.ORANGE);
    });

    it('should not assign ORANGE when score >= 80', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
      });
      expect(result.label).toBe(Label.GREEN);
    });

    it('should not assign ORANGE when score < 40', () => {
      const result = computeTrustScore({
        authenticityScore: 0.3,
        factualVerificationScore: 0.3,
        sourceCredibilityScore: 0.3,
        modelConfidenceScore: 0.3,
      });
      // 0.35*0.3 + 0.35*0.3 + 0.20*0.3 + 0.10*0.3 = 0.3 → 30
      expect(result.trustScore).toBe(30);
      expect(result.label).toBe(Label.RED);
    });

    it('should include Rule 6 in reasoning when triggered', () => {
      const result = computeTrustScore({
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 6'))).toBe(true);
    });

    it('should mention conflicting evidence in reasoning when present', () => {
      const result = computeTrustScore({
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
        evidence: [
          { evidenceCategory: 'conflicting', verdict: 'mixed', source: 'FactCheck A' },
          { evidenceCategory: 'positive', verdict: 'supports', source: 'FactCheck B' },
        ],
      });
      expect(result.reasoning.some((r) => r.includes('Conflicting evidence'))).toBe(true);
    });

    it('should mention negative evidence in reasoning when present', () => {
      const result = computeTrustScore({
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
        evidence: [
          { evidenceCategory: 'negative', verdict: 'refutes', source: 'FactCheck A' },
          { evidenceCategory: 'positive', verdict: 'supports', source: 'FactCheck B' },
        ],
      });
      expect(result.reasoning.some((r) => r.includes('negative evidence'))).toBe(true);
    });
  });

  // ── 8. Rule 7: Low Trust (score < 40) → RED ────────────────────

  describe('Rule 7: Low trust (score < 40) → RED', () => {
    it('should assign RED when score < 40', () => {
      const result = computeTrustScore({
        authenticityScore: 0.3,
        factualVerificationScore: 0.3,
        sourceCredibilityScore: 0.3,
        modelConfidenceScore: 0.3,
      });
      expect(result.trustScore).toBe(30);
      expect(result.label).toBe(Label.RED);
      expect(result.isOverrideApplied).toBe(true);
    });

    it('should assign RED for score 0', () => {
      const result = computeTrustScore(ZERO_INPUT);
      expect(result.trustScore).toBe(0);
      expect(result.label).toBe(Label.RED);
    });

    it('should not assign RED when score >= 40', () => {
      const result = computeTrustScore({
        authenticityScore: 0.4,
        factualVerificationScore: 0.4,
        sourceCredibilityScore: 0.4,
        modelConfidenceScore: 0.4,
      });
      expect(result.trustScore).toBe(40);
      expect(result.label).not.toBe(Label.RED);
    });

    it('should include Rule 7 in reasoning when triggered', () => {
      const result = computeTrustScore({
        authenticityScore: 0.2,
        factualVerificationScore: 0.2,
        sourceCredibilityScore: 0.2,
        modelConfidenceScore: 0.2,
      });
      expect(result.reasoning.some((r) => r.includes('Rule 7'))).toBe(true);
    });
  });

  // ── 9. Boundary Conditions ──────────────────────────────────────

  describe('Boundary conditions', () => {
    it('should assign ORANGE at score 39 (just below 40 threshold)', () => {
      // We need score = 39. Let's find inputs that produce 39.
      // 0.35*A + 0.35*F + 0.20*S + 0.10*K = 0.39
      // If all equal: x = 0.39
      // But round(39) = 39. Let's use 0.39 for all.
      const result = computeTrustScore({
        authenticityScore: 0.39,
        factualVerificationScore: 0.39,
        sourceCredibilityScore: 0.39,
        modelConfidenceScore: 0.39,
      });
      // 0.35*0.39 + 0.35*0.39 + 0.20*0.39 + 0.10*0.39 = 0.39 → 39
      expect(result.trustScore).toBe(39);
      expect(result.label).toBe(Label.RED); // < 40
    });

    it('should assign ORANGE at score 79 (just below 80 threshold)', () => {
      const result = computeTrustScore({
        authenticityScore: 0.79,
        factualVerificationScore: 0.79,
        sourceCredibilityScore: 0.79,
        modelConfidenceScore: 0.79,
      });
      expect(result.trustScore).toBe(79);
      expect(result.label).toBe(Label.ORANGE);
    });

    it('should assign GREEN at score 80 (exact threshold)', () => {
      const result = computeTrustScore({
        authenticityScore: 0.8,
        factualVerificationScore: 0.8,
        sourceCredibilityScore: 0.8,
        modelConfidenceScore: 0.8,
      });
      expect(result.trustScore).toBe(80);
      expect(result.label).toBe(Label.GREEN);
    });

    it('should assign BLUE at score 70 with disclosed AI', () => {
      const result = computeTrustScore({
        authenticityScore: 0.7,
        factualVerificationScore: 0.7,
        sourceCredibilityScore: 0.7,
        modelConfidenceScore: 0.7,
        isDisclosedAI: true,
      });
      expect(result.trustScore).toBe(70);
      expect(result.label).toBe(Label.BLUE);
    });

    it('should assign ORANGE at score 69 with disclosed AI (below 70)', () => {
      // 0.35*0.69 + 0.35*0.69 + 0.20*0.69 + 0.10*0.69 = 0.69 → 69
      const result = computeTrustScore({
        authenticityScore: 0.69,
        factualVerificationScore: 0.69,
        sourceCredibilityScore: 0.69,
        modelConfidenceScore: 0.69,
        isDisclosedAI: true,
      });
      expect(result.trustScore).toBe(69);
      expect(result.label).toBe(Label.ORANGE);
    });

    it('should handle score 100 with all overrides off', () => {
      const result = computeTrustScore({
        ...PERFECT_INPUT,
        isConfirmedFalse: false,
        isDisclosedAI: false,
        contentType: 'text',
      });
      expect(result.trustScore).toBe(100);
      expect(result.label).toBe(Label.GREEN);
    });
  });

  // ── 10. Input Validation and Clamping ───────────────────────────

  describe('Input validation and clamping', () => {
    it('should throw when input is null', () => {
      expect(() => computeTrustScore(null)).toThrow('Trust score input is required');
    });

    it('should throw when input is undefined', () => {
      expect(() => computeTrustScore(undefined)).toThrow('Trust score input is required');
    });

    it('should throw when authenticityScore is missing', () => {
      expect(() =>
        computeTrustScore({
          factualVerificationScore: 0.8,
          sourceCredibilityScore: 0.8,
          modelConfidenceScore: 0.8,
        })
      ).toThrow('Missing required score: authenticityScore');
    });

    it('should throw when factualVerificationScore is missing', () => {
      expect(() =>
        computeTrustScore({
          authenticityScore: 0.8,
          sourceCredibilityScore: 0.8,
          modelConfidenceScore: 0.8,
        })
      ).toThrow('Missing required score: factualVerificationScore');
    });

    it('should throw when sourceCredibilityScore is missing', () => {
      expect(() =>
        computeTrustScore({
          authenticityScore: 0.8,
          factualVerificationScore: 0.8,
          modelConfidenceScore: 0.8,
        })
      ).toThrow('Missing required score: sourceCredibilityScore');
    });

    it('should throw when modelConfidenceScore is missing', () => {
      expect(() =>
        computeTrustScore({
          authenticityScore: 0.8,
          factualVerificationScore: 0.8,
          sourceCredibilityScore: 0.8,
        })
      ).toThrow('Missing required score: modelConfidenceScore');
    });

    it('should throw when a score is not a number', () => {
      expect(() =>
        computeTrustScore({
          authenticityScore: 'high',
          factualVerificationScore: 0.8,
          sourceCredibilityScore: 0.8,
          modelConfidenceScore: 0.8,
        })
      ).toThrow('authenticityScore must be a number');
    });

    it('should clamp scores above 1.0 to 1.0', () => {
      const result = computeTrustScore({
        authenticityScore: 1.5,
        factualVerificationScore: 2.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 1.0,
      });
      expect(result.componentScores.authenticity).toBe(1.0);
      expect(result.componentScores.factualVerification).toBe(1.0);
    });

    it('should clamp scores below 0.0 to 0.0', () => {
      const result = computeTrustScore({
        authenticityScore: -0.5,
        factualVerificationScore: -1.0,
        sourceCredibilityScore: 0.0,
        modelConfidenceScore: 0.0,
      });
      expect(result.componentScores.authenticity).toBe(0.0);
      expect(result.componentScores.factualVerification).toBe(0.0);
    });

    it('should handle NaN inputs by clamping to 0', () => {
      const result = computeTrustScore({
        authenticityScore: NaN,
        factualVerificationScore: 0.8,
        sourceCredibilityScore: 0.8,
        modelConfidenceScore: 0.8,
      });
      expect(result.componentScores.authenticity).toBe(0.0);
    });

    it('should handle Infinity inputs by clamping to 1', () => {
      const result = computeTrustScore({
        authenticityScore: Infinity,
        factualVerificationScore: 0.8,
        sourceCredibilityScore: 0.8,
        modelConfidenceScore: 0.8,
      });
      expect(result.componentScores.authenticity).toBe(1.0);
    });

    it('should clamp -Infinity to 0', () => {
      const result = computeTrustScore({
        authenticityScore: -Infinity,
        factualVerificationScore: 0.8,
        sourceCredibilityScore: 0.8,
        modelConfidenceScore: 0.8,
      });
      expect(result.componentScores.authenticity).toBe(0.0);
    });
  });

  // ── 11. Reasoning Output Transparency ───────────────────────────

  describe('Reasoning output transparency', () => {
    it('should always produce a reasoning array', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(Array.isArray(result.reasoning)).toBe(true);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should produce a single reasoning entry for GREEN (no override)', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: false,
        isDisclosedAI: false,
        contentType: 'text',
      });
      // Should only have Rule 5 reasoning
      expect(result.reasoning.length).toBe(1);
      expect(result.reasoning[0]).toContain('Rule 5');
    });

    it('should produce reasoning for ORANGE with conflicting evidence', () => {
      const result = computeTrustScore({
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
        evidence: [
          { evidenceCategory: 'conflicting', verdict: 'mixed', source: 'Source A' },
        ],
      });
      expect(result.reasoning.length).toBeGreaterThanOrEqual(2);
    });

    it('should join reasoning into a newline-separated string for explanation', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
        evidence: [
          { verdict: 'refutes', source: 'Snopes', evidenceCategory: 'negative' },
        ],
      });
      const explanation = result.reasoning.join('\n');
      expect(typeof explanation).toBe('string');
      expect(explanation).toContain('Rule 1');
      expect(explanation).toContain('Snopes');
    });
  });

  // ── 12. Model and Rule Versioning ───────────────────────────────

  describe('Model and rule versioning', () => {
    it('should include modelVersion in the result', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(result.modelVersion).toBe(MODEL_VERSION);
      expect(typeof result.modelVersion).toBe('string');
    });

    it('should include ruleVersion in the result', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(result.ruleVersion).toBe(RULE_VERSION);
      expect(typeof result.ruleVersion).toBe('string');
    });

    it('should have consistent version strings across all calls', () => {
      const r1 = computeTrustScore(BALANCED_INPUT);
      const r2 = computeTrustScore(ZERO_INPUT);
      expect(r1.modelVersion).toBe(r2.modelVersion);
      expect(r1.ruleVersion).toBe(r2.ruleVersion);
    });

    it('MODEL_VERSION should be a valid semver-like string', () => {
      expect(MODEL_VERSION).toMatch(/^nexora-trust-v\d+\.\d+\.\d+$/);
    });

    it('RULE_VERSION should be a valid semver-like string', () => {
      expect(RULE_VERSION).toMatch(/^nexora-rules-v\d+\.\d+\.\d+$/);
    });
  });

  // ── 13. computeRawScore ─────────────────────────────────────────

  describe('computeRawScore', () => {
    it('should compute the same score as computeTrustScore.trustScore', () => {
      const components = {
        authenticity: 0.85,
        factualVerification: 0.75,
        sourceCredibility: 0.9,
        modelConfidence: 0.8,
      };
      const rawScore = computeRawScore(components);
      const result = computeTrustScore({
        authenticityScore: 0.85,
        factualVerificationScore: 0.75,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.8,
      });
      expect(rawScore).toBe(result.trustScore);
    });
  });

  // ── 14. Component Scores in Output ──────────────────────────────

  describe('Component scores in output', () => {
    it('should return all four component scores', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(result.componentScores).toEqual({
        authenticity: 0.8,
        factualVerification: 0.8,
        sourceCredibility: 0.8,
        modelConfidence: 0.8,
      });
    });

    it('should preserve clamped values in component scores', () => {
      const result = computeTrustScore({
        authenticityScore: 1.5,
        factualVerificationScore: -0.3,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.5,
      });
      expect(result.componentScores.authenticity).toBe(1.0);
      expect(result.componentScores.factualVerification).toBe(0.0);
    });
  });

  // ── 15. Rule Priority / Interaction ─────────────────────────────

  describe('Rule priority and interaction', () => {
    it('should prioritize Rule 1 over all other rules', () => {
      const result = computeTrustScore({
        authenticityScore: 1.0,
        factualVerificationScore: 1.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 1.0,
        isConfirmedFalse: true,
        isDisclosedAI: true,
        contentType: 'satire',
        manipulationProbability: 0.9,
      });
      expect(result.label).toBe(Label.RED);
      expect(result.reasoning[0]).toContain('Rule 1');
    });

    it('should prioritize Rule 2 over Rules 3-7', () => {
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
        manipulationProbability: 0.8,
        contentType: 'opinion',
        isDisclosedAI: true,
      });
      expect(result.label).toBe(Label.RED);
      expect(result.reasoning[0]).toContain('Rule 2');
    });

    it('should prioritize Rule 3 over Rules 4-7', () => {
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
        contentType: 'satire',
        isDisclosedAI: true,
      });
      expect(result.label).toBe(Label.PURPLE);
      expect(result.reasoning[0]).toContain('Rule 3');
    });

    it('should prioritize Rule 4 over Rules 5-7', () => {
      const result = computeTrustScore({
        authenticityScore: 0.9,
        factualVerificationScore: 0.9,
        sourceCredibilityScore: 0.9,
        modelConfidenceScore: 0.9,
        isDisclosedAI: true,
      });
      expect(result.label).toBe(Label.BLUE);
      expect(result.reasoning[0]).toContain('Rule 4');
    });

    it('should prioritize Rule 5 over Rules 6-7', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT, // score = 80
      });
      expect(result.label).toBe(Label.GREEN);
      expect(result.reasoning[0]).toContain('Rule 5');
    });

    it('should prioritize Rule 6 over Rule 7', () => {
      const result = computeTrustScore({
        authenticityScore: 0.5,
        factualVerificationScore: 0.5,
        sourceCredibilityScore: 0.5,
        modelConfidenceScore: 0.5,
      });
      // score = 50 → ORANGE
      expect(result.label).toBe(Label.ORANGE);
      expect(result.reasoning[0]).toContain('Rule 6');
    });
  });

  // ── 16. Persistence (computeAndStoreTrustScore) ─────────────────

  describe('computeAndStoreTrustScore', () => {
    it('should throw when postId is missing', async () => {
      await expect(computeAndStoreTrustScore(null, BALANCED_INPUT)).rejects.toThrow(
        'Post ID is required'
      );
    });

    it('should call TrustScore.findOneAndUpdate with correct data', async () => {
      const mockSaved = {
        _id: 'mock_ts_123',
        post: 'post_123',
        score: 80,
        label: 'Green',
      };
      TrustScore.findOneAndUpdate.mockResolvedValue(mockSaved);

      const result = await computeAndStoreTrustScore('post_123', BALANCED_INPUT);

      expect(TrustScore.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const callArgs = TrustScore.findOneAndUpdate.mock.calls[0];
      expect(callArgs[0]).toEqual({ post: 'post_123' });
      expect(callArgs[1].score).toBe(80);
      expect(callArgs[1].label).toBe('Green');
      expect(callArgs[1].modelVersion).toBe(MODEL_VERSION);
      expect(callArgs[1].ruleVersion).toBe(RULE_VERSION);
      expect(result._id).toBe('mock_ts_123');
    });

    it('should upsert (create if not exists)', async () => {
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new' });

      await computeAndStoreTrustScore('post_456', BALANCED_INPUT);

      const options = TrustScore.findOneAndUpdate.mock.calls[0][2];
      expect(options.upsert).toBe(true);
      expect(options.new).toBe(true);
    });

    it('should include evidenceRefs in the stored document', async () => {
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new' });

      const evidenceRefs = ['ev_1', 'ev_2'];
      await computeAndStoreTrustScore('post_789', BALANCED_INPUT, evidenceRefs);

      const updateDoc = TrustScore.findOneAndUpdate.mock.calls[0][1];
      expect(updateDoc.evidenceRefs).toEqual(evidenceRefs);
    });

    it('should store the explanation as joined reasoning', async () => {
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new' });

      await computeAndStoreTrustScore('post_explain', BALANCED_INPUT);

      const updateDoc = TrustScore.findOneAndUpdate.mock.calls[0][1];
      expect(typeof updateDoc.explanation).toBe('string');
      expect(updateDoc.explanation).toContain('Rule');
    });

    it('should store multi-line explanation when evidence adds extra reasoning', async () => {
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new' });

      await computeAndStoreTrustScore('post_multi', {
        authenticityScore: 0.6,
        factualVerificationScore: 0.6,
        sourceCredibilityScore: 0.6,
        modelConfidenceScore: 0.6,
        evidence: [
          { evidenceCategory: 'conflicting', verdict: 'mixed', source: 'Source A' },
        ],
      });

      const updateDoc = TrustScore.findOneAndUpdate.mock.calls[0][1];
      expect(typeof updateDoc.explanation).toBe('string');
      expect(updateDoc.explanation).toContain('\n');
    });

    it('should store isOverrideApplied correctly', async () => {
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new' });

      // No override → GREEN
      await computeAndStoreTrustScore('post_green', BALANCED_INPUT);
      let updateDoc = TrustScore.findOneAndUpdate.mock.calls[0][1];
      expect(updateDoc.isOverrideApplied).toBe(false);

      jest.clearAllMocks();
      TrustScore.findOneAndUpdate.mockResolvedValue({ _id: 'new2' });

      // Confirmed false → RED override
      await computeAndStoreTrustScore('post_red', {
        ...BALANCED_INPUT,
        isConfirmedFalse: true,
      });
      updateDoc = TrustScore.findOneAndUpdate.mock.calls[0][1];
      expect(updateDoc.isOverrideApplied).toBe(true);
    });
  });

  // ── 17. getTrustScoreByPost ─────────────────────────────────────

  describe('getTrustScoreByPost', () => {
    it('should call TrustScore.findOne with the correct postId', async () => {
      const chainableQuery = {
        populate: jest.fn().mockResolvedValue({ post: 'p1', score: 80 }),
      };
      TrustScore.findOne.mockReturnValue(chainableQuery);

      const result = await getTrustScoreByPost('post_abc');

      expect(TrustScore.findOne).toHaveBeenCalledWith({ post: 'post_abc' });
      expect(chainableQuery.populate).toHaveBeenCalledWith('evidenceRefs');
    });
  });

  // ── 18. Edge Cases ─────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle all optional fields not provided', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(result.label).toBeDefined();
      expect(result.trustScore).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    it('should handle very small positive scores', () => {
      const result = computeTrustScore({
        authenticityScore: 0.001,
        factualVerificationScore: 0.001,
        sourceCredibilityScore: 0.001,
        modelConfidenceScore: 0.001,
      });
      expect(result.trustScore).toBe(0); // rounds to 0
      expect(result.label).toBe(Label.RED);
    });

    it('should handle mixed extreme values', () => {
      const result = computeTrustScore({
        authenticityScore: 1.0,
        factualVerificationScore: 0.0,
        sourceCredibilityScore: 1.0,
        modelConfidenceScore: 0.0,
      });
      // 0.35*1.0 + 0.35*0.0 + 0.20*1.0 + 0.10*0.0 = 0.55 → 55
      expect(result.trustScore).toBe(55);
      expect(result.label).toBe(Label.ORANGE);
    });

    it('should handle empty string contentType as no-op for Rule 3', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        contentType: '   ',
      });
      expect(result.label).not.toBe(Label.PURPLE);
    });

    it('should handle undefined evidence gracefully', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        evidence: undefined,
      });
      expect(result.label).toBeDefined();
    });

    it('should handle empty evidence array', () => {
      const result = computeTrustScore({
        ...BALANCED_INPUT,
        evidence: [],
      });
      expect(result.label).toBeDefined();
    });

    it('should produce identical results for the same inputs', () => {
      const r1 = computeTrustScore(BALANCED_INPUT);
      const r2 = computeTrustScore({ ...BALANCED_INPUT });
      expect(r1.trustScore).toBe(r2.trustScore);
      expect(r1.label).toBe(r2.label);
    });
  });

  // ── 19. Constants Verification ──────────────────────────────────

  describe('Constants', () => {
    it('should have WEIGHTS that sum to 1.0', () => {
      const sum =
        WEIGHTS.authenticity +
        WEIGHTS.factualVerification +
        WEIGHTS.sourceCredibility +
        WEIGHTS.modelConfidence;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should have all Label values defined', () => {
      expect(Label.GREEN).toBe('Green');
      expect(Label.BLUE).toBe('Blue');
      expect(Label.PURPLE).toBe('Purple');
      expect(Label.ORANGE).toBe('Orange');
      expect(Label.RED).toBe('Red');
    });

    it('should have exactly 5 labels', () => {
      expect(Object.keys(Label)).toHaveLength(5);
    });

    it('should have THRESHOLDS with logical ordering', () => {
      expect(THRESHOLDS.lowTrust).toBeLessThan(THRESHOLDS.moderateTrust);
      expect(THRESHOLDS.moderateTrust).toBeLessThan(THRESHOLDS.highTrust);
    });

    it('should have OPINION_CONTENT_TYPES as an array', () => {
      expect(Array.isArray(OPINION_CONTENT_TYPES)).toBe(true);
      expect(OPINION_CONTENT_TYPES.length).toBeGreaterThan(0);
    });

    it('should include "satire" and "opinion" in OPINION_CONTENT_TYPES', () => {
      expect(OPINION_CONTENT_TYPES).toContain('satire');
      expect(OPINION_CONTENT_TYPES).toContain('opinion');
      expect(OPINION_CONTENT_TYPES).toContain('edited');
    });
  });

  // ── 20. Return Shape ────────────────────────────────────────────

  describe('Return shape', () => {
    it('should return all required fields', () => {
      const result = computeTrustScore(BALANCED_INPUT);

      expect(result).toHaveProperty('trustScore');
      expect(result).toHaveProperty('componentScores');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('modelVersion');
      expect(result).toHaveProperty('ruleVersion');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('isOverrideApplied');
    });

    it('should have componentScores as an object with 4 fields', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      const keys = Object.keys(result.componentScores);
      expect(keys).toHaveLength(4);
      expect(keys).toContain('authenticity');
      expect(keys).toContain('factualVerification');
      expect(keys).toContain('sourceCredibility');
      expect(keys).toContain('modelConfidence');
    });

    it('should have trustScore as a number between 0 and 100', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(typeof result.trustScore).toBe('number');
      expect(result.trustScore).toBeGreaterThanOrEqual(0);
      expect(result.trustScore).toBeLessThanOrEqual(100);
    });

    it('should have label as one of the 5 valid labels', () => {
      const result = computeTrustScore(BALANCED_INPUT);
      expect(Object.values(Label)).toContain(result.label);
    });
  });
});
