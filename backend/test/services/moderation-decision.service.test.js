/**
 * Moderation Decision Service Tests (Module 16)
 * ==============================================
 * Tests for the moderation decision engine.
 *
 * Covers:
 *   1. Auto-publish (score >= 60)
 *   2. Auto-reject (score < 20)
 *   3. Review required (score 20-59)
 *   4. Confirmed false override → reject
 *   5. High manipulation → reject
 *   6. Pipeline failure handling
 *   7. No trust score → review
 *   8. Apply decision to post
 *   9. Edge cases
 *
 * Run with: npm test -- --testPathPattern=moderation-decision
 */

// ─── Mocks ───────────────────────────────────────────────────────────

jest.mock('../../src/models/post.model', () => {
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'mock_post';
  };
  MockPost.findById = jest.fn();
  MockPost.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  return MockPost;
});

const Post = require('../../src/models/post.model');

const {
  evaluateDecision,
  applyDecision,
  Decision,
  DECISION_VERSION,
  AUTO_PUBLISH_THRESHOLD,
  AUTO_REJECT_THRESHOLD,
  REVIEW_THRESHOLD,
  RULES,
} = require('../../src/services/moderation-decision.service');

// ─── Test Helpers ─────────────────────────────────────────────────────

function createTrustScoreResult(overrides = {}) {
  return {
    score: 75,
    label: 'Blue',
    explanation: 'High-trust content',
    isOverrideApplied: false,
    componentScores: {
      authenticity: 0.8,
      factualVerification: 0.7,
      sourceCredibility: 0.6,
      modelConfidence: 0.8,
    },
    ...overrides,
  };
}

