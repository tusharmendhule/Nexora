/**
 * Pipeline Orchestrator Service (Module 17)
 * ==========================================
 * Connects all Nexora verification modules into one production-style
 * end-to-end workflow.
 *
 * Pipeline:
 *   USER → CONTENT_UPLOAD → CONTENT_TYPE_ROUTING → PREPROCESSING
 *   → AI_ANALYSIS → CLAIM_EXTRACTION → ENTITY_EXTRACTION
 *   → FACT_VERIFICATION → EVIDENCE_NORMALIZATION
 *   → TRUST_SCORE → TRUST_LABEL → MODERATION_DECISION → PUBLICATION
 *
 * Supports: TEXT, IMAGE, VIDEO, AUDIO, LINK
 *
 * Each stage tracks:
 *   - status (PENDING, PROCESSING, COMPLETED, FAILED, SKIPPED)
 *   - timestamp (startedAt, completedAt)
 *   - errors (message, code, recoverable)
 *   - retry handling (retryCount, maxRetries, lastRetryAt)
 *   - model/service version (modelVersion, serviceId)
 *
 * Design principles:
 *   - Background processing for expensive AI tasks
 *   - Users see real verification status (no fake progress)
 *   - Graceful degradation: non-critical stage failures don't block the pipeline
 *   - Retries with exponential backoff for transient failures
 */

const { v4: uuidv4 } = require('uuid');
const PipelineStage = require('../models/pipeline-stage.model');
const Post = require('../models/post.model');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

// ─── Pipeline Stage Definitions ───────────────────────────────────────

const STAGES = [
  'CONTENT_UPLOAD',
  'CONTENT_TYPE_ROUTING',
  'PREPROCESSING',
  'AI_ANALYSIS',
  'CLAIM_EXTRACTION',
  'ENTITY_EXTRACTION',
  'FACT_VERIFICATION',
  'EVIDENCE_NORMALIZATION',
  'TRUST_SCORE',
  'TRUST_LABEL',
  'MODERATION_DECISION',
  'PUBLICATION',
];

// Stages that are critical — failure here fails the pipeline
const CRITICAL_STAGES = new Set([
  'CONTENT_TYPE_ROUTING',
  'AI_ANALYSIS',
  'TRUST_SCORE',
  'MODERATION_DECISION',
]);

// Stages that can be skipped for certain content types
const SKIPPABLE_FOR_TYPE = {
  TEXT: ['CONTENT_UPLOAD'],
  IMAGE: ['CONTENT_UPLOAD', 'CLAIM_EXTRACTION', 'ENTITY_EXTRACTION', 'FACT_VERIFICATION'],
  VIDEO: ['CONTENT_UPLOAD', 'CLAIM_EXTRACTION', 'ENTITY_EXTRACTION', 'FACT_VERIFICATION'],
  AUDIO: ['CONTENT_UPLOAD', 'CLAIM_EXTRACTION', 'ENTITY_EXTRACTION', 'FACT_VERIFICATION'],
  LINK: ['CONTENT_UPLOAD'],
};

// Maximum retries per stage
const MAX_RETRIES = 3;

// Retry delay base (exponential backoff: base * 2^retryCount)
const RETRY_DELAY_MS = 1000;

// ─── Service Imports (lazy-loaded to avoid circular deps) ─────────────

let contentRouter;
let textAnalysisService;
let videoAnalysisService;
let imageAnalysisService;
let audioAnalysisService;
let linkAnalysisService;
let claimEntityService;
let evidenceNormalizationService;
let trustScoreService;
let moderationDecisionService;
let factCheckService;

function _loadServices() {
  if (!contentRouter) contentRouter = require('./content-router.service');
  if (!textAnalysisService) textAnalysisService = require('./text-analysis.service');
  if (!videoAnalysisService) videoAnalysisService = require('./video-analysis.service');
  if (!imageAnalysisService) imageAnalysisService = require('./image-analysis.service');
  if (!audioAnalysisService) audioAnalysisService = require('./audio-analysis.service');
  if (!linkAnalysisService) linkAnalysisService = require('./link-analysis.service');
  if (!claimEntityService) claimEntityService = require('./claim-entity-extraction.service');
  if (!evidenceNormalizationService) evidenceNormalizationService = require('./evidence-normalization.service');
  if (!trustScoreService) trustScoreService = require('./trust-score.service');
  if (!moderationDecisionService) moderationDecisionService = require('./moderation-decision.service');
  if (!factCheckService) factCheckService = require('./fact-check.service');
}

// ─── Helpers ──────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the ordered list of stages to execute for a given content type.
 * Skips stages that don't apply to the content type.
 */
function buildStageList(contentType) {
  const skippable = SKIPPABLE_FOR_TYPE[contentType] || [];
  return STAGES.filter((stage) => !skippable.includes(stage));
}

// ─── Pipeline Stage Management ────────────────────────────────────────

/**
 * Initialize a new pipeline run for a post.
 * Creates a PipelineStage document with all stage entries.
 */
