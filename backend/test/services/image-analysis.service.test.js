/**
 * Image Analysis Service Tests (Module 11)
 * =========================================
 * Tests for image authenticity analysis: service calls, error handling,
 * trust score creation, and edge cases.
 *
 * Run with: npm test -- --testPathPatterns=image-analysis
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'post_1';
  };
  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    return Promise.resolve(found || null);
  });
  MockPost._reset = () => { mockPosts.length = 0; };
  MockPost._add = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };
  return MockPost;
});

jest.mock('../../src/models/image-analysis.model', () => {
  const mockAnalyses = [];
  let idCounter = 1;
  const MockImageAnalysis = function (data) {
    Object.assign(this, data);
    this._id = data._id || `img_analysis_${idCounter++}`;
    this.save = jest.fn().mockResolvedValue(this);
  };
  MockImageAnalysis.create = jest.fn().mockImplementation((data) => {
    const doc = new MockImageAnalysis(data);
    mockAnalyses.push(doc);
    return Promise.resolve(doc);
  });
  MockImageAnalysis.findOne = jest.fn().mockImplementation((filter) => {
    let found = null;
    if (filter.post) {
      found = mockAnalyses.find((a) => a.post === filter.post);
    }
    return {
      sort: jest.fn().mockResolvedValue(found),
    };
  });
  MockImageAnalysis._reset = () => { mockAnalyses.length = 0; idCounter = 1; };
  MockImageAnalysis._add = (data) => {
    const doc = new MockImageAnalysis(data);
    mockAnalyses.push(doc);
    return doc;
  };
  return MockImageAnalysis;
});

jest.mock('../../src/models/trust-score.model', () => {
  const MockTrustScore = function (data) {
    Object.assign(this, data);
    this._id = 'ts_1';
  };
  MockTrustScore.findOneAndUpdate = jest.fn().mockResolvedValue({});
  MockTrustScore._reset = () => {};
  return MockTrustScore;
});

jest.mock('../../src/models/content-job.model', () => {
  const MockContentJob = function (data) {
    Object.assign(this, data);
  };
  MockContentJob.findOne = jest.fn().mockResolvedValue(null);
  return MockContentJob;
});

// Mock axios for Python AI service calls
jest.mock('axios');
const axios = require('axios');

// ─── Imports ──────────────────────────────────────────────────────────

const Post = require('../../src/models/post.model');
const ImageAnalysis = require('../../src/models/image-analysis.model');
const TrustScore = require('../../src/models/trust-score.model');
const imageAnalysisService = require('../../src/services/image-analysis.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Image Analysis Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Post._reset();
    ImageAnalysis._reset();
    TrustScore.findOneAndUpdate.mockResolvedValue({});
  });

  // ─── analyzeImage — Happy Path ─────────────────────────────────────

  describe('analyzeImage', () => {
    it('should analyze a low-manipulation image successfully', async () => {
      Post._add({
        _id: 'post_1',
        user: 'user_1',
        media: [{ url: 'https://example.com/photo.jpg', type: 'image' }],
      });

      axios.post.mockResolvedValue({
        data: {
          success: true,
          manipulationProbability: 0.05,
          faceManipulationProbability: 0.02,
          frequencyAnomaly: 0.08,
          colorAnomaly: 0.03,
          textureAnomaly: 0.06,
          faceDetectionCount: 1,
          hasFace: true,
          preprocessing: { width: 1920, height: 1080, channels: 3, fileSize: 500000 },
          confidence: 0.85,
          modelVersion: 'nexora-image-v1.0.0',
          processingTimeMs: 1500,
          errors: [],
        },
      });

      const job = {
        _id: 'job_1',
        post: 'post_1',
        contentReference: {},
      };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('COMPLETED');
      expect(result.results.manipulationProbability).toBe(0.05);
      expect(result.results.faceManipulationProbability).toBe(0.02);
      expect(result.results.confidence).toBe(0.85);
      expect(result.modelVersion).toBe('nexora-image-v1.0.0');

      // Should call Python AI service
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/analyze/image'),
        expect.objectContaining({ mediaUrl: 'https://example.com/photo.jpg' }),
        expect.any(Object)
      );

      // Should store results
      expect(ImageAnalysis.create).toHaveBeenCalledTimes(1);

      // Should create TrustScore
      expect(TrustScore.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should analyze a high-manipulation image and flag for review', async () => {
      Post._add({
        _id: 'post_2',
        user: 'user_2',
        media: [{ url: 'https://example.com/suspect.jpg', type: 'image' }],
      });

      axios.post.mockResolvedValue({
        data: {
          success: true,
          manipulationProbability: 0.75,
          faceManipulationProbability: 0.80,
          frequencyAnomaly: 0.60,
          colorAnomaly: 0.45,
          textureAnomaly: 0.55,
          faceDetectionCount: 1,
          hasFace: true,
          preprocessing: { width: 800, height: 600, channels: 3, fileSize: 200000 },
          confidence: 0.70,
          modelVersion: 'nexora-image-v1.0.0',
          processingTimeMs: 2000,
          errors: [],
        },
      });

      const job = { _id: 'job_2', post: 'post_2', contentReference: {} };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.results.manipulationProbability).toBe(0.75);
      expect(result.results.faceManipulationProbability).toBe(0.80);
      expect(result.results.finalScore).toBeLessThan(50);
    });

    it('should handle image with no faces', async () => {
      Post._add({
        _id: 'post_3',
        user: 'user_3',
        media: [{ url: 'https://example.com/landscape.jpg', type: 'image' }],
      });

      axios.post.mockResolvedValue({
        data: {
          success: true,
          manipulationProbability: 0.02,
          faceManipulationProbability: 0.0,
          frequencyAnomaly: 0.05,
          colorAnomaly: 0.02,
          textureAnomaly: 0.03,
          faceDetectionCount: 0,
          hasFace: false,
          preprocessing: { width: 3000, height: 2000, channels: 3, fileSize: 1000000 },
          confidence: 0.90,
          modelVersion: 'nexora-image-v1.0.0',
          processingTimeMs: 1000,
          errors: [],
        },
      });

      const job = { _id: 'job_3', post: 'post_3', contentReference: {} };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('COMPLETED');
      expect(result.results.hasFace).toBe(false);
      expect(result.results.faceDetectionCount).toBe(0);
      expect(result.results.finalScore).toBeGreaterThan(80);
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────

  describe('Error handling', () => {
    it('should return FAILED when post not found', async () => {
      const job = { _id: 'job_4', post: 'nonexistent', contentReference: {} };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('FAILED');
      expect(result.results.message).toContain('Post not found');
    });

    it('should return COMPLETED with message when no image URL found', async () => {
      Post._add({
        _id: 'post_5',
        user: 'user_5',
        media: [], // no media
      });

      const job = { _id: 'job_5', post: 'post_5', contentReference: {} };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('COMPLETED');
      expect(result.results.message).toContain('No image URL');
    });

    it('should throw when AI service is not available', async () => {
      Post._add({
        _id: 'post_6',
        user: 'user_6',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      axios.post.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
      });

      const job = { _id: 'job_6', post: 'post_6', contentReference: {} };

      await expect(imageAnalysisService.analyzeImage(job)).rejects.toThrow(
        'AI service is not available'
      );
    });

    it('should throw when AI service times out', async () => {
      Post._add({
        _id: 'post_7',
        user: 'user_7',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      axios.post.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout',
      });

      const job = { _id: 'job_7', post: 'post_7', contentReference: {} };

      await expect(imageAnalysisService.analyzeImage(job)).rejects.toThrow(
        'timed out'
      );
    });

    it('should throw when AI service returns an error', async () => {
      Post._add({
        _id: 'post_8',
        user: 'user_8',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      axios.post.mockRejectedValue({
        response: {
          status: 422,
          data: { detail: 'Invalid image format' },
        },
      });

      const job = { _id: 'job_8', post: 'post_8', contentReference: {} };

      await expect(imageAnalysisService.analyzeImage(job)).rejects.toThrow(
        'AI service error'
      );
    });

    it(' should handle AI service errors list in results', async () => {
      Post._add({
        _id: 'post_9',
        user: 'user_9',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      axios.post.mockResolvedValue({
        data: {
          success: false,
          manipulationProbability: 0.1,
          faceManipulationProbability: 0.0,
          frequencyAnomaly: 0.0,
          colorAnomaly: 0.0,
          textureAnomaly: 0.0,
          faceDetectionCount: 0,
          hasFace: false,
          preprocessing: { width: 100, height: 100, channels: 3, fileSize: 10000 },
          confidence: 0.25,
          modelVersion: 'nexora-image-v1.0.0',
          processingTimeMs: 500,
          errors: [{ stage: 'face_detection', message: 'No face detector available' }],
        },
      });

      const job = { _id: 'job_9', post: 'post_9', contentReference: {} };

      const result = await imageAnalysisService.analyzeImage(job);

      expect(result.status).toBe('REVIEW_REQUIRED'); // low confidence triggers review
      expect(result.results.finalScore).toBeDefined();
    });
  });

  // ─── Trust Score Integration ───────────────────────────────────────

  describe('Trust score integration', () => {
    it('should create TrustScore document for successful analysis', async () => {
      Post._add({
        _id: 'post_10',
        user: 'user_10',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });

      axios.post.mockResolvedValue({
        data: {
          success: true,
          manipulationProbability: 0.05,
          faceManipulationProbability: 0.02,
          frequencyAnomaly: 0.08,
          colorAnomaly: 0.03,
          textureAnomaly: 0.06,
          faceDetectionCount: 1,
          hasFace: true,
          preprocessing: { width: 1920, height: 1080, channels: 3, fileSize: 500000 },
          confidence: 0.85,
          modelVersion: 'nexora-image-v1.0.0',
          processingTimeMs: 1500,
          errors: [],
        },
      });

      const job = { _id: 'job_10', post: 'post_10', contentReference: {} };

      await imageAnalysisService.analyzeImage(job);

      expect(TrustScore.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const tsCall = TrustScore.findOneAndUpdate.mock.calls[0];
      expect(tsCall[0]).toEqual({ post: 'post_10' });
      expect(tsCall[1]).toMatchObject({
        post: 'post_10',
        score: expect.any(Number),
        label: expect.any(String),
        modelVersion: 'nexora-image-v1.0.0',
      });
    });
  });

  // ─── getAnalysisForPost ────────────────────────────────────────────

  describe('getAnalysisForPost', () => {
    it('should return analysis results for a post', async () => {
      const mockAnalysis = ImageAnalysis._add({
        post: 'post_11',
        manipulationProbability: 0.1,
      });

      ImageAnalysis.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockAnalysis),
      });

      const result = await imageAnalysisService.getAnalysisForPost('post_11');

      expect(result).toBeDefined();
      expect(result.post).toBe('post_11');
    });
  });
});
