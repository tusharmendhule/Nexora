/**
 * System Performance Tests (Module 24)
 * =====================================
 * Measures system performance characteristics:
 *   - API latency (middleware overhead)
 *   - AI processing time (trust score computation)
 *   - Verification time (evidence normalization)
 *   - Trust Score generation time
 *   - Failure rate under load
 *   - Memory efficiency
 *
 * NOTE: These tests measure relative performance characteristics,
 * not absolute production metrics. They verify that critical paths
 * complete within reasonable time bounds.
 *
 * Run with: npm test -- --testPathPatterns=performance
 */

const { computeTrustScore } = require('../../src/services/trust-score.service');
const { evaluateDecision } = require('../../src/services/moderation-decision.service');
const {
  normalizeEvidence,
  aggregateEvidence,
  normalizeAIDetectorResults,
  normalizeFactCheckResults,
} = require('../../src/services/evidence-normalization.service');
const { classifyContentType, pipelineForContentType } = require('../../src/services/content-router.service');

// ─── Helpers ──────────────────────────────────────────────────────────

function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;
  return { result, durationMs };
}

async function measureTimeAsync(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;
  return { result, durationMs };
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('System Performance', () => {
  // ─── 1. Trust Score Computation Latency ───────────────────────────

  describe('Trust Score computation latency', () => {
    it('should compute trust score in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        return computeTrustScore({
          authenticityScore: 0.85,
          factualVerificationScore: 0.80,
          sourceCredibilityScore: 0.75,
          modelConfidenceScore: 0.90,
        });
      });

      console.log(`  Trust Score computation: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1); // Should be sub-millisecond
    });

    it('should compute 1000 trust scores in under 100ms', () => {
      const { durationMs } = measureTime(() => {
        const results = [];
        for (let i = 0; i < 1000; i++) {
          results.push(computeTrustScore({
            authenticityScore: Math.random(),
            factualVerificationScore: Math.random(),
            sourceCredibilityScore: Math.random(),
            modelConfidenceScore: Math.random(),
          }));
        }
        return results;
      });

      console.log(`  1000 trust scores: ${durationMs.toFixed(2)}ms (${(durationMs / 1000).toFixed(4)}ms avg)`);
      expect(durationMs).toBeLessThan(100);
    });

    it('should compute trust score with rules in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        return computeTrustScore({
          authenticityScore: 0.90,
          factualVerificationScore: 0.90,
          sourceCredibilityScore: 0.90,
          modelConfidenceScore: 0.90,
          isConfirmedFalse: true, // Triggers Rule 1
          contentType: 'satire', // Triggers Rule 3
          manipulationProbability: 0.85, // Triggers Rule 2
        });
      });

      console.log(`  Trust Score with rules: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });
  });

  // ─── 2. Moderation Decision Latency ───────────────────────────────

  describe('Moderation decision latency', () => {
    it('should evaluate decision in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        return evaluateDecision({
          trustScoreResult: { score: 75, label: 'Blue', isOverrideApplied: false },
          stageResults: {},
          contentType: 'TEXT',
          hasErrors: false,
          failedStages: [],
          reviewRequiredStages: [],
        });
      });

      console.log(`  Moderation decision: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });

    it('should evaluate 1000 decisions in under 50ms', () => {
      const { durationMs } = measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          evaluateDecision({
            trustScoreResult: { score: Math.floor(Math.random() * 100), label: 'Green', isOverrideApplied: false },
            stageResults: {},
            contentType: 'TEXT',
            hasErrors: false,
            failedStages: [],
            reviewRequiredStages: [],
          });
        }
      });

      console.log(`  1000 moderation decisions: ${durationMs.toFixed(2)}ms`);
      expect(durationMs).toBeLessThan(50);
    });
  });

  // ─── 3. Evidence Normalization Latency ─────────────────────────────

  describe('Evidence normalization latency', () => {
    it('should normalize evidence in under 10ms', async () => {
      const { durationMs } = await measureTimeAsync(async () => {
        return normalizeEvidence({
          claim: 'Test claim for performance',
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
      });

      console.log(`  Evidence normalization: ${durationMs.toFixed(2)}ms`);
      expect(durationMs).toBeLessThan(10);
    });

    it('should normalize AI detector results in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        return normalizeAIDetectorResults(
          { misinfoProbability: 0.1, confidence: 0.85, modelVersion: 'v1.0' },
          'Test claim'
        );
      });

      console.log(`  AI detector normalization: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });

    it('should normalize fact-check results in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        return normalizeFactCheckResults(
          {
            status: 'VERIFIED_TRUE',
            reviews: [{ publisher: { name: 'Snopes' }, textualRating: 'True' }],
            factualVerificationScore: 0.9,
          },
          'Test claim'
        );
      });

      console.log(`  Fact-check normalization: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });

    it('should aggregate evidence in under 1ms', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        evidenceCategory: i % 3 === 0 ? 'positive' : i % 3 === 1 ? 'negative' : 'conflicting',
        confidence: 0.5 + Math.random() * 0.4,
        sourceReliability: 0.6 + Math.random() * 0.3,
        sourceType: 'test',
        verdict: 'mixed',
      }));

      const { durationMs } = measureTime(() => {
        return aggregateEvidence(items);
      });

      console.log(`  Evidence aggregation (10 items): ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });
  });

  // ─── 4. Content Classification Latency ────────────────────────────

  describe('Content classification latency', () => {
    it('should classify content type in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        classifyContentType({ text: 'Hello', media: [{ type: 'image' }], linkUrl: 'https://example.com' });
      });

      console.log(`  Content classification: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });

    it('should map pipeline in under 1ms', () => {
      const { durationMs } = measureTime(() => {
        pipelineForContentType('IMAGE');
      });

      console.log(`  Pipeline mapping: ${durationMs.toFixed(4)}ms`);
      expect(durationMs).toBeLessThan(1);
    });
  });

  // ─── 5. Full Pipeline Latency ─────────────────────────────────────

  describe('Full pipeline latency (trust score → decision)', () => {
    it('should complete full pipeline in under 5ms', async () => {
      const { durationMs } = await measureTimeAsync(async () => {
        // Step 1: Trust score
        const trustResult = computeTrustScore({
          authenticityScore: 0.85,
          factualVerificationScore: 0.80,
          sourceCredibilityScore: 0.75,
          modelConfidenceScore: 0.90,
        });

        // Step 2: Evidence normalization
        const evidence = await normalizeEvidence({
          claim: 'Full pipeline test claim',
          postId: '507f1f77bcf86cd799439011',
          factCheckResults: {
            status: 'VERIFIED_TRUE',
            reviews: [{ publisher: { name: 'Snopes' }, textualRating: 'True' }],
          },
          aiDetectorResults: {
            misinfoProbability: 0.1,
            confidence: 0.85,
          },
        });

        // Step 3: Moderation decision
        const decision = evaluateDecision({
          trustScoreResult: trustResult,
          stageResults: { evidence: evidence },
          contentType: 'TEXT',
          hasErrors: false,
          failedStages: [],
          reviewRequiredStages: [],
        });

        return { trustResult, evidence, decision };
      });

      console.log(`  Full pipeline: ${durationMs.toFixed(2)}ms`);
      expect(durationMs).toBeLessThan(5);
    });

    it('should process 100 full pipelines in under 500ms', async () => {
      const { durationMs } = await measureTimeAsync(async () => {
        const results = [];
        for (let i = 0; i < 100; i++) {
          const trustResult = computeTrustScore({
            authenticityScore: Math.random(),
            factualVerificationScore: Math.random(),
            sourceCredibilityScore: Math.random(),
            modelConfidenceScore: Math.random(),
          });

          const decision = evaluateDecision({
            trustScoreResult: trustResult,
            stageResults: {},
            contentType: 'TEXT',
            hasErrors: false,
            failedStages: [],
            reviewRequiredStages: [],
          });

          results.push({ trustResult, decision });
        }
        return results;
      });

      console.log(`  100 full pipelines: ${durationMs.toFixed(2)}ms (${(durationMs / 100).toFixed(2)}ms avg)`);
      expect(durationMs).toBeLessThan(500);
    });
  });

  // ─── 6. Failure Rate ──────────────────────────────────────────────

  describe('Failure rate under edge cases', () => {
    it('should have 0% failure rate for valid inputs', () => {
      let failures = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        try {
          computeTrustScore({
            authenticityScore: Math.random(),
            factualVerificationScore: Math.random(),
            sourceCredibilityScore: Math.random(),
            modelConfidenceScore: Math.random(),
          });
        } catch (e) {
          failures++;
        }
      }

      console.log(`  Failure rate (random valid): ${(failures / iterations * 100).toFixed(2)}%`);
      expect(failures).toBe(0);
    });

    it('should have 0% failure rate for boundary values', () => {
      let failures = 0;
      const boundaryValues = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1.0];

      for (const a of boundaryValues) {
        for (const f of boundaryValues) {
          try {
            computeTrustScore({
              authenticityScore: a,
              factualVerificationScore: f,
              sourceCredibilityScore: 0.5,
              modelConfidenceScore: 0.5,
            });
          } catch (e) {
            failures++;
          }
        }
      }

      console.log(`  Failure rate (boundary values): ${(failures / (boundaryValues.length ** 2) * 100).toFixed(2)}%`);
      expect(failures).toBe(0);
    });

    it('should have 0% failure rate for all rule triggers', () => {
      let failures = 0;

      const ruleTriggers = [
        { isConfirmedFalse: true },
        { manipulationProbability: 0.95 },
        { contentType: 'satire' },
        { contentType: 'opinion' },
        { contentType: 'edited' },
        { contentType: 'editorial' },
        { contentType: 'parody' },
        { isDisclosedAI: true },
      ];

      for (const trigger of ruleTriggers) {
        try {
          computeTrustScore({
            authenticityScore: 0.7,
            factualVerificationScore: 0.7,
            sourceCredibilityScore: 0.7,
            modelConfidenceScore: 0.7,
            ...trigger,
          });
        } catch (e) {
          failures++;
        }
      }

      console.log(`  Failure rate (rule triggers): ${(failures / ruleTriggers.length * 100).toFixed(2)}%`);
      expect(failures).toBe(0);
    });
  });

  // ─── 7. Memory Efficiency ─────────────────────────────────────────

  describe('Memory efficiency', () => {
    it('should not leak memory over repeated computations', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Compute 10,000 trust scores
      for (let i = 0; i < 10000; i++) {
        computeTrustScore({
          authenticityScore: Math.random(),
          factualVerificationScore: Math.random(),
          sourceCredibilityScore: Math.random(),
          modelConfidenceScore: Math.random(),
        });
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDeltaMB = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`  Memory delta after 10K computations: ${memoryDeltaMB.toFixed(4)} MB`);
      // Should not grow more than 10MB for 10K simple computations
      expect(memoryDeltaMB).toBeLessThan(10);
    });
  });
});