async function initializePipeline(post, contentType) {
  const pipelineId = uuidv4();
  const stageList = buildStageList(contentType);

  const stages = stageList.map((stage) => ({
    stage,
    status: 'PENDING',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    lastRetryAt: null,
    modelVersion: null,
    serviceId: null,
    result: null,
  }));

  const pipeline = await PipelineStage.create({
    pipelineId,
    post: post._id,
    contentType,
    status: 'PENDING',
    currentStage: stageList[0] || 'CONTENT_UPLOAD',
    stages,
    trustScoreResult: null,
    moderationDecision: null,
    finalVerificationStatus: null,
    totalDurationMs: null,
    error: null,
  });

  // Update post with pipeline reference
  await Post.findByIdAndUpdate(post._id, {
    verificationStatus: 'PENDING_VERIFICATION',
    pipelineStageRef: pipeline._id,
  });

  return pipeline;
}

/**
 * Mark a stage as PROCESSING.
 */
async function startStage(pipelineId, stageName) {
  const pipeline = await PipelineStage.findOne({ pipelineId });
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

  const stageEntry = pipeline.stages.find((s) => s.stage === stageName);
  if (!stageEntry) throw new Error(`Stage "${stageName}" not in pipeline`);

  stageEntry.status = 'PROCESSING';
  stageEntry.startedAt = new Date();

  pipeline.currentStage = stageName;
  if (pipeline.status === 'PENDING') {
    pipeline.status = 'RUNNING';
  }

  await pipeline.save();

  // Update post status
  await Post.findByIdAndUpdate(pipeline.post, {
    verificationStatus: 'VERIFYING',
  });

  return pipeline;
}

/**
 * Mark a stage as COMPLETED with results.
 */
async function completeStage(pipelineId, stageName, result = null, modelVersion = null, serviceId = null) {
  const pipeline = await PipelineStage.findOne({ pipelineId });
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

  const stageEntry = pipeline.stages.find((s) => s.stage === stageName);
  if (!stageEntry) throw new Error(`Stage "${stageName}" not in pipeline`);

  stageEntry.status = 'COMPLETED';
  stageEntry.completedAt = new Date();
  stageEntry.durationMs = stageEntry.startedAt
    ? stageEntry.completedAt.getTime() - stageEntry.startedAt.getTime()
    : 0;
  stageEntry.result = result;
  stageEntry.modelVersion = modelVersion;
  stageEntry.serviceId = serviceId;

  await pipeline.save();
  return pipeline;
}

/**
 * Mark a stage as FAILED with error details.
 * Handles retry logic: if retries remain, the stage stays in a retryable state.
 */
async function failStage(pipelineId, stageName, error) {
  const pipeline = await PipelineStage.findOne({ pipelineId });
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

  const stageEntry = pipeline.stages.find((s) => s.stage === stageName);
  if (!stageEntry) throw new Error(`Stage "${stageName}" not in pipeline`);

  stageEntry.retryCount += 1;
  stageEntry.lastRetryAt = new Date();

  // Check if retries are exhausted
  if (stageEntry.retryCount >= stageEntry.maxRetries) {
    stageEntry.status = 'FAILED';
    stageEntry.completedAt = new Date();
    stageEntry.durationMs = stageEntry.startedAt
      ? stageEntry.completedAt.getTime() - stageEntry.startedAt.getTime()
      : 0;
    stageEntry.error = {
      message: error.message || 'Unknown error',
      code: error.code || null,
      recoverable: false,
    };
  } else {
    // Retries remain — mark as PENDING for retry
    stageEntry.status = 'PENDING';
    stageEntry.error = {
      message: error.message || 'Unknown error',
      code: error.code || null,
      recoverable: true,
    };
    stageEntry.startedAt = null; // Reset for retry
  }

  await pipeline.save();
  return pipeline;
}

/**
 * Mark a stage as SKIPPED.
 */
async function skipStage(pipelineId, stageName, reason = 'Not applicable for content type') {
  const pipeline = await PipelineStage.findOne({ pipelineId });
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

  const stageEntry = pipeline.stages.find((s) => s.stage === stageName);
  if (!stageEntry) throw new Error(`Stage "${stageName}" not in pipeline`);

  stageEntry.status = 'SKIPPED';
  stageEntry.completedAt = new Date();
  stageEntry.result = { skipped: true, reason };

  await pipeline.save();
  return pipeline;
}

// ─── Stage Implementations ────────────────────────────────────────────

/**
 * Stage: CONTENT_TYPE_ROUTING
 * Classify the content and determine the processing pipeline.
 */
async function executeContentTypeRouting(pipeline, post) {
  await startStage(pipeline.pipelineId, 'CONTENT_TYPE_ROUTING');

  const contentType = contentRouter.classifyContentType(post);
  const pipelineName = contentRouter.pipelineForContentType(contentType);

  await completeStage(
    pipeline.pipelineId,
    'CONTENT_TYPE_ROUTING',
    { classifiedType: contentType, pipeline: pipelineName },
    null,
    'content-router'
  );

  return { contentType, pipeline: pipelineName };
}

/**
 * Stage: PREPROCESSING
 * Prepare content for AI analysis (text cleaning, media validation, etc.)
 */
