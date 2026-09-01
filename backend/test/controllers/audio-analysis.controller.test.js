/**
 * Audio Analysis Controller Tests
 * ================================
 * Tests for POST /api/v1/content/analyze-audio
 *
 * Covers:
 *   1. Valid audio URL — successful analysis flow
 *   2. Unsupported format — proper error response
 *   3. Corrupted audio — graceful failure handling
 *   4. Validation — missing/invalid parameters
 *   5. AI service unavailability — 503 response
 *   6. Duplicate detection — cached response
 *
 * Run with: npm test -- --testPathPattern=audio-analysis
 */

// ─── Mocks ────────────────────────────────────────────────────────

// Mock axios to avoid real HTTP calls
jest.mock('axios');
const axios = require('axios');

// Mock the error middleware
jest.mock('../../src/middleware/error.middleware', () => ({
  ApiError: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}), { virtual: true });

// Mock the AudioAnalysis model
jest.mock('../../src/models/audio-analysis.model', () => {
  const mockSave = jest.fn();
  const chainableQuery = (resolvedValue) => {
    const sortFn = jest.fn().mockResolvedValue(resolvedValue);
    return { sort: sortFn };
  };
  const MockAudioAnalysis = function (data) {
    Object.assign(this, data);
    this._id = 'mock_audio_id_123';
    this.save = mockSave;
  };
  MockAudioAnalysis.create = jest.fn();
  MockAudioAnalysis.findOne = jest.fn((query) => chainableQuery(null));
  return MockAudioAnalysis;
}, { virtual: true });

// Mock the Post model
jest.mock('../../src/models/post.model', () => {
  const MockPost = function (data) {
    Object.assign(this, data);
  };
  MockPost.findById = jest.fn();
  return MockPost;
}, { virtual: true });

const AudioAnalysis = require('../../src/models/audio-analysis.model');
const Post = require('../../src/models/post.model');

// ─── Import the controller ────────────────────────────────────────

const {
  analyzeAudioDirect,
  getAnalysisByPostId,
} = require('../../src/controllers/v1/audio-analysis.controller');

// ─── Helper: create mock req/res/next ────────────────────────────