function createPipelineResult(overrides = {}) {
  return {
    trustScoreResult: createTrustScoreResult(),
    stageResults: {},
    contentType: 'TEXT',
    hasErrors: false,
    failedStages: [],
    reviewRequiredStages: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Moderation Decision Service (Module 16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Auto-Publish ───────────────────────────────────────────

  describe('Auto-publish (score >= 60)', () => {
    it('should PUBLISH when trust score >= 60 and label is not Red', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 80, label: 'Green' }),
      }));
      expect(result.action).toBe(Decision.PUBLISH);
      expect(result.shouldPublish).toBe(true);
    });

    it('should PUBLISH at exact threshold (60)', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 60, label: 'Orange' }),
      }));
      expect(result.action).toBe(Decision.PUBLISH);
    });

    it('should PUBLISH for score 100', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 100, label: 'Green' }),
      }));
      expect(result.action).toBe(Decision.PUBLISH);
    });
  });

  // ── 2. Auto-Reject ───────────────────────────────────────────

  describe('Auto-reject (score < 20)', () => {
    it('should REJECT when trust score < 20', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 15, label: 'Red' }),
      }));
      expect(result.action).toBe(Decision.REJECT);
      expect(result.shouldPublish).toBe(false);
    });

    it('should REJECT at score 0', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 0, label: 'Red' }),
      }));
      expect(result.action).toBe(Decision.REJECT);
    });

    it('should REJECT at score 19', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 19, label: 'Red' }),
      }));
      expect(result.action).toBe(Decision.REJECT);
    });
  });

  // ── 3. Review Required (score 20-59) ─────────────────────────

  describe('Review required (score 20-59)', () => {
    it('should REVIEW when score is between 20 and 39', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 30, label: 'Red' }),
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
    });

    it('should REVIEW at score 20 (exact lower bound)', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 20, label: 'Orange' }),
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
    });

    it('should REVIEW at score 39', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 39, label: 'Orange' }),
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
    });

    it('should PUBLISH with warning for score 40-59', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({ score: 50, label: 'Orange' }),
      }));
      expect(result.action).toBe(Decision.PUBLISH);
      expect(result.reason).toContain('moderate trust');
    });
  });

  // ── 4. Confirmed False Override ──────────────────────────────

  describe('Confirmed false override', () => {
    it('should REJECT when isOverrideApplied and label is Red and reasoning mentions confirmed false', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 85,
          label: 'Red',
          isOverrideApplied: true,
          explanation: 'Rule 1: Confirmed false fact-check result forces RED label.',
        }),
      }));
      expect(result.action).toBe(Decision.REJECT);
      expect(result.ruleApplied).toBe('RULE_CONFIRMED_FALSE');
    });

    it('should not reject on Red override without confirmed false reasoning', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 15,
          label: 'Red',
          isOverrideApplied: true,
          explanation: 'Rule 7: Low credibility signals forces RED label.',
        }),
      }));
      // Score 15 < 20 → auto-reject due to low score, not confirmed false
      expect(result.action).toBe(Decision.REJECT);
    });
  });

  // ── 5. High Manipulation ─────────────────────────────────────

  describe('High manipulation probability', () => {
    it('should REJECT when authenticity score implies manipulation >= 0.7', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 75,
          label: 'Blue',
          componentScores: {
            authenticity: 0.2, // manipulation = 1 - 0.2 = 0.8 >= 0.7
            factualVerification: 0.8,
            sourceCredibility: 0.7,
            modelConfidence: 0.8,
          },
        }),
      }));
      expect(result.action).toBe(Decision.REJECT);
      expect(result.ruleApplied).toBe('RULE_HIGH_MANIPULATION');
    });

    it('should not reject when manipulation < 0.7', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 75,
          label: 'Blue',
          componentScores: {
            authenticity: 0.4, // manipulation = 0.6 < 0.7
            factualVerification: 0.8,
            sourceCredibility: 0.7,
            modelConfidence: 0.8,
          },
        }),
      }));
      expect(result.action).not.toBe(Decision.REJECT);
    });
  });

  // ── 6. Pipeline Failure Handling ─────────────────────────────

  describe('Pipeline failure handling', () => {
    it('should REVIEW when critical stages failed', () => {
      const result = evaluateDecision(createPipelineResult({
        failedStages: ['AI_ANALYSIS', 'TRUST_SCORE'],
        trustScoreResult: createTrustScoreResult({ score: 75 }),
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
      expect(result.ruleApplied).toBe('PIPELINE_FAILURE');
    });

    it('should REVIEW when any stage requires review', () => {
      const result = evaluateDecision(createPipelineResult({
        reviewRequiredStages: ['FACT_VERIFICATION'],
        trustScoreResult: createTrustScoreResult({ score: 75 }),
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
      expect(result.ruleApplied).toBe('STAGE_REVIEW_REQUIRED');
    });
  });

  // ── 7. No Trust Score ────────────────────────────────────────

  describe('No trust score', () => {
    it('should REVIEW when no trust score is computed', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: null,
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
      expect(result.ruleApplied).toBe('NO_TRUST_SCORE');
    });

    it('should REVIEW when trust score is missing', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: { score: null, label: null },
      }));
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
    });
  });

  // ── 8. Apply Decision ────────────────────────────────────────

  describe('Apply decision to post', () => {
    it('should set PUBLISHED status on publish decision', async () => {
      const mockPost = { _id: 'post_001', verificationStatus: 'VERIFYING' };
      Post.findById.mockResolvedValue(mockPost);

      await applyDecision('post_001', {
        action: Decision.PUBLISH,
        reason: 'Score meets threshold',
      });

      expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
        'post_001',
        expect.objectContaining({
          verificationStatus: 'PUBLISHED',
          moderationStatus: 'approved',
        }),
        { new: true }
      );
    });

    it('should set REJECTED status on reject decision', async () => {
      const mockPost = { _id: 'post_002', verificationStatus: 'VERIFYING' };
      Post.findById.mockResolvedValue(mockPost);

      await applyDecision('post_002', {
        action: Decision.REJECT,
        reason: 'Low trust score',
      });

      expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
        'post_002',
        expect.objectContaining({
          verificationStatus: 'REJECTED',
          moderationStatus: 'rejected',
        }),
        { new: true }
      );
    });

    it('should set REVIEW_REQUIRED status on review decision', async () => {
      const mockPost = { _id: 'post_003', verificationStatus: 'VERIFYING' };
      Post.findById.mockResolvedValue(mockPost);

      await applyDecision('post_003', {
        action: Decision.REVIEW_REQUIRED,
        reason: 'Moderate trust',
      });

      expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
        'post_003',
        expect.objectContaining({
          verificationStatus: 'REVIEW_REQUIRED',
          moderationStatus: 'under_review',
        }),
        { new: true }
      );
    });

    it('should set FLAGGED status on escalate decision', async () => {
      const mockPost = { _id: 'post_004', verificationStatus: 'VERIFYING' };
      Post.findById.mockResolvedValue(mockPost);

      await applyDecision('post_004', {
        action: Decision.ESCALATE,
        reason: 'Needs human review',
      });

      expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
        'post_004',
        expect.objectContaining({
          verificationStatus: 'REVIEW_REQUIRED',
          moderationStatus: 'flagged',
        }),
        { new: true }
      );
    });

    it('should throw when post not found', async () => {
      Post.findById.mockResolvedValue(null);

      await expect(
        applyDecision('nonexistent', { action: Decision.PUBLISH })
      ).rejects.toThrow('Post not found');
    });
  });

  // ── 9. Auto-Moderation Disabled ──────────────────────────────

  describe('Auto-moderation disabled', () => {
    it('should ESCALATE when auto-moderation is disabled', () => {
      const result = evaluateDecision(createPipelineResult(), {
        autoModerationEnabled: false,
      });
      expect(result.action).toBe(Decision.ESCALATE);
      expect(result.ruleApplied).toBe('CONFIG');
    });
  });

  // ── 10. Red Label Override Conflict ──────────────────────────

  describe('Red label override conflict', () => {
    it('should REVIEW when score >= 60 but label is Red from override (not confirmed false)', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 85,
          label: 'Red',
          isOverrideApplied: true,
          explanation: 'Rule 2: High manipulation probability forces RED label.',
          componentScores: {
            authenticity: 0.7, // manipulation = 0.3 < 0.7, won't trigger manipulation rule
            factualVerification: 0.8,
            sourceCredibility: 0.7,
            modelConfidence: 0.8,
          },
        }),
      }));
      // Score >= 60 but label is Red from non-confirmed-false override → REVIEW
      expect(result.action).toBe(Decision.REVIEW_REQUIRED);
    });

    it('should REJECT when high manipulation overrides high score', () => {
      const result = evaluateDecision(createPipelineResult({
        trustScoreResult: createTrustScoreResult({
          score: 85,
          label: 'Red',
          isOverrideApplied: true,
          explanation: 'Rule 2: High manipulation probability forces RED label.',
          componentScores: {
            authenticity: 0.2, // manipulation = 0.8 >= 0.7 → REJECT
            factualVerification: 0.8,
            sourceCredibility: 0.7,
            modelConfidence: 0.8,
          },
        }),
      }));
      expect(result.action).toBe(Decision.REJECT);
      expect(result.ruleApplied).toBe('RULE_HIGH_MANIPULATION');
    });
  });

  // ── 11. Constants ────────────────────────────────────────────

  describe('Constants', () => {
    it('should have correct thresholds', () => {
      expect(AUTO_PUBLISH_THRESHOLD).toBe(60);
      expect(AUTO_REJECT_THRESHOLD).toBe(20);
      expect(REVIEW_THRESHOLD).toBe(40);
    });

    it('should have all decision types', () => {
      expect(Decision.PUBLISH).toBe('PUBLISH');
      expect(Decision.REJECT).toBe('REJECT');
      expect(Decision.REVIEW_REQUIRED).toBe('REVIEW_REQUIRED');
      expect(Decision.ESCALATE).toBe('ESCALATE');
    });

    it('should have valid version string', () => {
      expect(DECISION_VERSION).toMatch(/^nexora-moderation-v\d+\.\d+\.\d+$/);
    });

    it('should have rules defined', () => {
      expect(RULES.confirmedFalseForcesReject).toBe(true);
      expect(RULES.highManipulationThreshold).toBe(0.7);
      expect(RULES.highMisinfoThreshold).toBe(0.7);
      expect(RULES.lowConfidenceThreshold).toBe(0.3);
    });
  });

  // ── 12. Decision Return Shape ────────────────────────────────

  describe('Decision return shape', () => {
    it('should return all required fields', () => {
      const result = evaluateDecision(createPipelineResult());
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('ruleApplied');
      expect(result).toHaveProperty('shouldPublish');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('version');
    });

    it('should have timestamp as Date', () => {
      const result = evaluateDecision(createPipelineResult());
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
});
