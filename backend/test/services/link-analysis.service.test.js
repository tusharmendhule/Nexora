/**
 * Link Analysis — trust-score input scoring
 * =========================================================================
 * Covers the two inputs that feed most of a link post's trust score:
 *
 *   1. computeSourceCredibility  — publisher reputation
 *   2. estimateMisinformationProbability — authenticity (1 - probability)
 *
 * Both previously returned near-constants for real news (0.65 for essentially
 * every domain, and a keyword heuristic starting from a fabricated 0.3
 * baseline), which collapsed every trust score into a narrow band.
 */

const linkAnalysis = require('../../src/services/link-analysis.service');

const hostnameUrl = (hostname) => new URL(`https://${hostname}/article`);

describe('link-analysis: source credibility', () => {
  it('scores news agencies of record at the top tier', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('www.reuters.com'))).toBe(0.95);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('apnews.com'))).toBe(0.95);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('bbc.co.uk'))).toBe(0.95);
  });

  it('scores established outlets below the agencies but above unrecognised', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('theguardian.com'))).toBe(0.85);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('nytimes.com'))).toBe(0.85);
  });

  it('resolves a subdomain to its publisher', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('edition.cnn.com'))).toBe(0.85);
    expect(
      linkAnalysis.computeSourceCredibility(hostnameUrl('timesofindia.indiatimes.com'))
    ).toBe(0.85);
  });

  it('never credits a lookalike domain', () => {
    // Walking up the hostname only removes leading labels, so a domain that
    // merely ends in a known publisher's name must not inherit its reputation.
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('notreuters.com'))).toBe(0.5);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('reuters.com.evil.example'))).toBe(0.5);
  });

  it('recognises official and academic origins by rule', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('nih.gov'))).toBe(0.9);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('gov.uk'))).toBe(0.9);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('stanford.edu'))).toBe(0.9);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('arxiv.org'))).toBe(0.9);
  });

  it('downgrades link shorteners and suspicious patterns', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('bit.ly'))).toBe(0.15);
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('some-site.xyz'))).toBe(0.15);
  });

  it('scores an unrecognised publisher neutrally rather than fabricating a value', () => {
    expect(linkAnalysis.computeSourceCredibility(hostnameUrl('unknown-outlet.example'))).toBe(0.5);
    expect(linkAnalysis.computeSourceCredibility({})).toBe(0.5);
  });

  it('produces real variation across real publishers', () => {
    const scores = [
      'reuters.com',
      'theguardian.com',
      'hindustantimes.com',
      'nih.gov',
      'some-blog.example',
    ].map((h) => linkAnalysis.computeSourceCredibility(hostnameUrl(h)));

    expect(new Set(scores).size).toBeGreaterThan(2);
  });
});

describe('link-analysis: misinformation probability', () => {
  it('uses the confidence-weighted mean of the model per-claim assessments', () => {
    const claims = [
      { text: 'a', misinformationProbability: 0.0, confidence: 1 },
      { text: 'b', misinformationProbability: 0.4, confidence: 0.5 },
    ];
    // (0.0*1 + 0.4*0.5) / 1.5 = 0.1333...
    const result = linkAnalysis.estimateMisinformationProbability('text', claims, 0.95, {
      modelBacked: true,
    });

    expect(result).toBeCloseTo(0.1333, 3);
  });

  it('treats a claim with no confidence as unit weight', () => {
    const claims = [
      { text: 'a', misinformationProbability: 0.2, confidence: 0 },
      { text: 'b', misinformationProbability: 0.6, confidence: 0 },
    ];
    const result = linkAnalysis.estimateMisinformationProbability('text', claims, 0.95, {
      modelBacked: true,
    });

    expect(result).toBeCloseTo(0.4, 3);
  });

  it('ignores the model path when the model produced nothing', () => {
    // Heuristic-extracted claims carry no model assessment, so they must not be
    // read as "the model says 0".
    const result = linkAnalysis.estimateMisinformationProbability('plain factual sentence', [], 0.95, {
      modelBacked: true,
    });

    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(0.2);
  });

  it('does not assume a baseline probability when no indicator is present', () => {
    const clean =
      'The four astronauts splashed down off the coast of California on Friday night.';
    const result = linkAnalysis.estimateMisinformationProbability(clean, [], 0.95);

    // Previously a fabricated 0.3 baseline dominated this path.
    expect(result).toBeLessThan(0.1);
  });

  it('still raises the score for genuine misinformation indicators', () => {
    const sensational =
      'SHOCKING!!! You will not believe this secret cure they dont want you to know about!!! 100% guaranteed miracle.';
    const score = linkAnalysis.estimateMisinformationProbability(sensational, [], 0.5);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('penalises an untrustworthy publisher independently of the copy', () => {
    const text = 'A plain sentence with no indicators at all.';
    const trusted = linkAnalysis.estimateMisinformationProbability(text, [], 0.95);
    const untrusted = linkAnalysis.estimateMisinformationProbability(text, [], 0.15);

    expect(untrusted).toBeGreaterThan(trusted);
  });

  it('always returns a value within 0..1', () => {
    const extreme = '!!!! '.repeat(50) + 'SHOCKING SECRET 12345';
    const low = linkAnalysis.estimateMisinformationProbability(extreme, [], 0.0);
    const high = linkAnalysis.estimateMisinformationProbability('', [], 1.0);

    [low, high].forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });
});
