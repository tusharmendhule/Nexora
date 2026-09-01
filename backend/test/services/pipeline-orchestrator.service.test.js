/**
 * Pipeline Orchestrator Tests (Module 17)
 * ========================================
 * End-to-end tests for the full verification pipeline.
 *
 * Covers:
 *   1. Pipeline initialization and stage setup
 *   2. TEXT content type — full pipeline flow
 *   3. IMAGE content type — pipeline with skipped stages
 *   4. VIDEO content type — pipeline with media analysis
 *   5. AUDIO content type — pipeline with audio analysis
 *   6. LINK content type — pipeline with link extraction
 *   7. Stage lifecycle (start, complete, fail, skip, retry)
 *   8. Error handling and graceful degradation
 *   9. Retry logic
 *  10. Pipeline stage list generation
 *  11. Moderation decision integration
 *  12. Trust score integration
 *  13. Post state transitions
 *  14. Pipeline status queries
 *
 * Run with: npm test -- --testPathPattern=pipeline-orchestrator
 */

// ─── Mocks ───────────────────────────────────────────────────────────

// Mock all external dependencies
jest.mock('../../src/models/pipeline-stage.model', () => {
  const mockSave = jest.fn();
  const MockPipelineStage = function (data) {
    Object.assign(this, data);
    this._id = 'mock_pipeline_' + Date.now();
    this.save = mockSave.mockResolvedValue(this);
  };
  MockPipelineStage.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPipelineStage(data);
    return Promise.resolve(doc);
  });
  MockPipelineStage.findOne = jest.fn();
  MockPipelineStage.findOneAndUpdate = jest.fn();
  MockPipelineStage.find = jest.fn();
  MockPipelineStage.countDocuments = jest.fn();
  MockPipelineStage.aggregate = jest.fn();
  return MockPipelineStage;
});

jest.mock('../../src/models/post.model', () => {
  const mockSave = jest.fn();
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || 'mock_post_' + Date.now();
    this.save = mockSave.mockResolvedValue(this);
  };
  MockPost.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPost(data);
    return Promise.resolve(doc);
  });
  MockPost.findById = jest.fn();
  MockPost.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  MockPost.find = jest.fn();
  MockPost.countDocuments = jest.fn();
  return MockPost;
});

jest.mock('../../src/services/content-router.service', () => ({
  classifyContentType: jest.fn(),
  pipelineForContentType: jest.fn(),
  createJob: jest.fn(),
  markProcessing: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
  getPendingJobs: jest.fn(),
}));

jest.mock('../../src/services/text-analysis.service', () => ({
  analyzeText: jest.fn(),
  getAnalysisForPost: jest.fn(),
}));

jest.mock('../../src/services/video-analysis.service', () => ({
  analyzeVideo: jest.fn(),
  getAnalysisForPost: jest.fn(),
}));

jest.mock('../../src/services/audio-analysis.service', () => ({
  analyzeAudio: jest.fn(),
  getAnalysisForPost: jest.fn(),
}));

jest.mock('../../src/services/link-analysis.service', () => ({
  analyzeLink: jest.fn(),
  getAnalysisForPost: jest.fn(),
}));

jest.mock('../../src/services/claim-entity-extraction.service', () => ({
  extractDirect: jest.fn(),
  extractForJob: jest.fn(),
  getExtractionForPost: jest.fn(),
}));

jest.mock('../../src/services/evidence-normalization.service', () => ({
  normalizeAndStoreEvidence: jest.fn(),
  normalizeEvidence: jest.fn(),
  getEvidenceByPost: jest.fn(),
  NORMALIZATION_VERSION: 'v1.0',
}));

jest.mock('../../src/services/trust-score.service', () => ({
  computeAndStoreTrustScore: jest.fn(),
  computeFactualVerificationScore: jest.fn(),
  isConfirmedFalse: jest.fn(),
  getTrustScoreByPost: jest.fn(),
  MODEL_VERSION: 'nexora-trust-v1.0.0',
  RULE_VERSION: 'nexora-rules-v1.0.0',
}));

jest.mock('../../src/services/fact-check.service', () => ({
  factCheckClaims: jest.fn(),
  VerificationStatus: {
    VERIFIED_TRUE: 'VERIFIED_TRUE',
    VERIFIED_FALSE: 'VERIFIED_FALSE',
    MIXED: 'MIXED',
    NO_EVIDENCE: 'NO_EVIDENCE',
    UNKNOWN: 'UNKNOWN',
  },
}));

jest.mock('../../src/services/moderation-decision.service', () => ({
  evaluateDecision: jest.fn(),
  applyDecision: jest.fn(),
  Decision: {
    PUBLISH: 'PUBLISH',
    REJECT: 'REJECT',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    ESCALATE: 'ESCALATE',
  },
  DECISION_VERSION: 'nexora-moderation-v1.0.0',
}));

// Mock uuid to avoid ESM import issue
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Date.now()),
}));

