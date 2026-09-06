/**
 * Gemini Analysis Service Tests
 * ==============================
 * Tests for the Gemini analysis service with mocked API calls.
 *
 * Run with: npm test -- --testPathPatterns=gemini-analysis
 */

// ─── Mock axios for Gemini API calls ───────────────────────────────────

const mockAxiosPost = jest.fn();

jest.mock('axios', () => {
  return {
    __esModule: true,
    default: {
      post: mockAxiosPost,
    },
    post: mockAxiosPost,
  };
});

// ─── Import after mocking ───────────────────────────────────────────────

const {
  analyzeWithGemini,
  extractClaimsWithGemini,
  generateExplanation,
  GeminiAnalysisStatus,
  getAnalysisStatus,
  acquireLock,
  releaseLock,
  cleanupStaleLocks,
  GEMINI_MODEL,
} = require('../../src/services/gemini-analysis.service');

describe('Gemini Analysis Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockReset();
    cleanupStaleLocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  describe('analyzeWithGemini', () => {
    it('should return error when GEMINI_API_KEY is not configured', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await analyzeWithGemini('Test text');

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GEMINI_API_KEY is not configured');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should successfully analyze content with Gemini', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  contentType: 'FACTUAL',
                  claims: ['The Earth orbits the Sun'],
                  opinionProbability: 0.1,
                  satireProbability: 0.02,
                  editedProbability: 0.05,
                  contextConcerns: [],
                  confidence: 0.91,
                  analysis: 'Factual content with verifiable claims.',
                }),
              }],
            },
          }],
        },
      };

      mockAxiosPost.mockResolvedValue(mockResponse);

      const result = await analyzeWithGemini('The Earth orbits the Sun at 107,000 km/h.');

      expect(result.status).toBe('COMPLETED');
      expect(result.result).toBeDefined();
      expect(result.result.contentType).toBe('FACTUAL');
      expect(result.result.claims).toContain('The Earth orbits the Sun');
      expect(result.result.opinionProbability).toBe(0.1);
      expect(result.result.satireProbability).toBe(0.02);
      expect(result.result.confidence).toBe(0.91);
      expect(result.result.provider).toBe('GEMINI');
      expect(result.result.modelVersion).toBe(GEMINI_MODEL);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'This is not JSON text',
              }],
            },
          }],
        },
      };

      mockAxiosPost.mockResolvedValue(mockResponse);

      const result = await analyzeWithGemini('Test text');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBe('UNKNOWN');
    });

    it('should handle Gemini API failure', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Network error'));

      const result = await analyzeWithGemini('Test text');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Network error');
      expect(result.errorCode).toBe('UNKNOWN');
      expect(result.provider).toBe('GEMINI');
    });

    it('should handle rate limiting', async () => {
      mockAxiosPost.mockRejectedValue({ response: { status: 429 } });

      const result = await analyzeWithGemini('Test text');

      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('RATE_LIMITED');
    });

    it('should prevent duplicate analysis for the same post', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({ contentType: 'FACTUAL', claims: [], confidence: 0.8 }),
              }],
            },
          }],
        },
      };
      mockAxiosPost.mockResolvedValue(mockResponse);

      const postId = 'dup_post_id';

      // First call acquires the lock and completes
      const first = await analyzeWithGemini('Test text', postId);
      expect(first.status).toBe('COMPLETED');

      // Second call returns the cached result
      const second = await analyzeWithGemini('Test text', postId);
      expect(second.status).toBe('CACHED');
      expect(second.result).toBeDefined();
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractClaimsWithGemini', () => {
    it('should extract claims from text', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  {
                    text: 'The Earth orbits the Sun',
                    subject: 'Earth',
                    predicate: 'orbits',
                    object: 'Sun',
                    canVerify: true,
                  },
                  {
                    text: 'Orbital speed is 107,000 km/h',
                    subject: 'Orbital speed',
                    predicate: 'is',
                    object: '107,000 km/h',
                    canVerify: true,
                  },
                ]),
              }],
            },
          }],
        },
      };

      mockAxiosPost.mockResolvedValue(mockResponse);

      const result = await extractClaimsWithGemini('The Earth orbits the Sun at 107,000 km/h.');

      expect(result.status).toBe('COMPLETED');
      expect(result.claims).toHaveLength(2);
      expect(result.claims[0].text).toBe('The Earth orbits the Sun');
      expect(result.claims[0].source).toBe('GEMINI');
      expect(result.claims[1].text).toBe('Orbital speed is 107,000 km/h');
      expect(result.claims[1].source).toBe('GEMINI');
    });

    it('should handle API failures gracefully', async () => {
      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await extractClaimsWithGemini('Test text');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('API error');
      expect(result.provider).toBe('GEMINI');
    });
  });

  describe('generateExplanation', () => {
    it('should generate explanation from evidence', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'The content was rated Green because Google Fact Check evidence supports the claim.',
              }],
            },
          }],
        },
      };

      mockAxiosPost.mockResolvedValue(mockResponse);

      const explanation = await generateExplanation({
        label: 'Green',
        score: 85,
        contentType: 'text',
        geminiAnalysis: {
          analysis: 'Factual content',
          confidence: 0.9,
        },
        factCheckResults: [
          { status: 'VERIFIED_TRUE', claimText: 'The Earth orbits the Sun' },
        ],
        evidence: [
          { source: 'Snopes', verdict: 'supports' },
        ],
      });

      expect(explanation).toBeDefined();
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('Google Fact Check');
    });

    it('should handle explanation generation failure gracefully', async () => {
      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const explanation = await generateExplanation({
        label: 'Red',
        score: 20,
        contentType: 'text',
        geminiAnalysis: null,
        factCheckResults: [],
        evidence: [],
      });

      expect(explanation).toContain('Explanation generation failed');
    });
  });

  describe('Provider Lock Mechanism', () => {
    it('should acquire and release locks', () => {
      const postId = 'lock_test_post';

      // Initially no lock
      expect(getAnalysisStatus(postId)).toBeNull();

      // Acquire lock
      const acquired = acquireLock(postId, 'GEMINI');
      expect(acquired).toBe(true);
      expect(getAnalysisStatus(postId).status).toBe(GeminiAnalysisStatus.ANALYZING);

      // Cannot acquire again
      const acquiredAgain = acquireLock(postId, 'GEMINI');
      expect(acquiredAgain).toBe(false);

      // Release lock
      releaseLock(postId, GeminiAnalysisStatus.COMPLETED, { test: true });
      const statusAfterRelease = getAnalysisStatus(postId);
      expect(statusAfterRelease).toBeDefined();
      expect(statusAfterRelease.status).toBe(GeminiAnalysisStatus.COMPLETED);
      expect(statusAfterRelease.result).toEqual({ test: true });
    });

    it('should handle stale locks', () => {
      // This test verifies that cleanupStaleLocks runs without errors
      expect(() => cleanupStaleLocks()).not.toThrow();
    });
  });

  describe('Analysis Status Enum', () => {
    it('should have all required statuses', () => {
      expect(GeminiAnalysisStatus.PENDING).toBe('PENDING');
      expect(GeminiAnalysisStatus.ANALYZING).toBe('ANALYZING');
      expect(GeminiAnalysisStatus.COMPLETED).toBe('COMPLETED');
      expect(GeminiAnalysisStatus.FAILED).toBe('FAILED');
    });
  });
});