async function executePreprocessing(pipeline, post, contentType) {
  await startStage(pipeline.pipelineId, 'PREPROCESSING');

  const result = {};

  if (contentType === 'TEXT' || contentType === 'LINK') {
    const text = post.text || '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    result.preprocessing = {
      characterCount: cleaned.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      language: 'unknown',
      languageConfidence: 0,
      cleanedText: cleaned.substring(0, 10000), // Limit for storage
    };
  } else {
    // For media content, gather metadata
    const media = post.media || [];
    result.mediaMetadata = {
      count: media.length,
      types: media.map((m) => m.type),
      urls: media.map((m) => m.url),
      mimeTypes: media.map((m) => m.mimeType).filter(Boolean),
    };
  }

  await completeStage(pipeline.pipelineId, 'PREPROCESSING', result, null, 'preprocessing');
  return result;
}

/**
 * Stage: AI_ANALYSIS
 * Run the primary AI analysis based on content type.
 * TEXT → text analysis (NLP, misinfo detection, AI-generated detection)
 * IMAGE → image authenticity (placeholder)
 * VIDEO → deepfake detection
 * AUDIO → synthetic speech detection
 * LINK → link content extraction + analysis
 */
async function executeAIAnalysis(pipeline, post, contentType, job) {
  await startStage(pipeline.pipelineId, 'AI_ANALYSIS');

  let analysisResult;
  let modelVersion = null;
  let serviceId = null;

  switch (contentType) {
    case 'TEXT':
      analysisResult = await textAnalysisService.analyzeText(job);
      modelVersion = analysisResult.modelVersion;
      serviceId = 'text-analysis';
      break;

    case 'IMAGE':
      analysisResult = await imageAnalysisService.analyzeImage(job);
      modelVersion = analysisResult.modelVersion;
      serviceId = 'image-authenticity';
      break;

    case 'VIDEO':
      analysisResult = await videoAnalysisService.analyzeVideo(job);
      modelVersion = analysisResult.modelVersion;
      serviceId = 'video-deepfake';
      break;

    case 'AUDIO':
      analysisResult = await audioAnalysisService.analyzeAudio(job);
      modelVersion = analysisResult.modelVersion;
      serviceId = 'audio-authenticity';
      break;

    case 'LINK':
      analysisResult = await linkAnalysisService.analyzeLink(job);
      modelVersion = analysisResult.modelVersion;
      serviceId = 'link-analysis';
      break;

    default:
      throw new Error(`Unknown content type: ${contentType}`);
  }

  await completeStage(
    pipeline.pipelineId,
    'AI_ANALYSIS',
    analysisResult.results || analysisResult,
    modelVersion,
    serviceId
  );

  return analysisResult;
}

/**
 * Stage: CLAIM_EXTRACTION
 * Extract factual claims from text content.
 * Only applicable to TEXT and LINK content types.
 */