// ─── Import mocks for assertions ─────────────────────────────────────

const PipelineStage = require('../../src/models/pipeline-stage.model');
const Post = require('../../src/models/post.model');
const contentRouter = require('../../src/services/content-router.service');
const textAnalysisService = require('../../src/services/text-analysis.service');
const videoAnalysisService = require('../../src/services/video-analysis.service');
const audioAnalysisService = require('../../src/services/audio-analysis.service');
const linkAnalysisService = require('../../src/services/link-analysis.service');
const claimEntityService = require('../../src/services/claim-entity-extraction.service');
const evidenceNormalizationService = require('../../src/services/evidence-normalization.service');
const trustScoreService = require('../../src/services/trust-score.service');
const factCheckService = require('../../src/services/fact-check.service');
const moderationDecisionService = require('../../src/services/moderation-decision.service');

const {
  executePipeline,
  initializePipeline,
  startStage,
  completeStage,
  failStage,
  skipStage,
  getPipelineStatus,
  getPipelineHistory,
  getPipelineStats,
  STAGES,
  CRITICAL_STAGES,
  SKIPPABLE_FOR_TYPE,
  buildStageList,
} = require('../../src/services/pipeline-orchestrator.service');

// ─── Test Helpers ─────────────────────────────────────────────────────

function createMockPost(overrides = {}) {
  return {
    _id: 'post_001',
    user: 'user_001',
    text: 'Scientists confirm that drinking water is essential for human survival.',
    contentType: 'text',
    media: [],
    linkUrl: null,
    verificationStatus: 'PENDING_VERIFICATION',
    moderationStatus: 'pending',
    trustScore: 75,
    trustBadge: 'Blue',
    ...overrides,
  };
}

function createMockJob(overrides = {}) {
  return {
    _id: 'job_001',
    jobId: 'uuid-1234',
    post: 'post_001',
    contentType: 'TEXT',
    pipeline: 'nlp',
    status: 'PENDING',
    contentReference: {},
    ...overrides,
  };
}

