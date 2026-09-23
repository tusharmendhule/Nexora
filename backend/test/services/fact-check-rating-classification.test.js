/**
 * Fact-check rating classification
 * =========================================================================
 * Publishers return verdicts in two shapes: single words ("True", "False")
 * and narrative sentences ("Incorrect. While the UK's youth unemployment
 * rate was higher than the EU average...").
 *
 * The narrative shape previously slipped through: the fuzzy fallback tested
 * the POSITIVE substrings first, so the "correct" inside "Incorrect" matched
 * and a debunk was classified as a POSITIVE rating.
 */

const { classifyRating } = require('../../src/services/fact-check.service');

describe('fact-check: classifyRating', () => {
  describe('canonical single-word verdicts', () => {
    it.each([
      ['True', 'positive'],
      ['Mostly True', 'positive'],
      ['Correct', 'positive'],
      ['Accurate', 'positive'],
      ['False', 'negative'],
      ['Incorrect', 'negative'],
      ['Pants on fire', 'negative'],
      ['Misleading', 'negative'],
      ['Debunked', 'negative'],
    ])('classifies %p as %s', (rating, expected) => {
      expect(classifyRating(rating)).toBe(expected);
    });
  });

  describe('narrative verdicts (Full Fact / Africa Check / PA Media style)', () => {
    it('does not read "Incorrect" as a positive rating', () => {
      // The word "correct" appears inside "incorrect"; without word boundaries
      // this returned 'positive'.
      const rating =
        "Incorrect. While the UK's youth unemployment rate was higher than the EU average in the third quarter of 2025, several individual European countries had higher rates.";
      expect(classifyRating(rating)).toBe('negative');
    });

    it('classifies "This is incorrect..." as negative', () => {
      const rating =
        'This is incorrect. At the time the claim was made, the number of deaths reported was 169.';
      expect(classifyRating(rating)).toBe('negative');
    });

    it('classifies "This is not correct..." as negative', () => {
      const rating = 'This is not correct. Deaths were 14% higher than the average across the past five years.';
      expect(classifyRating(rating)).toBe('negative');
    });

    it('classifies a "missing context" narrative as mixed, not positive', () => {
      const rating =
        'Missing context: In cash terms spending rose 64%, but real-term spending per pupil declined by about 9%.';
      expect(classifyRating(rating)).toBe('mixed');
    });

    it('still classifies an endorsement with a caveat as positive', () => {
      const rating =
        "This is true, but it's also already the case that the UK spends more on health and disability benefits than it does on defence.";
      expect(classifyRating(rating)).toBe('positive');
    });
  });

  describe('robustness', () => {
    it('returns unknown for missing or empty ratings', () => {
      expect(classifyRating(undefined)).toBe('unknown');
      expect(classifyRating(null)).toBe('unknown');
      expect(classifyRating('')).toBe('unknown');
      expect(classifyRating('We looked into this')).toBe('unknown');
    });

    it('is case-insensitive and tolerates surrounding whitespace', () => {
      expect(classifyRating('  TRUE  ')).toBe('positive');
      expect(classifyRating('  INCORRECT.  ')).toBe('negative');
    });

    it('never classifies a negative narrative as positive', () => {
      const negatives = [
        'Incorrect. The figure was revised.',
        'This is inaccurate.',
        'Not true. No such order was issued.',
        'Fabricated. No evidence supports it.',
      ];

      negatives.forEach((rating) => {
        expect(classifyRating(rating)).not.toBe('positive');
      });
    });
  });
});