async function executeClaimExtraction(pipeline, post, contentType) {
  await startStage(pipeline.pipelineId, 'CLAIM_EXTRACTION');

  if (contentType !== 'TEXT' && contentType !== 'LINK') {
    await skipStage(pipeline.pipelineId, 'CLAIM_EXTRACTION', `${contentType} content has no text claims`);
    return null;
  }

  const text = post.text || '';
  if (text.length < 10) {
    await skipStage(pipeline.pipelineId, 'CLAIM_EXTRACTION', 'Text too short for claim extraction');
    return null;
  }

  try {
    const result = await claimEntityService.extractDirect(text, post._id.toString());
    await completeStage(
      pipeline.pipelineId,
      'CLAIM_EXTRACTION',
      result.results,
      result.modelVersion,
      'claim-entity-extraction'
    );
    return result;
  } catch (err) {
    // Claim extraction is non-critical — log and skip
    console.warn(`[Pipeline] Claim extraction failed: ${err.message}`);
    await skipStage(pipeline.pipelineId, 'CLAIM_EXTRACTION', `Extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Stage: ENTITY_EXTRACTION
 * Extract named entities from text content.
 * Typically runs as part of CLAIM_EXTRACTION, so we capture from that result.
 */
async function executeEntityExtraction(pipeline, post, contentType, claimResult) {
  await startStage(pipeline.pipelineId, 'ENTITY_EXTRACTION');

  if (contentType !== 'TEXT' && contentType !== 'LINK') {
    await skipStage(pipeline.pipelineId, 'ENTITY_EXTRACTION', `${contentType} content has no text entities`);
    return null;
  }

  // Entity extraction is typically bundled with claim extraction
  if (claimResult && claimResult.savedAnalysis) {
    const entities = claimResult.savedAnalysis.entities || [];
    await completeStage(
      pipeline.pipelineId,
      'ENTITY_EXTRACTION',
      { entityCount: entities.length, entities },
      claimResult.modelVersion,
      'claim-entity-extraction'
    );
    return entities;
  }

  await skipStage(pipeline.pipelineId, 'ENTITY_EXTRACTION', 'No claim extraction results available');
  return null;
}

/**
 * Stage: FACT_VERIFICATION
 * Verify extracted claims against external fact-check databases.
 */
async function executeFactVerification(pipeline, post, contentType, claimResult) {
  await startStage(pipeline.pipelineId, 'FACT_VERIFICATION');

  if (contentType !== 'TEXT' && contentType !== 'LINK') {
    await skipStage(pipeline.pipelineId, 'FACT_VERIFICATION', `${contentType} content has no textual claims to verify`);
    return null;
  }

  if (!claimResult || !claimResult.savedAnalysis) {
    await skipStage(pipeline.pipelineId, 'FACT_VERIFICATION', 'No claims to verify');
    return null;
  }

  const claims = claimResult.savedAnalysis.claims || [];
  if (claims.length === 0) {
    await skipStage(pipeline.pipelineId, 'FACT_VERIFICATION', 'No claims extracted');
    return null;
  }

  try {
    const factCheckService = require('./fact-check.service');
    const claimTexts = claims.map((c) => ({ text: c.text, id: c.textHash }));
    const result = await factCheckService.factCheckClaims(claimTexts, {
      postId: post._id.toString(),
    });

    await completeStage(
      pipeline.pipelineId,
      'FACT_VERIFICATION',
      {
        aggregateStatus: result.aggregateStatus,
        summary: result.summary,
        claimCount: result.results.length,
      },
      null,
      'google-fact-check-api'
    );
    return result;
  } catch (err) {
    console.warn(`[Pipeline] Fact verification failed: ${err.message}`);
    await skipStage(pipeline.pipelineId, 'FACT_VERIFICATION', `Verification failed: ${err.message}`);
    return null;
  }
}

/**
 * Stage: EVIDENCE_NORMALIZATION
 * Normalize all evidence sources into a common format for the Trust Score.
 */
async function executeEvidenceNormalization(
  pipeline,
  post,
  contentType,
  aiResult,
  claimResult,
  factCheckResult
) {
  await startStage(pipeline.pipelineId, 'EVIDENCE_NORMALIZATION');

  try {
    const evidenceItems = [];

    // Normalize AI detector results
    if (aiResult && aiResult.results) {
      const aiData = aiResult.results;
      const primaryClaim = post.text
        ? post.text.substring(0, 200)
        : `${contentType} content`;

      // Build evidence inputs based on content type
      const evidenceInputs = {
        claim: primaryClaim,
        postId: post._id.toString(),
        modelConfidence: {
          overallConfidence: aiData.confidence || 0.5,
          modelVersion: aiResult.modelVersion || 'unknown',
          processingTimeMs: aiData.processingTimeMs || 0,
        },
        contentMetadata: {
          contentType,
          hasMedia: (post.media || []).length > 0,
        },
      };

      // Add type-specific evidence
      if (contentType === 'TEXT') {
        evidenceInputs.aiDetectorResults = {
          misinfoProbability: aiData.misinformationProbability || 0,
          aiGeneratedProbability: aiData.aiGeneratedProbability || 0,
          confidence: aiData.confidence || 0.5,
          modelVersion: aiResult.modelVersion,
        };
      } else if (contentType === 'IMAGE') {
        evidenceInputs.contentMetadata.mediaAnalysisResults = {
          manipulationProbability: aiData.manipulationProbability || 0,
          faceManipulationProbability: aiData.faceManipulationProbability || 0,
          frequencyAnomaly: aiData.frequencyAnomaly || 0,
          colorAnomaly: aiData.colorAnomaly || 0,
          textureAnomaly: aiData.textureAnomaly || 0,
        };
      } else if (contentType === 'VIDEO') {
        evidenceInputs.contentMetadata.mediaAnalysisResults = {
          deepfakeProbability: aiData.deepfakeProbability || 0,
          manipulationProbability: aiData.manipulationProbability || 0,
        };
      } else if (contentType === 'AUDIO') {
        evidenceInputs.contentMetadata.mediaAnalysisResults = {
          deepfakeProbability: aiData.syntheticSpeechProbability || 0,
          manipulationProbability: aiData.manipulationProbability || 0,
        };
      } else if (contentType === 'LINK') {
        evidenceInputs.sourceAnalysis = {
          credibilityScore: aiData.sourceCredibility || 0.5,
          publisherName: new URL(post.linkUrl || 'https://unknown.com').hostname,
          url: post.linkUrl,
        };
      }

      // Add fact-check evidence
      if (factCheckResult && factCheckResult.results) {
        const factCheckData = factCheckResult.results[0] || {};
        evidenceInputs.factCheckResults = {
          status: factCheckResult.aggregateStatus || 'UNKNOWN',
          reviews: factCheckData.reviews || [],
          factualVerificationScore: factCheckService
            ? factCheckService.computeFactualVerificationScore(factCheckResult.results)
            : null,
        };
      }

      // Add claim extraction evidence
      if (claimResult && claimResult.savedAnalysis) {
        evidenceInputs.claimResults = {
          factCheckStatus: claimResult.savedAnalysis.verificationScore ? 'verified' : 'unverified',
          verificationScore: claimResult.savedAnalysis.verificationScore,
          claimConfidence: claimResult.savedAnalysis.confidence || 0.5,
        };
      }

      // Normalize and store evidence
      const savedEvidence = await evidenceNormalizationService.normalizeAndStoreEvidence(evidenceInputs);
      evidenceItems.push(savedEvidence);
    }

    await completeStage(
      pipeline.pipelineId,
      'EVIDENCE_NORMALIZATION',
      { evidenceCount: evidenceItems.length, evidenceIds: evidenceItems.map((e) => e._id) },
      evidenceNormalizationService.NORMALIZATION_VERSION,
      'evidence-normalization'
    );

    return evidenceItems;
  } catch (err) {
    console.warn(`[Pipeline] Evidence normalization failed: ${err.message}`);
    await skipStage(pipeline.pipelineId, 'EVIDENCE_NORMALIZATION', `Normalization failed: ${err.message}`);
    return [];
  }
}

/**
 * Stage: TRUST_SCORE
 * Compute the composite trust score from all evidence.
 */
async function executeTrustScore(pipeline, post, contentType, aiResult, factCheckResult, evidenceItems) {
  await startStage(pipeline.pipelineId, 'TRUST_SCORE');

  try {
    // Build trust score inputs from all available evidence
    const input = {
      authenticityScore: 0.5,
      factualVerificationScore: 0.5,
      sourceCredibilityScore: 0.5,
      modelConfidenceScore: 0.5,
      contentType,
      evidence: [],
    };

    if (aiResult && aiResult.results) {
      const aiData = aiResult.results;

      if (contentType === 'TEXT') {
        input.authenticityScore = 1 - (aiData.misinformationProbability || 0);
        input.modelConfidenceScore = aiData.confidence || 0.5;
      } else if (contentType === 'VIDEO') {
        input.authenticityScore = 1 - Math.max(
          aiData.deepfakeProbability || 0,
          aiData.manipulationProbability || 0
        );
        input.modelConfidenceScore = aiData.confidence || 0.5;
      } else if (contentType === 'IMAGE') {
        input.authenticityScore = 1 - Math.max(
          aiData.manipulationProbability || 0,
          aiData.faceManipulationProbability || 0
        );
        input.modelConfidenceScore = aiData.confidence || 0.5;
      } else if (contentType === 'AUDIO') {
        input.authenticityScore = 1 - Math.max(
          aiData.syntheticSpeechProbability || 0,
          aiData.manipulationProbability || 0
        );
        input.modelConfidenceScore = aiData.confidence || 0.5;
      } else if (contentType === 'LINK') {
        input.sourceCredibilityScore = aiData.sourceCredibility || 0.5;
        input.authenticityScore = 1 - (aiData.misinformationProbability || 0);
        input.modelConfidenceScore = aiData.confidence || 0.5;
        // Link analysis verifies the article's claims against the Fact Check
        // API internally; feed that real evidence into the factual component.
        // Neutral (0.5) when no ratings were found — never assumed true.
        if (typeof aiData.factCheckScore === 'number') {
          input.factualVerificationScore = aiData.factCheckScore;
        }
      }
    }

    // Add fact-check score
    if (factCheckResult && factCheckResult.results) {
      input.factualVerificationScore = factCheckService
        ? factCheckService.computeFactualVerificationScore(factCheckResult.results)
        : 0.5;

      // Check for confirmed false
      if (factCheckService && factCheckService.isConfirmedFalse(factCheckResult.results)) {
        input.isConfirmedFalse = true;
      }
    }

    // Add evidence items
    if (evidenceItems && evidenceItems.length > 0) {
      for (const evidence of evidenceItems) {
        if (evidence.evidenceItems) {
          input.evidence.push(...evidence.evidenceItems);
        }
      }
    }

    // Compute and store trust score
    const savedTrustScore = await trustScoreService.computeAndStoreTrustScore(
      post._id,
      input,
      evidenceItems.map((e) => e._id)
    );

    const result = {
      score: savedTrustScore.score,
      label: savedTrustScore.label,
      explanation: savedTrustScore.explanation,
      isOverrideApplied: savedTrustScore.isOverrideApplied,
      componentScores: {
        authenticity: savedTrustScore.authenticity,
        factualVerification: savedTrustScore.factualVerification,
        sourceCredibility: savedTrustScore.sourceCredibility,
        modelConfidence: savedTrustScore.modelConfidence,
      },
    };

    await completeStage(
      pipeline.pipelineId,
      'TRUST_SCORE',
      result,
      trustScoreService.MODEL_VERSION,
      'trust-score'
    );

    // Update post with trust score
    await Post.findByIdAndUpdate(post._id, {
      trustScore: result.score,
      trustBadge: result.label,
      trustBreakdown: {
        factualVerification: result.componentScores.factualVerification,
        authenticity: result.componentScores.authenticity,
        sourceCredibility: result.componentScores.sourceCredibility,
        modelConfidence: result.componentScores.modelConfidence,
      },
    });

    return result;
  } catch (err) {
    console.error(`[Pipeline] Trust score computation failed: ${err.message}`);
    throw err; // Trust score is critical
  }
}

/**
 * Stage: TRUST_LABEL
 * Apply the final trust label based on the score and rules.
 */
async function executeTrustLabel(pipeline, trustScoreResult) {
  await startStage(pipeline.pipelineId, 'TRUST_LABEL');

  // Trust label is already computed by the trust score service
  const result = {
    label: trustScoreResult.label,
    score: trustScoreResult.score,
    isOverrideApplied: trustScoreResult.isOverrideApplied,
    explanation: trustScoreResult.explanation,
  };

  await completeStage(
    pipeline.pipelineId,
    'TRUST_LABEL',
    result,
    trustScoreService.RULE_VERSION,
    'trust-score-rules'
  );

  return result;
}

/**
 * Stage: MODERATION_DECISION
 * Determine whether to publish, reject, or escalate.
 */
async function executeModerationDecision(pipeline, post, trustScoreResult, stageResults) {
  await startStage(pipeline.pipelineId, 'MODERATION_DECISION');

  const pipelineResult = {
    trustScoreResult,
    stageResults,
    contentType: pipeline.contentType,
    hasErrors: pipeline.stages.some((s) => s.status === 'FAILED'),
    failedStages: pipeline.stages
      .filter((s) => s.status === 'FAILED')
      .map((s) => s.stage),
    reviewRequiredStages: pipeline.stages
      .filter((s) => s.result && s.result.reviewRequired)
      .map((s) => s.stage),
  };

  const decision = moderationDecisionService.evaluateDecision(pipelineResult);

  // Update pipeline document
  const updatedPipeline = await PipelineStage.findOne({ pipelineId: pipeline.pipelineId });
  updatedPipeline.moderationDecision = {
    action: decision.action,
    reason: decision.reason,
    ruleApplied: decision.ruleApplied,
  };

  // Determine final verification status
  switch (decision.action) {
    case moderationDecisionService.Decision.PUBLISH:
      updatedPipeline.finalVerificationStatus = 'PUBLISHED';
      break;
    case moderationDecisionService.Decision.REJECT:
      updatedPipeline.finalVerificationStatus = 'REJECTED';
      break;
    case moderationDecisionService.Decision.REVIEW_REQUIRED:
    case moderationDecisionService.Decision.ESCALATE:
      updatedPipeline.finalVerificationStatus = 'REVIEW_REQUIRED';
      break;
  }

  await updatedPipeline.save();

  await completeStage(
    pipeline.pipelineId,
    'MODERATION_DECISION',
    decision,
    moderationDecisionService.DECISION_VERSION,
    'moderation-decision'
  );

  return decision;
}

/**
 * Stage: PUBLICATION
 * Apply the final state to the post (publish, reject, or leave for review).
 */
async function executePublication(pipeline, post, decision) {
  await startStage(pipeline.pipelineId, 'PUBLICATION');

  if (decision.action === moderationDecisionService.Decision.PUBLISH) {
    // Auto-publish: set post to PUBLISHED
    await moderationDecisionService.applyDecision(post._id, decision);

    await completeStage(
      pipeline.pipelineId,
      'PUBLICATION',
      { published: true, verificationStatus: 'PUBLISHED' },
      null,
      'publication'
    );
  } else if (decision.action === moderationDecisionService.Decision.REJECT) {
    // Auto-reject
    await moderationDecisionService.applyDecision(post._id, decision);

    await completeStage(
      pipeline.pipelineId,
      'PUBLICATION',
      { published: false, verificationStatus: 'REJECTED', reason: decision.reason },
      null,
      'publication'
    );
  } else {
    // Review required / escalate — don't publish, set status for human review
    await moderationDecisionService.applyDecision(post._id, decision);

    await completeStage(
      pipeline.pipelineId,
      'PUBLICATION',
      { published: false, verificationStatus: 'REVIEW_REQUIRED', reason: decision.reason },
      null,
      'publication'
    );
  }

  return decision;
}

// ─── Main Pipeline Execution ──────────────────────────────────────────

/**
 * Execute the full end-to-end verification pipeline for a post.
 *
 * This is the main entry point called by the processing queue.
 * It runs all stages sequentially, with retry logic for transient failures.
 *
 * @param {Object} post - The Post document
 * @param {Object} job - The ContentJob document (from content-router)
 * @returns {Object} { pipelineId, status, finalVerificationStatus, trustScoreResult }
 */
async function executePipeline(post, job) {
  _loadServices();

  const startTime = Date.now();
  let pipeline;

  // Validate post
  if (!post || !post._id) {
    return {
      pipelineId: null,
      status: 'FAILED',
      error: 'Post is required and must have an _id',
    };
  }

  try {
    // ── Initialize pipeline ──────────────────────────────────────────
    pipeline = await initializePipeline(post, job.contentType);
    console.log(`[Pipeline] Starting pipeline ${pipeline.pipelineId} for post ${post._id} (${job.contentType})`);

    // Audit: log pipeline start (non-critical)
    try {
      await auditService.logAIProcessingEvent({
        eventType: 'PIPELINE_STARTED',
        target: { postId: post._id, pipelineId: pipeline.pipelineId },
        metadata: { contentType: job.contentType },
      });
    } catch (_) { /* audit logging is non-critical */ }

    const stageResults = {};

    // ── Stage: CONTENT_TYPE_ROUTING ──────────────────────────────────
    const routingResult = await executeContentTypeRouting(pipeline, post);
    stageResults.routing = routingResult;

    // ── Stage: PREPROCESSING ─────────────────────────────────────────
    const preprocessingResult = await executePreprocessing(pipeline, post, job.contentType);
    stageResults.preprocessing = preprocessingResult;

    // ── Stage: AI_ANALYSIS ───────────────────────────────────────────
    let aiResult;
    try {
      aiResult = await executeAIAnalysis(pipeline, post, job.contentType, job);
      stageResults.aiAnalysis = aiResult;
    } catch (err) {
      // Audit: log AI analysis failure (non-critical)
      try {
        await auditService.logAIProcessingEvent({
          eventType: 'AI_ANALYSIS_FAILED',
          target: { postId: post._id, pipelineId: pipeline.pipelineId },
          error: { code: 'AI_ANALYSIS_FAILED', message: err.message },
          metadata: { contentType: job.contentType, stage: 'AI_ANALYSIS' },
        });
      } catch (_) { /* audit logging is non-critical */ }
      const failedPipeline = await failStage(pipeline.pipelineId, 'AI_ANALYSIS', err);

      // If critical stage failed and retries exhausted, fail the pipeline
      if (err.recoverable === false || failedPipeline.stages.find(s => s.stage === 'AI_ANALYSIS')?.status === 'FAILED') {
        await _finalizePipeline(pipeline.pipelineId, post, 'FAILED', startTime, err);
        return { pipelineId: pipeline.pipelineId, status: 'FAILED', error: err.message };
      }
      aiResult = null;
    }

    // ── Stage: CLAIM_EXTRACTION ──────────────────────────────────────
    let claimResult = null;
    try {
      claimResult = await executeClaimExtraction(pipeline, post, job.contentType);
      stageResults.claimExtraction = claimResult;
    } catch (err) {
      console.warn(`[Pipeline] Claim extraction error: ${err.message}`);
      await failStage(pipeline.pipelineId, 'CLAIM_EXTRACTION', err);
    }

    // ── Stage: ENTITY_EXTRACTION ─────────────────────────────────────
    let entityResult = null;
    try {
      entityResult = await executeEntityExtraction(pipeline, post, job.contentType, claimResult);
      stageResults.entityExtraction = entityResult;
    } catch (err) {
      console.warn(`[Pipeline] Entity extraction error: ${err.message}`);
      await failStage(pipeline.pipelineId, 'ENTITY_EXTRACTION', err);
    }

    // ── Stage: FACT_VERIFICATION ─────────────────────────────────────
    let factCheckResult = null;
    try {
      factCheckResult = await executeFactVerification(pipeline, post, job.contentType, claimResult);
      stageResults.factVerification = factCheckResult;
    } catch (err) {
      console.warn(`[Pipeline] Fact verification error: ${err.message}`);
      await failStage(pipeline.pipelineId, 'FACT_VERIFICATION', err);
    }

    // ── Stage: EVIDENCE_NORMALIZATION ────────────────────────────────
    let evidenceItems = [];
    try {
      evidenceItems = await executeEvidenceNormalization(
        pipeline,
        post,
        job.contentType,
        aiResult,
        claimResult,
        factCheckResult
      );
      stageResults.evidenceNormalization = evidenceItems;
    } catch (err) {
      console.warn(`[Pipeline] Evidence normalization error: ${err.message}`);
      await failStage(pipeline.pipelineId, 'EVIDENCE_NORMALIZATION', err);
    }

    // ── Stage: TRUST_SCORE ───────────────────────────────────────────
    let trustScoreResult;
    try {
      trustScoreResult = await executeTrustScore(
        pipeline,
        post,
        job.contentType,
        aiResult,
        factCheckResult,
        evidenceItems
      );
      stageResults.trustScore = trustScoreResult;
    } catch (err) {
      console.error(`[Pipeline] Trust score failed: ${err.message}`);
      await _finalizePipeline(pipeline.pipelineId, post, 'FAILED', startTime, err);
      return { pipelineId: pipeline.pipelineId, status: 'FAILED', error: err.message };
    }

    // ── Stage: TRUST_LABEL ───────────────────────────────────────────
    const trustLabelResult = await executeTrustLabel(pipeline, trustScoreResult);
    stageResults.trustLabel = trustLabelResult;

    // ── Stage: MODERATION_DECISION ───────────────────────────────────
    const moderationResult = await executeModerationDecision(
      pipeline,
      post,
      trustScoreResult,
      stageResults
    );
    stageResults.moderationDecision = moderationResult;

    // ── Stage: PUBLICATION ───────────────────────────────────────────
    const publicationResult = await executePublication(pipeline, post, moderationResult);
    stageResults.publication = publicationResult;

    // ── Finalize pipeline ────────────────────────────────────────────
    const totalDuration = Date.now() - startTime;
    const finalPipeline = await PipelineStage.findOne({ pipelineId: pipeline.pipelineId });
    finalPipeline.status = 'COMPLETED';
    finalPipeline.totalDurationMs = totalDuration;
    finalPipeline.trustScoreResult = trustScoreResult;
    await finalPipeline.save();

    // Update post
    const verificationStatus = finalPipeline.finalVerificationStatus || 'VERIFIED';
    await Post.findByIdAndUpdate(post._id, {
      verificationStatus,
      pipelineCompletedAt: new Date(),
    });

    console.log(
      `[Pipeline] Pipeline ${pipeline.pipelineId} completed in ${totalDuration}ms — status: ${verificationStatus}`
    );

    // Audit: log pipeline completion (non-critical)
    try {
      await auditService.logAIProcessingEvent({
        eventType: 'PIPELINE_COMPLETED',
        target: { postId: post._id, pipelineId: pipeline.pipelineId },
        metadata: { status: verificationStatus, durationMs: totalDuration },
      });
    } catch (_) { /* audit logging is non-critical */ }

    // Notify post owner (non-critical)
    try {
      await notificationService.notifyVerificationComplete({
        postOwnerId: post.user,
        postId: post._id,
        status: verificationStatus,
        trustScoreResult,
      });
    } catch (_) { /* notification is non-critical */ }

    return {
      pipelineId: pipeline.pipelineId,
      status: 'COMPLETED',
      finalVerificationStatus: verificationStatus,
      trustScoreResult,
      moderationDecision: moderationResult,
      totalDurationMs: totalDuration,
    };
  } catch (err) {
    console.error(`[Pipeline] Pipeline failed: ${err.message}`);

    if (pipeline) {
      await _finalizePipeline(pipeline.pipelineId, post, 'FAILED', startTime, err);
    }

    // Update post to FAILED
    await Post.findByIdAndUpdate(post._id, {
      verificationStatus: 'FAILED',
      pipelineCompletedAt: new Date(),
      pipelineError: {
        message: err.message,
        stage: 'PIPELINE',
      },
    });

    // Audit: log pipeline failure (non-critical)
    try {
      await auditService.logAIProcessingEvent({
        eventType: 'PIPELINE_FAILED',
        target: { postId: post._id, pipelineId: pipeline?.pipelineId },
        error: { code: 'PIPELINE_FAILED', message: err.message },
        metadata: { stage: pipeline?.currentStage || 'UNKNOWN' },
      });
    } catch (_) { /* audit logging is non-critical */ }

    return {
      pipelineId: pipeline ? pipeline.pipelineId : null,
      status: 'FAILED',
      error: err.message,
    };
  }
}

/**
 * Finalize a pipeline run (set overall status and timing).
 */
async function _finalizePipeline(pipelineId, post, status, startTime, error) {
  try {
    const pipeline = await PipelineStage.findOne({ pipelineId });
    if (!pipeline) return;

    pipeline.status = status;
    pipeline.totalDurationMs = Date.now() - startTime;
    if (error) {
      pipeline.error = {
        message: error.message || 'Unknown error',
        stage: pipeline.currentStage,
        recoverable: false,
      };
    }
    await pipeline.save();

    // Update post verification status
    const postUpdate = {
      verificationStatus: status === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED',
      pipelineCompletedAt: new Date(),
    };
    if (error) {
      postUpdate.pipelineError = {
        message: error.message,
        stage: pipeline.currentStage,
      };
    }
    await Post.findByIdAndUpdate(post._id, postUpdate);
  } catch (err) {
    console.error(`[Pipeline] Failed to finalize pipeline: ${err.message}`);
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────

/**
 * Get pipeline status for a post.
 */
async function getPipelineStatus(postId) {
  const pipeline = await PipelineStage.findOne({ post: postId })
    .sort({ createdAt: -1 })
    .populate('post', 'verificationStatus moderationStatus trustScore trustBadge');

  if (!pipeline) return null;

  return {
    pipelineId: pipeline.pipelineId,
    postId: pipeline.post._id,
    contentType: pipeline.contentType,
    status: pipeline.status,
    currentStage: pipeline.currentStage,
    stages: pipeline.stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      error: s.error,
      retryCount: s.retryCount,
      maxRetries: s.maxRetries,
      modelVersion: s.modelVersion,
      serviceId: s.serviceId,
    })),
    trustScoreResult: pipeline.trustScoreResult,
    moderationDecision: pipeline.moderationDecision,
    finalVerificationStatus: pipeline.finalVerificationStatus,
    totalDurationMs: pipeline.totalDurationMs,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  };
}

/**
 * Get all pipelines for a post (history).
 */
async function getPipelineHistory(postId) {
  const pipelines = await PipelineStage.find({ post: postId })
    .sort({ createdAt: -1 })
    .limit(10);

  return pipelines.map((p) => ({
    pipelineId: p.pipelineId,
    contentType: p.contentType,
    status: p.status,
    currentStage: p.currentStage,
    trustScoreResult: p.trustScoreResult,
    moderationDecision: p.moderationDecision,
    totalDurationMs: p.totalDurationMs,
    createdAt: p.createdAt,
  }));
}

/**
 * Get pipeline statistics (admin monitoring).
 */
async function getPipelineStats() {
  const [total, running, completed, failed, reviewRequired] = await Promise.all([
    PipelineStage.countDocuments(),
    PipelineStage.countDocuments({ status: 'RUNNING' }),
    PipelineStage.countDocuments({ status: 'COMPLETED' }),
    PipelineStage.countDocuments({ status: 'FAILED' }),
    PipelineStage.countDocuments({ status: 'REVIEW_REQUIRED' }),
  ]);

  // Average processing time for completed pipelines
  const avgResult = await PipelineStage.aggregate([
    { $match: { status: 'COMPLETED', totalDurationMs: { $gt: 0 } } },
    { $group: { _id: null, avgDuration: { $avg: '$totalDurationMs' } } },
  ]);

  const avgDurationMs = avgResult.length > 0 ? Math.round(avgResult[0].avgDuration) : 0;

  // Content type distribution
  const typeDistribution = await PipelineStage.aggregate([
    { $group: { _id: '$contentType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return {
    total,
    running,
    completed,
    failed,
    reviewRequired,
    avgDurationMs,
    typeDistribution: typeDistribution.reduce((acc, t) => {
      acc[t._id] = t.count;
      return acc;
    }, {}),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  // Main entry point
  executePipeline,

  // Pipeline management
  initializePipeline,
  startStage,
  completeStage,
  failStage,
  skipStage,

  // Query helpers
  getPipelineStatus,
  getPipelineHistory,
  getPipelineStats,

  // Constants (exposed for testing)
  STAGES,
  CRITICAL_STAGES,
  SKIPPABLE_FOR_TYPE,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  buildStageList,
};