function setupMocksForTextPipeline() {
  contentRouter.classifyContentType.mockReturnValue('TEXT');
  contentRouter.pipelineForContentType.mockReturnValue('nlp');

  textAnalysisService.analyzeText.mockResolvedValue({
    status: 'COMPLETED',
    results: {
      misinformationProbability: 0.1,
      aiGeneratedProbability: 0.05,
      confidence: 0.85,
      finalScore: 82,
      claims: [{ text: 'Water is essential' }],
      entities: [{ text: 'Scientists', label: 'ENTITY' }],
    },
    modelVersion: 'nexora-text-v1.2.0',
  });

  claimEntityService.extractDirect.mockResolvedValue({
    status: 'COMPLETED',
    results: { claimCount: 1, entityCount: 1 },
    modelVersion: 'nexora-claims-v1.0.0',
    savedAnalysis: {
      claims: [{ text: 'Water is essential', textHash: 'abc123' }],
      entities: [{ text: 'Scientists', label: 'ENTITY' }],
      confidence: 0.8,
      verificationScore: 75,
    },
  });

  factCheckService.factCheckClaims.mockResolvedValue({
    results: [
      { status: 'VERIFIED_TRUE', reviews: [], classifiedRatings: [] },
    ],
    aggregateStatus: 'VERIFIED_TRUE',
    summary: { total: 1, verified: 1, false: 0, mixed: 0, noEvidence: 0, unknown: 0 },
  });

  trustScoreService.computeFactualVerificationScore.mockReturnValue(0.8);
  trustScoreService.isConfirmedFalse.mockReturnValue(false);

  evidenceNormalizationService.normalizeAndStoreEvidence.mockResolvedValue({
    _id: 'evidence_001',
    evidenceItems: [
      { source: 'AI Text Analyzer', evidenceCategory: 'positive', confidence: 0.8, sourceReliability: 0.7 },
    ],
  });

  trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
    _id: 'ts_001',
    score: 85,
    label: 'Green',
    explanation: 'High-trust content (score 85 >= 80) → GREEN label.',
    isOverrideApplied: false,
    authenticity: 0.9,
    factualVerification: 0.8,
    sourceCredibility: 0.7,
    modelConfidence: 0.85,
  });

  moderationDecisionService.evaluateDecision.mockReturnValue({
    action: 'PUBLISH',
    reason: 'Trust score 85 (label: Green) meets auto-publish threshold',
    ruleApplied: 'RULE_SCORE_PUBLISH',
    shouldPublish: true,
  });

  moderationDecisionService.applyDecision.mockResolvedValue({});
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Pipeline Orchestrator (Module 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for PipelineStage.findOne — returns a saveable doc
    const createMockPipelineDoc = (data) => {
      const doc = { ...data, save: jest.fn().mockResolvedValue(data) };
      return doc;
    };

    PipelineStage.findOne.mockImplementation((query) => {
      const doc = createMockPipelineDoc({
        pipelineId: query.pipelineId || 'test-pipeline',
        post: query.post || 'post_001',
        stages: [
          { stage: 'CONTENT_UPLOAD', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'CONTENT_TYPE_ROUTING', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'PREPROCESSING', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'AI_ANALYSIS', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'CLAIM_EXTRACTION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'ENTITY_EXTRACTION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'FACT_VERIFICATION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'EVIDENCE_NORMALIZATION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'TRUST_SCORE', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'TRUST_LABEL', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'MODERATION_DECISION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
          { stage: 'PUBLICATION', status: 'PENDING', retryCount: 0, maxRetries: 3 },
        ],
        currentStage: 'CONTENT_UPLOAD',
        status: 'PENDING',
        moderationDecision: null,
        trustScoreResult: null,
      });
      return {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(doc),
        ...doc,
        save: jest.fn().mockResolvedValue(doc),
      };
    });
  });

  // ── 1. Pipeline Stage Definitions ──────────────────────────────

  describe('Pipeline stage definitions', () => {
    it('should define 12 pipeline stages', () => {
      expect(STAGES).toHaveLength(12);
    });

    it('should have stages in correct order', () => {
      expect(STAGES[0]).toBe('CONTENT_UPLOAD');
      expect(STAGES[1]).toBe('CONTENT_TYPE_ROUTING');
      expect(STAGES[2]).toBe('PREPROCESSING');
      expect(STAGES[3]).toBe('AI_ANALYSIS');
      expect(STAGES[STAGES.length - 1]).toBe('PUBLICATION');
    });

    it('should have critical stages defined', () => {
      expect(CRITICAL_STAGES.has('CONTENT_TYPE_ROUTING')).toBe(true);
      expect(CRITICAL_STAGES.has('AI_ANALYSIS')).toBe(true);
      expect(CRITICAL_STAGES.has('TRUST_SCORE')).toBe(true);
      expect(CRITICAL_STAGES.has('MODERATION_DECISION')).toBe(true);
    });
  });

  // ── 2. Stage List Generation ───────────────────────────────────

  describe('buildStageList', () => {
    it('should include all stages for TEXT content', () => {
      const stages = buildStageList('TEXT');
      expect(stages).not.toContain('CONTENT_UPLOAD');
      expect(stages.length).toBe(STAGES.length - 1);
    });

    it('should skip claim/entity/fact-check stages for IMAGE', () => {
      const stages = buildStageList('IMAGE');
      expect(stages).not.toContain('CLAIM_EXTRACTION');
      expect(stages).not.toContain('ENTITY_EXTRACTION');
      expect(stages).not.toContain('FACT_VERIFICATION');
      expect(stages).toContain('AI_ANALYSIS');
      expect(stages).toContain('TRUST_SCORE');
    });

    it('should skip claim/entity/fact-check stages for VIDEO', () => {
      const stages = buildStageList('VIDEO');
      expect(stages).not.toContain('CLAIM_EXTRACTION');
      expect(stages).not.toContain('ENTITY_EXTRACTION');
      expect(stages).not.toContain('FACT_VERIFICATION');
    });

    it('should skip claim/entity/fact-check stages for AUDIO', () => {
      const stages = buildStageList('AUDIO');
      expect(stages).not.toContain('CLAIM_EXTRACTION');
      expect(stages).not.toContain('ENTITY_EXTRACTION');
      expect(stages).not.toContain('FACT_VERIFICATION');
    });

    it('should include all stages for LINK content', () => {
      const stages = buildStageList('LINK');
      expect(stages.length).toBe(STAGES.length - 1); // Only CONTENT_UPLOAD skipped
    });
  });

  // ── 3. TEXT Pipeline — Full Flow ───────────────────────────────

  describe('TEXT content type — full pipeline flow', () => {
    it('should execute the complete pipeline for text content', async () => {
      const post = createMockPost();
      const job = createMockJob();
      setupMocksForTextPipeline();

      // Mock PipelineStage.create to return a document we can control
      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        status: 'PENDING',
        currentStage: 'CONTENT_UPLOAD',
        stages: STAGES.filter(s => s !== 'CONTENT_UPLOAD').map(stage => ({
          stage,
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
          durationMs: null,
          error: null,
          retryCount: 0,
          maxRetries: 3,
          lastRetryAt: null,
          modelVersion: null,
          serviceId: null,
          result: null,
        })),
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      const result = await executePipeline(post, job);

      // Verify pipeline was created
      expect(PipelineStage.create).toHaveBeenCalledTimes(1);
      const createArg = PipelineStage.create.mock.calls[0][0];
      expect(createArg.contentType).toBe('TEXT');
      expect(createArg.stages.length).toBe(11); // 12 minus CONTENT_UPLOAD

      // Verify post was updated
      expect(Post.findByIdAndUpdate).toHaveBeenCalled();

      // Verify the result
      expect(result.status).toBe('COMPLETED');
      expect(result.pipelineId).toBe('test-pipeline-uuid');
    });

    it('should call text analysis for TEXT content', async () => {
      const post = createMockPost();
      const job = createMockJob({ contentType: 'TEXT' });
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(textAnalysisService.analyzeText).toHaveBeenCalledTimes(1);
      expect(textAnalysisService.analyzeText).toHaveBeenCalledWith(job);
    });

    it('should call claim extraction for TEXT content', async () => {
      const post = createMockPost();
      const job = createMockJob({ contentType: 'TEXT' });
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(claimEntityService.extractDirect).toHaveBeenCalled();
    });

    it('should call fact verification for TEXT content', async () => {
      const post = createMockPost();
      const job = createMockJob({ contentType: 'TEXT' });
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(factCheckService.factCheckClaims).toHaveBeenCalled();
    });

    it('should compute trust score for TEXT content', async () => {
      const post = createMockPost();
      const job = createMockJob({ contentType: 'TEXT' });
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(trustScoreService.computeAndStoreTrustScore).toHaveBeenCalled();
    });

    it('should make moderation decision for TEXT content', async () => {
      const post = createMockPost();
      const job = createMockJob({ contentType: 'TEXT' });
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_001',
        pipelineId: 'test-pipeline-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(moderationDecisionService.evaluateDecision).toHaveBeenCalled();
    });
  });

  // ── 4. IMAGE Pipeline — Skipped Stages ─────────────────────────

  describe('IMAGE content type — skipped stages', () => {
    it('should skip claim extraction, entity extraction, and fact verification for IMAGE', async () => {
      const post = createMockPost({ contentType: 'image', media: [{ url: 'https://example.com/img.jpg', type: 'image' }] });
      const job = createMockJob({ contentType: 'IMAGE' });

      contentRouter.classifyContentType.mockReturnValue('IMAGE');
      contentRouter.pipelineForContentType.mockReturnValue('image_authenticity');

      // Mock the pipeline doc
      const stagesForImage = buildStageList('IMAGE').map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
        modelVersion: null,
        serviceId: null,
        lastRetryAt: null,
      }));

      const mockPipelineDoc = {
        _id: 'pipeline_002',
        pipelineId: 'test-image-uuid',
        post: post._id,
        contentType: 'IMAGE',
        status: 'PENDING',
        currentStage: 'CONTENT_UPLOAD',
        stages: stagesForImage,
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      // IMAGE uses the placeholder pipeline
      evidenceNormalizationService.normalizeAndStoreEvidence.mockResolvedValue({
        _id: 'ev_001',
        evidenceItems: [{ source: 'Content Metadata', evidenceCategory: 'positive', confidence: 0.5, sourceReliability: 0.5 }],
      });

      trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
        _id: 'ts_002',
        score: 75,
        label: 'Blue',
        explanation: 'Moderate trust',
        isOverrideApplied: false,
        authenticity: 0.8,
        factualVerification: 0.5,
        sourceCredibility: 0.5,
        modelConfidence: 0.5,
      });

      moderationDecisionService.evaluateDecision.mockReturnValue({
        action: 'PUBLISH',
        reason: 'Score meets threshold',
        ruleApplied: 'RULE_SCORE_PUBLISH',
      });
      moderationDecisionService.applyDecision.mockResolvedValue({});

      await executePipeline(post, job);

      // These should NOT be called for IMAGE content
      expect(textAnalysisService.analyzeText).not.toHaveBeenCalled();
      expect(claimEntityService.extractDirect).not.toHaveBeenCalled();
      expect(factCheckService.factCheckClaims).not.toHaveBeenCalled();

      // Trust score should still be computed
      expect(trustScoreService.computeAndStoreTrustScore).toHaveBeenCalled();
    });
  });

  // ── 5. VIDEO Pipeline ─────────────────────────────────────────

  describe('VIDEO content type', () => {
    it('should call video analysis for VIDEO content', async () => {
      const post = createMockPost({
        contentType: 'video',
        media: [{ url: 'https://example.com/video.mp4', type: 'video' }],
      });
      const job = createMockJob({ contentType: 'VIDEO' });

      contentRouter.classifyContentType.mockReturnValue('VIDEO');
      contentRouter.pipelineForContentType.mockReturnValue('video_deepfake');

      videoAnalysisService.analyzeVideo.mockResolvedValue({
        status: 'COMPLETED',
        results: {
          deepfakeProbability: 0.05,
          manipulationProbability: 0.02,
          confidence: 0.9,
          finalScore: 90,
        },
        modelVersion: 'nexora-video-v1.0.0',
      });

      const stagesForVideo = buildStageList('VIDEO').map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
        modelVersion: null,
        serviceId: null,
        lastRetryAt: null,
      }));

      const mockPipelineDoc = {
        _id: 'pipeline_003',
        pipelineId: 'test-video-uuid',
        post: post._id,
        contentType: 'VIDEO',
        status: 'PENDING',
        currentStage: 'CONTENT_UPLOAD',
        stages: stagesForVideo,
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      evidenceNormalizationService.normalizeAndStoreEvidence.mockResolvedValue({
        _id: 'ev_002',
        evidenceItems: [],
      });

      trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
        _id: 'ts_003',
        score: 90,
        label: 'Green',
        explanation: 'High trust',
        isOverrideApplied: false,
        authenticity: 0.95,
        factualVerification: 0.5,
        sourceCredibility: 0.5,
        modelConfidence: 0.9,
      });

      moderationDecisionService.evaluateDecision.mockReturnValue({
        action: 'PUBLISH',
        reason: 'Score meets threshold',
        ruleApplied: 'RULE_SCORE_PUBLISH',
      });
      moderationDecisionService.applyDecision.mockResolvedValue({});

      await executePipeline(post, job);

      expect(videoAnalysisService.analyzeVideo).toHaveBeenCalledTimes(1);
      expect(videoAnalysisService.analyzeVideo).toHaveBeenCalledWith(job);
    });
  });

  // ── 6. AUDIO Pipeline ─────────────────────────────────────────

  describe('AUDIO content type', () => {
    it('should call audio analysis for AUDIO content', async () => {
      const post = createMockPost({
        contentType: 'audio',
        media: [{ url: 'https://example.com/audio.mp3', type: 'audio' }],
      });
      const job = createMockJob({ contentType: 'AUDIO' });

      contentRouter.classifyContentType.mockReturnValue('AUDIO');
      contentRouter.pipelineForContentType.mockReturnValue('audio_authenticity');

      audioAnalysisService.analyzeAudio.mockResolvedValue({
        status: 'COMPLETED',
        results: {
          syntheticSpeechProbability: 0.03,
          manipulationProbability: 0.01,
          confidence: 0.92,
          finalScore: 93,
        },
        modelVersion: 'nexora-audio-v1.0.0',
      });

      const stagesForAudio = buildStageList('AUDIO').map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
        modelVersion: null,
        serviceId: null,
        lastRetryAt: null,
      }));

      const mockPipelineDoc = {
        _id: 'pipeline_004',
        pipelineId: 'test-audio-uuid',
        post: post._id,
        contentType: 'AUDIO',
        status: 'PENDING',
        currentStage: 'CONTENT_UPLOAD',
        stages: stagesForAudio,
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      evidenceNormalizationService.normalizeAndStoreEvidence.mockResolvedValue({
        _id: 'ev_003',
        evidenceItems: [],
      });

      trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
        _id: 'ts_004',
        score: 93,
        label: 'Green',
        explanation: 'High trust',
        isOverrideApplied: false,
        authenticity: 0.97,
        factualVerification: 0.5,
        sourceCredibility: 0.5,
        modelConfidence: 0.92,
      });

      moderationDecisionService.evaluateDecision.mockReturnValue({
        action: 'PUBLISH',
        reason: 'Score meets threshold',
        ruleApplied: 'RULE_SCORE_PUBLISH',
      });
      moderationDecisionService.applyDecision.mockResolvedValue({});

      await executePipeline(post, job);

      expect(audioAnalysisService.analyzeAudio).toHaveBeenCalledTimes(1);
      expect(audioAnalysisService.analyzeAudio).toHaveBeenCalledWith(job);
    });
  });

  // ── 7. LINK Pipeline ──────────────────────────────────────────

  describe('LINK content type', () => {
    it('should call link analysis for LINK content', async () => {
      const post = createMockPost({
        contentType: 'link',
        linkUrl: 'https://example.com/article',
        text: '',
      });
      const job = createMockJob({ contentType: 'LINK' });

      contentRouter.classifyContentType.mockReturnValue('LINK');
      contentRouter.pipelineForContentType.mockReturnValue('link_extraction');

      linkAnalysisService.analyzeLink.mockResolvedValue({
        status: 'COMPLETED',
        results: {
          misinformationProbability: 0.15,
          sourceCredibility: 0.7,
          confidence: 0.8,
          finalScore: 72,
          claims: [{ text: 'Example claim' }],
          entities: [{ text: 'Example', label: 'ENTITY' }],
        },
        modelVersion: 'nexora-link-v1.0.0',
      });

      claimEntityService.extractDirect.mockResolvedValue({
        status: 'COMPLETED',
        results: { claimCount: 1, entityCount: 1 },
        modelVersion: 'nexora-claims-v1.0.0',
        savedAnalysis: {
          claims: [{ text: 'Example claim', textHash: 'def456' }],
          entities: [{ text: 'Example', label: 'ENTITY' }],
          confidence: 0.7,
          verificationScore: 60,
        },
      });

      factCheckService.factCheckClaims.mockResolvedValue({
        results: [],
        aggregateStatus: 'NO_EVIDENCE',
        summary: { total: 0, verified: 0, false: 0, mixed: 0, noEvidence: 0, unknown: 0 },
      });

      trustScoreService.computeFactualVerificationScore.mockReturnValue(0.5);
      trustScoreService.isConfirmedFalse.mockReturnValue(false);

      const stagesForLink = buildStageList('LINK').map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
        modelVersion: null,
        serviceId: null,
        lastRetryAt: null,
      }));

      const mockPipelineDoc = {
        _id: 'pipeline_005',
        pipelineId: 'test-link-uuid',
        post: post._id,
        contentType: 'LINK',
        status: 'PENDING',
        currentStage: 'CONTENT_UPLOAD',
        stages: stagesForLink,
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      evidenceNormalizationService.normalizeAndStoreEvidence.mockResolvedValue({
        _id: 'ev_004',
        evidenceItems: [],
      });

      trustScoreService.computeAndStoreTrustScore.mockResolvedValue({
        _id: 'ts_005',
        score: 72,
        label: 'Orange',
        explanation: 'Moderate trust',
        isOverrideApplied: false,
        authenticity: 0.85,
        factualVerification: 0.5,
        sourceCredibility: 0.7,
        modelConfidence: 0.8,
      });

      moderationDecisionService.evaluateDecision.mockReturnValue({
        action: 'PUBLISH',
        reason: 'Moderate trust, publish with badge',
        ruleApplied: 'RULE_MODERATE_TRUST',
      });
      moderationDecisionService.applyDecision.mockResolvedValue({});

      await executePipeline(post, job);

      expect(linkAnalysisService.analyzeLink).toHaveBeenCalledTimes(1);
      expect(linkAnalysisService.analyzeLink).toHaveBeenCalledWith(job);
    });
  });

  // ── 8. Error Handling ─────────────────────────────────────────

  describe('Error handling and graceful degradation', () => {
    it('should handle post not found gracefully', async () => {
      const post = createMockPost();
      const job = createMockJob();

      Post.findById.mockResolvedValue(null);

      // The pipeline orchestrator expects a post to be passed directly,
      // but if post is null, it should throw
      const result = await executePipeline(null, job);

      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
    });

    it('should handle claim extraction failure gracefully', async () => {
      const post = createMockPost();
      const job = createMockJob();
      setupMocksForTextPipeline();

      // Claim extraction throws
      claimEntityService.extractDirect.mockRejectedValue(new Error('Claim extraction failed'));

      const mockPipelineDoc = {
        _id: 'pipeline_006',
        pipelineId: 'test-error-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      const result = await executePipeline(post, job);

      // Pipeline should still complete (claim extraction is non-critical)
      expect(result.status).toBe('COMPLETED');
    });

    it('should handle trust score failure by failing the pipeline', async () => {
      const post = createMockPost();
      const job = createMockJob();

      contentRouter.classifyContentType.mockReturnValue('TEXT');
      contentRouter.pipelineForContentType.mockReturnValue('nlp');

      textAnalysisService.analyzeText.mockResolvedValue({
        status: 'COMPLETED',
        results: { misinformationProbability: 0.1, confidence: 0.8, finalScore: 80 },
        modelVersion: 'nexora-text-v1.2.0',
      });

      claimEntityService.extractDirect.mockResolvedValue(null);
      factCheckService.factCheckClaims.mockResolvedValue({ results: [], aggregateStatus: 'NO_EVIDENCE' });
      trustScoreService.computeFactualVerificationScore.mockReturnValue(0.5);

      // Trust score fails
      trustScoreService.computeAndStoreTrustScore.mockRejectedValue(new Error('Trust score computation failed'));

      const stagesForText = buildStageList('TEXT').map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
        modelVersion: null,
        serviceId: null,
        lastRetryAt: null,
      }));

      const mockPipelineDoc = {
        _id: 'pipeline_007',
        pipelineId: 'test-trust-fail-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: stagesForText,
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      const result = await executePipeline(post, job);

      // Trust score is critical — pipeline should fail
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Trust score computation failed');
    });
  });

  // ── 9. Stage Lifecycle ────────────────────────────────────────

  describe('Stage lifecycle', () => {
    it('should track stage timing (startedAt, completedAt, durationMs)', async () => {
      const pipelineId = 'test-lifecycle-uuid';

      const stageEntries = STAGES.map(stage => ({
        stage,
        status: 'PENDING',
        startedAt: null,
        completedAt: null,
        durationMs: null,
        retryCount: 0,
        maxRetries: 3,
      }));

      const mockPipelineDoc = {
        pipelineId,
        stages: stageEntries,
        currentStage: 'CONTENT_UPLOAD',
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };

      PipelineStage.findOne.mockResolvedValue(mockPipelineDoc);

      // Start a stage
      await startStage(pipelineId, 'AI_ANALYSIS');
      expect(mockPipelineDoc.save).toHaveBeenCalled();
      const startedStage = mockPipelineDoc.stages.find(s => s.stage === 'AI_ANALYSIS');
      expect(startedStage.status).toBe('PROCESSING');
      expect(startedStage.startedAt).toBeInstanceOf(Date);

      // Complete the stage
      await completeStage(pipelineId, 'AI_ANALYSIS', { result: 'test' }, 'v1.0', 'test-service');
      expect(mockPipelineDoc.save).toHaveBeenCalledTimes(2);
      expect(startedStage.status).toBe('COMPLETED');
      expect(startedStage.completedAt).toBeInstanceOf(Date);
      expect(startedStage.durationMs).toBeGreaterThanOrEqual(0);
      expect(startedStage.modelVersion).toBe('v1.0');
      expect(startedStage.serviceId).toBe('test-service');
    });

    it('should track retry count on failure', async () => {
      const pipelineId = 'test-retry-uuid';

      const stageEntries = STAGES.map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        startedAt: new Date(),
        error: null,
      }));

      const mockPipelineDoc = {
        pipelineId,
        stages: stageEntries,
        save: jest.fn().mockResolvedValue(true),
      };

      PipelineStage.findOne.mockResolvedValue(mockPipelineDoc);

      await failStage(pipelineId, 'AI_ANALYSIS', new Error('Temporary failure'));

      const failedStage = mockPipelineDoc.stages.find(s => s.stage === 'AI_ANALYSIS');
      expect(failedStage.retryCount).toBe(1);
      expect(failedStage.status).toBe('PENDING'); // Retries remain
      expect(mockPipelineDoc.save).toHaveBeenCalled();
    });

    it('should mark stage as FAILED after max retries', async () => {
      const pipelineId = 'test-max-retry-uuid';

      const stageEntries = STAGES.map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 2, // Already at 2 retries
        maxRetries: 3,
        startedAt: new Date(),
        error: null,
      }));

      const mockPipelineDoc = {
        pipelineId,
        stages: stageEntries,
        save: jest.fn().mockResolvedValue(true),
      };

      PipelineStage.findOne.mockResolvedValue(mockPipelineDoc);

      await failStage(pipelineId, 'AI_ANALYSIS', new Error('Final failure'));

      const failedStage = mockPipelineDoc.stages.find(s => s.stage === 'AI_ANALYSIS');
      expect(failedStage.retryCount).toBe(3);
      expect(failedStage.status).toBe('FAILED');
      expect(failedStage.error.message).toBe('Final failure');
      expect(failedStage.error.recoverable).toBe(false);
    });

    it('should mark stage as SKIPPED with reason', async () => {
      const pipelineId = 'test-skip-uuid';

      const stageEntries = STAGES.map(stage => ({
        stage,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      }));

      const mockPipelineDoc = {
        pipelineId,
        stages: stageEntries,
        save: jest.fn().mockResolvedValue(true),
      };

      PipelineStage.findOne.mockResolvedValue(mockPipelineDoc);

      await skipStage(pipelineId, 'CLAIM_EXTRACTION', 'IMAGE content has no text claims');

      const skippedStage = mockPipelineDoc.stages.find(s => s.stage === 'CLAIM_EXTRACTION');
      expect(skippedStage.status).toBe('SKIPPED');
      expect(skippedStage.result.skipped).toBe(true);
      expect(skippedStage.result.reason).toBe('IMAGE content has no text claims');
    });
  });

  // ── 10. Pipeline Initialization ────────────────────────────────

  describe('Pipeline initialization', () => {
    it('should create a pipeline with correct stages for TEXT', async () => {
      const post = createMockPost();
      const contentType = 'TEXT';

      const mockPipelineDoc = {
        _id: 'pipeline_init_001',
        pipelineId: 'init-uuid',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      const pipeline = await initializePipeline(post, contentType);

      expect(PipelineStage.create).toHaveBeenCalledTimes(1);
      const createArg = PipelineStage.create.mock.calls[0][0];
      expect(createArg.contentType).toBe('TEXT');
      expect(createArg.stages.length).toBe(11); // 12 minus CONTENT_UPLOAD
    });

    it('should create a pipeline with fewer stages for IMAGE', async () => {
      const post = createMockPost({ contentType: 'image' });
      const contentType = 'IMAGE';

      const mockPipelineDoc = {
        _id: 'pipeline_init_002',
        pipelineId: 'init-uuid-2',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      const pipeline = await initializePipeline(post, contentType);

      const createArg = PipelineStage.create.mock.calls[0][0];
      expect(createArg.stages.length).toBe(8); // 12 minus CONTENT_UPLOAD, CLAIM_EXTRACTION, ENTITY_EXTRACTION, FACT_VERIFICATION
    });
  });

  // ── 11. Moderation Decision Integration ────────────────────────

  describe('Moderation decision integration', () => {
    it('should set post to PUBLISHED when decision is PUBLISH', async () => {
      const post = createMockPost();
      const job = createMockJob();
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_010',
        pipelineId: 'test-publish-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      // Verify moderation was called
      expect(moderationDecisionService.evaluateDecision).toHaveBeenCalled();
      expect(moderationDecisionService.applyDecision).toHaveBeenCalled();
    });

    it('should set post to REVIEW_REQUIRED when decision requires review', async () => {
      const post = createMockPost();
      const job = createMockJob();
      setupMocksForTextPipeline();

      moderationDecisionService.evaluateDecision.mockReturnValue({
        action: 'REVIEW_REQUIRED',
        reason: 'Trust score below threshold',
        ruleApplied: 'RULE_LOW_TRUST_REVIEW',
      });

      const mockPipelineDoc = {
        _id: 'pipeline_011',
        pipelineId: 'test-review-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      expect(moderationDecisionService.applyDecision).toHaveBeenCalled();
    });
  });

  // ── 12. Pipeline Stats ────────────────────────────────────────

  describe('Pipeline statistics', () => {
    it('should return aggregate stats', async () => {
      PipelineStage.countDocuments
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(5)    // running
        .mockResolvedValueOnce(80)   // completed
        .mockResolvedValueOnce(10)   // failed
        .mockResolvedValueOnce(5);   // reviewRequired

      PipelineStage.aggregate
        .mockResolvedValueOnce([{ _id: null, avgDuration: 5000 }])
        .mockResolvedValueOnce([
          { _id: 'TEXT', count: 60 },
          { _id: 'VIDEO', count: 25 },
          { _id: 'IMAGE', count: 15 },
        ]);

      const stats = await getPipelineStats();

      expect(stats.total).toBe(100);
      expect(stats.running).toBe(5);
      expect(stats.completed).toBe(80);
      expect(stats.failed).toBe(10);
      expect(stats.reviewRequired).toBe(5);
      expect(stats.avgDurationMs).toBe(5000);
      expect(stats.typeDistribution.TEXT).toBe(60);
      expect(stats.typeDistribution.VIDEO).toBe(25);
    });
  });

  // ── 13. Post State Transitions ────────────────────────────────

  describe('Post state transitions', () => {
    it('should transition post to PENDING_VERIFICATION on pipeline init', async () => {
      const post = createMockPost();
      const contentType = 'TEXT';

      const mockPipelineDoc = {
        _id: 'pipeline_state_001',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await initializePipeline(post, contentType);

      expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
        post._id,
        expect.objectContaining({
          verificationStatus: 'PENDING_VERIFICATION',
        })
      );
    });

    it('should transition post to VERIFYING during pipeline execution', async () => {
      // This is tested implicitly via the startStage calls in executePipeline
      // The post.findByIdAndUpdate is called with VERIFYING status
      const post = createMockPost();
      const job = createMockJob();
      setupMocksForTextPipeline();

      const mockPipelineDoc = {
        _id: 'pipeline_state_002',
        pipelineId: 'test-state-uuid',
        post: post._id,
        contentType: 'TEXT',
        stages: [],
        save: jest.fn().mockResolvedValue(true),
      };
      PipelineStage.create.mockResolvedValue(mockPipelineDoc);

      await executePipeline(post, job);

      // Verify that VERIFYING was set at some point
      const calls = Post.findByIdAndUpdate.mock.calls;
      const verifyingCall = calls.find(
        (call) => call[1].verificationStatus === 'VERIFYING'
      );
      expect(verifyingCall).toBeDefined();
    });
  });

  // ── 14. SKIPPABLE_FOR_TYPE Mapping ────────────────────────────

  describe('SKIPPABLE_FOR_TYPE mapping', () => {
    it('should skip CONTENT_UPLOAD for all content types', () => {
      expect(SKIPPABLE_FOR_TYPE.TEXT).toContain('CONTENT_UPLOAD');
      expect(SKIPPABLE_FOR_TYPE.IMAGE).toContain('CONTENT_UPLOAD');
      expect(SKIPPABLE_FOR_TYPE.VIDEO).toContain('CONTENT_UPLOAD');
      expect(SKIPPABLE_FOR_TYPE.AUDIO).toContain('CONTENT_UPLOAD');
      expect(SKIPPABLE_FOR_TYPE.LINK).toContain('CONTENT_UPLOAD');
    });

    it('should have all 5 content types defined', () => {
      expect(Object.keys(SKIPPABLE_FOR_TYPE)).toHaveLength(5);
      expect(SKIPPABLE_FOR_TYPE).toHaveProperty('TEXT');
      expect(SKIPPABLE_FOR_TYPE).toHaveProperty('IMAGE');
      expect(SKIPPABLE_FOR_TYPE).toHaveProperty('VIDEO');
      expect(SKIPPABLE_FOR_TYPE).toHaveProperty('AUDIO');
      expect(SKIPPABLE_FOR_TYPE).toHaveProperty('LINK');
    });
  });
});