function mockReqResNext(body = {}) {
  const req = { body, params: {} };
  const res = {
    statusCode: null,
    responseData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.responseData = data;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Audio Analysis Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset findOne to return a chainable query with sort() that resolves to null
    const chainableQuery = (resolvedValue) => {
      const sortFn = jest.fn().mockResolvedValue(resolvedValue);
      return { sort: sortFn };
    };
    AudioAnalysis.findOne.mockImplementation((query) => chainableQuery(null));
  });

  // ── Validation Tests ──────────────────────────────────────────

  describe('Validation', () => {
    it('should reject empty request body', async () => {
      const { req, res, next } = mockReqResNext({});

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('mediaUrl is required'),
        })
      );
    });

    it('should reject non-string mediaUrl', async () => {
      const { req, res, next } = mockReqResNext({
        mediaUrl: 123,
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
        })
      );
    });

    it('should reject non-HTTP mediaUrl', async () => {
      const { req, res, next } = mockReqResNext({
        mediaUrl: 'ftp://example.com/audio.mp3',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('mediaUrl must be a valid HTTP'),
        })
      );
    });

    it('should reject missing postId', async () => {
      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/audio.mp3',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('postId is required'),
        })
      );
    });

    it('should reject empty postId', async () => {
      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/audio.mp3',
        postId: '   ',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
        })
      );
    });
  });

  // ── Valid Audio Analysis ──────────────────────────────────────

  describe('Valid audio analysis', () => {
    const validBody = {
      mediaUrl: 'https://example.com/test-audio.mp3',
      postId: '507f1f77bcf86cd799439011',
    };

    const mockAiResponse = {
      data: {
        success: true,
        postId: '507f1f77bcf86cd799439011',
        preprocessing: {
          sampleRate: 44100,
          duration: 30.5,
          channels: 1,
          format: 'MP3',
          fileSize: 1024000,
          bitDepth: 16,
        },
        syntheticSpeechProbability: 0.15,
        manipulationProbability: 0.08,
        spectralFeatures: {
          centroidMean: 2500.5,
          centroidStd: 500.2,
          bandwidthMean: 1800.3,
          bandwidthStd: 300.1,
          rolloffMean: 4500.0,
          rolloffStd: 800.0,
          flatnessMean: 0.05,
          flatnessStd: 0.02,
          zeroCrossingRate: 0.08,
        },
        melSpectrogramStats: {
          energyMean: -20.5,
          energyStd: 8.3,
          peakFrequency: 440.0,
          spectralContrast: 25.0,
          frequencyRange: 8000.0,
        },
        segments: [
          {
            startTime: 0.0,
            endTime: 5.0,
            syntheticScore: 0.1,
            manipulationScore: 0.05,
            spectralAnomaly: 0.075,
          },
          {
            startTime: 5.0,
            endTime: 10.0,
            syntheticScore: 0.2,
            manipulationScore: 0.1,
            spectralAnomaly: 0.15,
          },
        ],
        confidence: 0.75,
        modelVersion: 'nexora-audio-v1.0.0',
        processingTimeMs: 1500,
        errors: [],
      },
    };

    it('should return successful analysis result', async () => {
      // No existing analysis — findOne returns null via sort
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      AudioAnalysis.create.mockResolvedValue({
        _id: 'mock_id_123',
        post: '507f1f77bcf86cd799439011',
        ...validBody,
        ...mockAiResponse.data,
      });
      axios.post.mockResolvedValue(mockAiResponse);

      const { req, res, next } = mockReqResNext(validBody);
      await analyzeAudioDirect(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.responseData.success).toBe(true);
      expect(res.responseData.analysis).toBeDefined();
      expect(res.responseData.analysis.syntheticSpeechProbability).toBe(0.15);
      expect(res.responseData.analysis.manipulationProbability).toBe(0.08);
      expect(res.responseData.analysis.confidence).toBe(0.75);
      expect(res.responseData.analysis.modelVersion).toBe('nexora-audio-v1.0.0');
      expect(res.responseData.analysis.finalScore).toBeDefined();
      expect(typeof res.responseData.analysis.finalScore).toBe('number');
    });

    it('should call AI service with correct parameters', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      AudioAnalysis.create.mockResolvedValue({ _id: 'mock_id' });
      axios.post.mockResolvedValue(mockAiResponse);

      const { req, res, next } = mockReqResNext(validBody);
      await analyzeAudioDirect(req, res, next);

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/analyze/audio'),
        {
          mediaUrl: validBody.mediaUrl,
          postId: validBody.postId,
        },
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    it('should compute finalScore from probabilities', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      AudioAnalysis.create.mockResolvedValue({ _id: 'mock_id' });
      axios.post.mockResolvedValue(mockAiResponse);

      const { req, res, next } = mockReqResNext(validBody);
      await analyzeAudioDirect(req, res, next);

      const { finalScore } = res.responseData.analysis;
      // syntheticFactor = 1 - 0.15 = 0.85
      // manipulationFactor = 1 - 0.08 = 0.92
      // confidenceFactor = 0.75
      // finalScore = round((0.85*0.35 + 0.92*0.35 + 0.75*0.30) * 100)
      // = round((0.2975 + 0.322 + 0.225) * 100) = round(84.45) = 84
      expect(finalScore).toBe(84);
    });

    it('should store results in MongoDB', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      AudioAnalysis.create.mockResolvedValue({ _id: 'mock_id' });
      axios.post.mockResolvedValue(mockAiResponse);

      const { req, res, next } = mockReqResNext(validBody);
      await analyzeAudioDirect(req, res, next);

      expect(AudioAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          post: validBody.postId,
          mediaUrl: validBody.mediaUrl,
          syntheticSpeechProbability: 0.15,
          manipulationProbability: 0.08,
          confidence: 0.75,
          modelVersion: 'nexora-audio-v1.0.0',
        })
      );
    });
  });

  // ── Unsupported Format ────────────────────────────────────────

  describe('Unsupported format error handling', () => {
    it('should handle AI service 422 error for invalid audio format', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      axios.post.mockRejectedValue({
        response: {
          status: 422,
          data: { detail: 'Invalid audio: Cannot read audio file' },
        },
      });

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/document.pdf',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          message: expect.stringContaining('AI service error'),
        })
      );
    });
  });

  // ── Corrupted Audio ───────────────────────────────────────────

  describe('Corrupted audio error handling', () => {
    it('should handle AI service 422 error for corrupted audio', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      axios.post.mockRejectedValue({
        response: {
          status: 422,
          data: { detail: 'Invalid audio: Cannot read audio file: not a valid WAVE file' },
        },
      });

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/corrupted.wav',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
        })
      );
    });

    it('should handle AI service 500 error for processing failure', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      axios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { detail: 'Audio analysis failed: segfault in processing' },
        },
      });

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/broken.mp3',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });
  });

  // ── AI Service Unavailability ─────────────────────────────────

  describe('AI service unavailability', () => {
    it('should return 503 when AI service is not running', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/audio.mp3',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('not available'),
        })
      );
    });

    it('should return 504 when AI service times out', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));
      axios.post.mockRejectedValue({ code: 'ECONNABORTED' });

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/long-audio.mp3',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 504,
          message: expect.stringContaining('timed out'),
        })
      );
    });
  });

  // ── Duplicate Detection ───────────────────────────────────────

  describe('Duplicate detection', () => {
    it('should return cached result if analysis already exists', async () => {
      const existingAnalysis = {
        _id: 'existing_id',
        post: '507f1f77bcf86cd799439011',
        mediaUrl: 'https://example.com/audio.mp3',
        syntheticSpeechProbability: 0.15,
        manipulationProbability: 0.08,
        confidence: 0.75,
        modelVersion: 'nexora-audio-v1.0.0',
        segments: [],
        spectralFeatures: {},
        melSpectrogramStats: {},
        preprocessing: {},
        processingTimeMs: 1000,
        errors: [],
        createdAt: new Date(),
      };

      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(existingAnalysis) }));

      const { req, res, next } = mockReqResNext({
        mediaUrl: 'https://example.com/audio.mp3',
        postId: '507f1f77bcf86cd799439011',
      });

      await analyzeAudioDirect(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.responseData.cached).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  // ── GET /analyze-audio/:postId ────────────────────────────────

  describe('getAnalysisByPostId', () => {
    it('should return 404 for non-existent postId', async () => {
      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }));

      const req = { params: { postId: '507f1f77bcf86cd799439011' } };
      const res = {
        statusCode: null,
        responseData: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.responseData = data; },
      };
      const next = jest.fn();

      await getAnalysisByPostId(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.responseData.success).toBe(false);
    });

    it('should return analysis results for valid postId', async () => {
      const mockAnalysis = {
        _id: 'mock_id',
        post: '507f1f77bcf86cd799439011',
        mediaUrl: 'https://example.com/audio.mp3',
        syntheticSpeechProbability: 0.15,
        manipulationProbability: 0.08,
        confidence: 0.75,
        modelVersion: 'nexora-audio-v1.0.0',
        segments: [],
        spectralFeatures: {},
        melSpectrogramStats: {},
        preprocessing: {},
        processingTimeMs: 1000,
        errors: [],
        createdAt: new Date(),
      };

      AudioAnalysis.findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(mockAnalysis) }));

      const req = { params: { postId: '507f1f77bcf86cd799439011' } };
      const res = {
        statusCode: null,
        responseData: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.responseData = data; },
      };
      const next = jest.fn();

      await getAnalysisByPostId(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.responseData.success).toBe(true);
      expect(res.responseData.analysis.syntheticSpeechProbability).toBe(0.15);
    });

    it('should reject invalid postId format', async () => {
      const req = { params: { postId: 'not-a-valid-id' } };
      const res = {
        statusCode: null,
        responseData: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.responseData = data; },
      };
      const next = jest.fn();

      await getAnalysisByPostId(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('Invalid postId'),
        })
      );
    });
  });
});
