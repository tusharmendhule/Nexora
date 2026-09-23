/**
 * Fact-Check Cache Tests (Module 13)
 * ==================================
 * Regression coverage for the cache read AND write paths of `factCheckClaim`.
 *
 * The cache stores an array of claim entries (`[{ factCheckRatings: [...] }]`).
 * Two defects made cached verdicts diverge from fresh API verdicts:
 *   1. Reading used `cached.factCheckRatings` on the array, so every cache hit
 *      was reported as NO_EVIDENCE with zero reviews.
 *   2. Writing kept only the first matched claim's reviews, dropping the rest
 *      of the evidence (a consensus could collapse to UNKNOWN on the next read).
 *
 * Covers:
 *   1. A cached FALSE verdict is returned as VERIFIED_FALSE with its reviews
 *   2. Cached flattened reviews keep their publisher and rating
 *   3. A cached "no results" entry still yields NO_EVIDENCE
 *   4. Cached reviews are relevance-filtered like fresh API results
 *   5. Every matched claim from the API is cached
 *   6. A cache hit never triggers an outbound API request
 *
 * Run with: npm test -- --testPathPatterns=fact-check-cache
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('axios');

// Mock the cache model (avoid real MongoDB calls).
jest.mock('../../src/models/fact-check-cache.model', () => {
  const mockFindOne = jest.fn();
  const mockFindOneAndUpdate = jest.fn();
  return {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    __mockFindOne: mockFindOne,
    __mockFindOneAndUpdate: mockFindOneAndUpdate,
  };
});

const axios = require('axios');
const FactCheckCache = require('../../src/models/fact-check-cache.model');

// The service snapshots the API key when the module is first loaded, so provide
// one just for that load and then remove it again. Leaving it set would leak
// into other test files sharing this Jest worker and send them to the network.
process.env.GOOGLE_FACT_CHECK_API_KEY = 'test-key';
const { factCheckClaim } = require('../../src/services/fact-check.service');
delete process.env.GOOGLE_FACT_CHECK_API_KEY;

// ─── Fixtures ─────────────────────────────────────────────────────────

/** A cache document as stored by `setCachedResult`: claimResults is an ARRAY. */
function cacheDoc(factCheckRatings) {
  return {
    queryText: 'key',
    claimResults: [{ factCheckRatings }],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

/** One Google ClaimReview object as returned by the live API. */
const API_REVIEW = {
  publisher: { name: 'FactCheck.org', site: 'factcheck.org' },
  url: 'https://www.factcheck.org/example',
  title: 'Vaccines and autism',
  reviewDate: '2025-01-10T00:00:00Z',
  textualRating: 'False',
  languageCode: 'en',
};

describe('factCheckClaim — cache read path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FactCheckCache.findOne.mockResolvedValue(null);
    FactCheckCache.findOneAndUpdate.mockResolvedValue({});
  });

  it('returns the cached FALSE verdict instead of NO_EVIDENCE', async () => {
    FactCheckCache.findOne.mockResolvedValue(
      cacheDoc([
        {
          publisherName: 'FactCheck.org',
          publisherSite: 'factcheck.org',
          url: 'https://www.factcheck.org/example',
          title: 'Vaccines and autism',
          rating: 'False',
          claimText: 'Vaccines cause autism in children',
          relevanceScore: 0.6,
        },
      ])
    );

    const result = await factCheckClaim('Vaccines cause autism in children');

    expect(result.source).toBe('cache');
    expect(result.status).toBe('VERIFIED_FALSE');
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].publisher.name).toBe('FactCheck.org');
    expect(result.reviews[0].publisher.site).toBe('factcheck.org');
    expect(result.reviews[0].textualRating).toBe('False');
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('still reports NO_EVIDENCE for a cached empty result', async () => {
    FactCheckCache.findOne.mockResolvedValue(cacheDoc([]));

    const result = await factCheckClaim('Some claim with no fact-check coverage');

    expect(result.source).toBe('cache');
    expect(result.status).toBe('NO_EVIDENCE');
    expect(result.reviews).toHaveLength(0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('applies the relevance filter to cached reviews', async () => {
    FactCheckCache.findOne.mockResolvedValue(
      cacheDoc([
        {
          publisherName: 'Snopes',
          publisherSite: 'snopes.com',
          rating: 'False',
          claimText: 'A completely unrelated claim about the economy',
          relevanceScore: 0.02, // below MIN_RELEVANCE (0.15)
        },
        {
          publisherName: 'Full Fact',
          publisherSite: 'fullfact.org',
          rating: 'False',
          claimText: 'Vaccines cause autism in children',
          relevanceScore: 0.5,
        },
      ])
    );

    const result = await factCheckClaim('Vaccines cause autism in children');

    expect(result.source).toBe('cache');
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].publisher.name).toBe('Full Fact');
    expect(result.status).toBe('VERIFIED_FALSE');
  });
});

describe('factCheckClaim — cache write path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FactCheckCache.findOne.mockResolvedValue(null);
    FactCheckCache.findOneAndUpdate.mockResolvedValue({});
  });

  it('caches every matched claim so a later read sees the full consensus', async () => {
    axios.get.mockResolvedValue({
      data: {
        claims: [
          {
            text: 'Vaccines cause autism in children',
            claimant: 'social post',
            claimReview: [API_REVIEW],
          },
          {
            text: 'Vaccines cause autism',
            claimant: 'blog post',
            claimReview: [
              {
                ...API_REVIEW,
                publisher: { name: 'AFP Fact Check', site: 'afp.com' },
                textualRating: 'False',
              },
            ],
          },
        ],
      },
    });

    const fresh = await factCheckClaim('Vaccines cause autism in children');

    expect(fresh.source).toBe('api');
    expect(fresh.status).toBe('VERIFIED_FALSE');

    // Both matched claims must be persisted, not just the first one.
    expect(FactCheckCache.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = FactCheckCache.findOneAndUpdate.mock.calls[0];
    expect(update.claimResults).toHaveLength(2);
    expect(update.claimResults[0].factCheckRatings[0].publisherName).toBe('FactCheck.org');
    expect(update.claimResults[1].factCheckRatings[0].publisherName).toBe('AFP Fact Check');
  });

  it('caches an empty result set when the API finds nothing', async () => {
    axios.get.mockResolvedValue({ data: { claims: [] } });

    const result = await factCheckClaim('A claim nobody has fact-checked');

    expect(result.status).toBe('NO_EVIDENCE');
    expect(result.source).toBe('api');

    const [, update] = FactCheckCache.findOneAndUpdate.mock.calls[0];
    expect(update.claimResults).toEqual([]);
  });
});
