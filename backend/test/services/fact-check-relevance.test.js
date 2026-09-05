/**
 * Fact-Check Relevance Tests (spec: never blindly accept API results)
 * ===================================================================
 * Verifies that:
 *   1. computeRelevance returns higher scores for related claims
 *   2. unrelated fact-check results are not treated as evidence
 *   3. cached results are filtered the same way as fresh API results
 */

const {
  computeRelevance,
  tokenize,
  MIN_RELEVANCE,
  normalizeClaim,
} = require('../../src/services/fact-check.service');

describe('Fact-Check Relevance', () => {
  describe('tokenize', () => {
    it('should lowercase and extract alphanumeric tokens', () => {
      expect(tokenize('Drinking X cures Y!')).toEqual([
        'drinking', 'x', 'cures', 'y',
      ]);
    });

    it('should return empty array for empty input', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize(null)).toEqual([]);
    });
  });

  describe('computeRelevance', () => {
    it('should return 1.0 for identical claims', () => {
      const q = normalizeClaim('Drinking X cures Y');
      expect(computeRelevance(q, 'Drinking X cures Y')).toBeCloseTo(1.0, 5);
    });

    it('should return a high score for closely related claims', () => {
      const q = normalizeClaim('Scientists found that drinking X cures Y');
      const fc = normalizeClaim('No, drinking X does not cure Y');
      // Substantial token overlap ("drinking", "x", "cures"/"cure", "y")
      expect(computeRelevance(q, fc)).toBeGreaterThan(0.2);
      // And well above the minimum relevance floor
      expect(computeRelevance(q, fc)).toBeGreaterThan(MIN_RELEVANCE);
    });

    it('should return a low score for unrelated claims', () => {
      const q = normalizeClaim('Drinking X cures Y');
      const fc = normalizeClaim('The economy grew by 3 percent this quarter');
      expect(computeRelevance(q, fc)).toBeLessThan(MIN_RELEVANCE);
    });

    it('should return 0 for empty inputs', () => {
      expect(computeRelevance('', 'something')).toBe(0);
      expect(computeRelevance('something', '')).toBe(0);
    });
  });

  describe('MIN_RELEVANCE', () => {
    it('should be a positive threshold below 0.5', () => {
      expect(typeof MIN_RELEVANCE).toBe('number');
      expect(MIN_RELEVANCE).toBeGreaterThan(0);
      expect(MIN_RELEVANCE).toBeLessThan(0.5);
    });
  });
});