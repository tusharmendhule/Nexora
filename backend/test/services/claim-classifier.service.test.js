/**
 * Claim Classifier Service Tests
 * ==============================
 * Covers:
 *   1. Claim-type normalization from Python / Gemini output
 *   2. Claim-type gating: only factual claims are fact-checkable (§14)
 *   3. Claim text normalization preserves the original (§15)
 *
 * Run with: npm test -- --testPathPattern=claim-classifier
 */

const {
  ClaimType,
  normalizeClaimType,
  classifyClaim,
  classifyClaimText,
  normalizeClaimText,
  shouldFactCheckClaim,
  selectFactCheckableClaims,
} = require('../../src/services/claim-classifier.service');

describe('Claim Classifier Service', () => {
  describe('normalizeClaimType', () => {
    it('maps Python NLP claim types to normalized types', () => {
      expect(normalizeClaimType('factual claim')).toBe(ClaimType.FACTUAL_CLAIM);
      expect(normalizeClaimType('statistical claim')).toBe(ClaimType.STATISTICAL_CLAIM);
      expect(normalizeClaimType('causal claim')).toBe(ClaimType.CAUSAL_CLAIM);
      expect(normalizeClaimType('definition')).toBe(ClaimType.DEFINITION);
      expect(normalizeClaimType('expert opinion')).toBe(ClaimType.EXPERT_OPINION);
      expect(normalizeClaimType('prediction')).toBe(ClaimType.PREDICTION);
      expect(normalizeClaimType('moral claim')).toBe(ClaimType.MORAL_CLAIM);
    });

    it('returns UNKNOWN for missing or unrecognized types', () => {
      expect(normalizeClaimType(null)).toBe(ClaimType.UNKNOWN);
      expect(normalizeClaimType('something else')).toBe(ClaimType.UNKNOWN);
    });

    it('recognizes already-normalized values case-insensitively', () => {
      expect(normalizeClaimType('factual_claim')).toBe(ClaimType.FACTUAL_CLAIM);
    });
  });

  describe('classifyClaimText', () => {
    it('detects questions, opinions, moral claims, predictions and adverts', () => {
      expect(classifyClaimText('Is the earth flat?')).toBe(ClaimType.QUESTION);
      expect(classifyClaimText('I think the economy is improving')).toBe(ClaimType.OPINION);
      expect(classifyClaimText('We must ban this practice')).toBe(ClaimType.MORAL_CLAIM);
      expect(classifyClaimText('Prices will double next year')).toBe(ClaimType.PREDICTION);
      expect(classifyClaimText('Scientists say the study is flawed')).toBe(ClaimType.EXPERT_OPINION);
      expect(classifyClaimText('Click here to buy now')).toBe(ClaimType.ADVERTISEMENT);
    });

    it('leaves ordinary assertions unclassified (defaults to fact-checkable)', () => {
      expect(classifyClaimText('The bridge was built in 1975')).toBe(ClaimType.UNKNOWN);
    });
  });

  describe('normalizeClaimText', () => {
    it('strips URLs, timestamps, hashtags and ASR artifacts', () => {
      const { normalizedClaim, originalClaim, transformations } = normalizeClaimText(
        '[00:12] BREAKING: The dam was completed in 1963 https://example.com/story #news'
      );
      expect(originalClaim).toContain('https://example.com/story');
      expect(normalizedClaim).not.toContain('http');
      expect(normalizedClaim).not.toContain('#news');
      expect(normalizedClaim).not.toContain('00:12');
      expect(normalizedClaim).not.toContain('BREAKING');
      // Display casing is preserved; lowercasing happens in the fact-check
      // service's query/cache layer.
      expect(normalizedClaim).toBe('The dam was completed in 1963');
      expect(transformations).toContain('removed_url');
      expect(transformations).toContain('removed_timestamp');
    });

    it('collapses duplicated phrases and strips trailing punctuation', () => {
      const { normalizedClaim } = normalizeClaimText('The the dam was built. The the dam was built.');
      expect(normalizedClaim).toBe('The dam was built');
    });

    it('removes filler words from transcripts', () => {
      const { normalizedClaim } = normalizeClaimText('Um, the reactor, uh, was shut down');
      expect(normalizedClaim).toBe('the reactor, was shut down');
    });

    it('always preserves the original claim', () => {
      const raw = '  The claim as written.  ';
      const { originalClaim } = normalizeClaimText(raw);
      expect(originalClaim).toBe('The claim as written.');
    });

    it('handles empty or non-string input safely', () => {
      expect(normalizeClaimText('').normalizedClaim).toBe('');
      expect(normalizeClaimText(null).normalizedClaim).toBe('');
    });
  });

  describe('shouldFactCheckClaim', () => {
    it('allows factual claims', () => {
      const decision = shouldFactCheckClaim({
        text: 'The Eiffel Tower is located in Paris',
        claimType: 'factual claim',
      });
      expect(decision.factCheckable).toBe(true);
    });

    it('rejects opinion, satire and prediction claims', () => {
      expect(shouldFactCheckClaim({ text: 'This policy is clearly the best', claimType: 'opinion' }).factCheckable).toBe(false);
      expect(shouldFactCheckClaim({ text: 'The president is a lizard person', claimType: 'satire' }).factCheckable).toBe(false);
      expect(shouldFactCheckClaim({ text: 'Prices will double next year', claimType: 'prediction' }).factCheckable).toBe(false);
      expect(shouldFactCheckClaim({ text: 'We must ban cars', claimType: 'moral claim' }).factCheckable).toBe(false);
    });

    it('rejects claims that are too short to verify', () => {
      expect(shouldFactCheckClaim({ text: 'It is true' }).factCheckable).toBe(false);
    });

    it('honors an explicit canVerify=false signal from the model', () => {
      const decision = shouldFactCheckClaim({
        text: 'The bridge was completed in 1963 by the ministry',
        claimType: 'factual claim',
        canVerify: false,
      });
      expect(decision.factCheckable).toBe(false);
      expect(decision.reason).toBe('model_marked_unverifiable');
    });

    it('requires an explicit factual claim when the post is opinion/satire', () => {
      const unclassified = shouldFactCheckClaim(
        { text: 'The dam was completed in 1963 by engineers' },
        { contentType: 'SATIRE' }
      );
      expect(unclassified.factCheckable).toBe(false);

      const explicitFactual = shouldFactCheckClaim(
        { text: 'The dam was completed in 1963 by engineers', claimType: 'factual claim' },
        { contentType: 'SATIRE' }
      );
      expect(explicitFactual.factCheckable).toBe(true);
    });
  });

  describe('selectFactCheckableClaims', () => {
    it('partitions claims and preserves originals on both sides', () => {
      const claims = [
        { text: 'The vaccine was approved in 2021', claimType: 'factual claim' },
        { text: 'I think it is a bad idea to approve this', claimType: 'opinion' },
      ];

      const { factCheckable, skipped } = selectFactCheckableClaims(claims);

      expect(factCheckable).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(factCheckable[0].originalClaim).toBe('The vaccine was approved in 2021');
      expect(factCheckable[0].claimTypeNorm).toBe(ClaimType.FACTUAL_CLAIM);
      expect(skipped[0].claimTypeNorm).toBe(ClaimType.OPINION);
      expect(skipped[0].originalClaim).toContain('I think');
    });

    it('handles empty input', () => {
      const result = selectFactCheckableClaims([]);
      expect(result.factCheckable).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });
});
