/**
 * Fact-check claim polarity tests
 * =========================================================================
 * A fact-check review rates the claim the publisher checked — which is not
 * always the user's claim. When the publisher checked the OPPOSITE statement,
 * applying its rating directly inverts the verdict:
 *
 *   user claim:  "Peer-reviewed studies show vaccines are safe"
 *   checked:     "No peer-reviewed studies show vaccines are safe" → False
 *
 * The second statement being false means the user's claim is supported, not
 * false. Before this was handled, true, well-established information was
 * labelled Red ("Fake, Misleading, or False Content").
 */

const {
  classifyReviewAgainstClaim,
  isNegatedClaim,
  invertRatingCategory,
  determineVerificationStatus,
  normalizeClaim,
  MIN_RELEVANCE,
  MIN_INVERTED_RELEVANCE,
} = require('../../src/services/fact-check.service');

describe('fact-check claim polarity', () => {
  describe('isNegatedClaim', () => {
    it('detects explicit negation', () => {
      expect(isNegatedClaim('No peer-reviewed studies show vaccines are safe')).toBe(true);
      expect(isNegatedClaim('5G towers do not spread coronavirus')).toBe(true);
      expect(isNegatedClaim("The vaccine doesn't cause autism")).toBe(true);
    });

    it('does not flag a plain assertion', () => {
      expect(isNegatedClaim('Peer-reviewed studies show vaccines are safe')).toBe(false);
      expect(isNegatedClaim('5G towers spread coronavirus')).toBe(false);
    });
  });

  describe('invertRatingCategory', () => {
    it('flips positive and negative verdicts', () => {
      expect(invertRatingCategory('positive')).toBe('negative');
      expect(invertRatingCategory('negative')).toBe('positive');
    });

    it('leaves mixed/unknown verdicts alone', () => {
      expect(invertRatingCategory('mixed')).toBe('mixed');
      expect(invertRatingCategory('unknown')).toBe('unknown');
    });
  });

  describe('classifyReviewAgainstClaim', () => {
    it('inverts a False rating when the checked claim is the negation', () => {
      const query = normalizeClaim(
        'Peer-reviewed studies show that vaccines are safe and effective'
      );
      const review = {
        textualRating: 'False',
        claimText:
          'No peer-reviewed studies have demonstrated the safety and efficacy of the COVID-19 vaccines',
        relevanceScore: 0.263,
      };

      const result = classifyReviewAgainstClaim(query, review);

      expect(result).not.toBeNull();
      expect(result.polarityInverted).toBe(true);
      expect(result.category).toBe('positive');
    });

    it('keeps a False rating for the same claim', () => {
      const query = normalizeClaim('5G towers spread coronavirus disease');
      const review = {
        textualRating: 'False',
        claimText: '5G towers spread coronavirus disease',
        relevanceScore: 1,
      };

      const result = classifyReviewAgainstClaim(query, review);

      expect(result.polarityInverted).toBe(false);
      expect(result.category).toBe('negative');
    });

    it('drops weak opposite-polarity matches instead of inverting them', () => {
      const query = normalizeClaim('Peer-reviewed studies show vaccines are safe');
      const review = {
        textualRating: 'False',
        claimText: 'No, the vaccine mandate for health workers is not safe',
        relevanceScore: MIN_INVERTED_RELEVANCE - 0.01,
      };

      expect(classifyReviewAgainstClaim(query, review)).toBeNull();
    });

    it('drops unrelated reviews', () => {
      const query = normalizeClaim('Drinking X cures Y');
      const review = {
        textualRating: 'False',
        claimText: 'The economy grew by 3 percent this quarter',
        relevanceScore: MIN_RELEVANCE - 0.01,
      };

      expect(classifyReviewAgainstClaim(query, review)).toBeNull();
    });

    it('aggregates a verified opposite-polarity debunk as VERIFIED_TRUE', () => {
      const query = normalizeClaim(
        'Peer-reviewed studies show that vaccines are safe and effective'
      );
      const review = classifyReviewAgainstClaim(query, {
        textualRating: 'False',
        claimText:
          'No peer-reviewed studies have demonstrated the safety and efficacy of the COVID-19 vaccines',
        relevanceScore: 0.263,
      });

      const status = determineVerificationStatus([
        { rating: review.textualRating, category: review.category },
      ]);

      expect(status).toBe('VERIFIED_TRUE');
    });
  });
});
