/**
 * Content Pipeline Controller
 * ===========================
 * Exposes endpoints for:
 *   - Triggering content analysis
 *   - Querying job status
 *   - Retrieving analysis results
 *   - Viewing queue health
 */

const contentRouter = require('../../services/content-router.service');
const textAnalysisService = require('../../services/text-analysis.service');
const videoAnalysisService = require('../../services/video-analysis.service');
const audioAnalysisService = require('../../services/audio-analysis.service');
const linkAnalysisService = require('../../services/link-analysis.service');
const claimEntityService = require('../../services/claim-entity-extraction.service');
const processingQueue = require('../../services/processing-queue.service');
const Post = require('../../models/post.model');
const { ApiError } = require('../../middleware/error.middleware');

// ─── POST /api/v1/content/analyze/:postId ─────────────────────────

/**
 * Trigger content analysis for an existing post.
 * Creates a ContentJob and enqueues it for background processing.
 */
exports.triggerAnalysis = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Check if there's already an active (non-failed) job for this post
    const existingJobs = await contentRouter.getJobsForPost(postId);
    const activeJob = existingJobs.find(
      (j) => j.status === 'PENDING' || j.status === 'PROCESSING'
    );

    if (activeJob) {
      return res.status(200).json({
        success: true,
        message: 'Analysis already in progress',
        job: activeJob,
      });
    }

    // Create a new job
    const job = await contentRouter.createJob(post);

    // Enqueue for background processing (non-blocking)
    await processingQueue.enqueueJob(job);

    res.status(202).json({
      success: true,
      message: 'Content analysis queued',
      job: {
        jobId: job.jobId,
        contentType: job.contentType,
        pipeline: job.pipeline,
        status: job.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/content/jobs/:jobId ──────────────────────────────

/**
 * Get the status and results of a specific processing job.
 */
exports.getJobStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await contentRouter.getJobById(jobId);
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    res.status(200).json({
      success: true,
      job: {
        jobId: job.jobId,
        post: job.post ? job.post._id : job.post,
        contentType: job.contentType,
        pipeline: job.pipeline,
        status: job.status,
        modelVersion: job.modelVersion,
        results: job.results,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/content/jobs/post/:postId ────────────────────────

/**
 * Get all processing jobs for a given post.
 */
exports.getJobsForPost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const jobs = await contentRouter.getJobsForPost(postId);

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs: jobs.map((j) => ({
        jobId: j.jobId,
        contentType: j.contentType,
        pipeline: j.pipeline,
        status: j.status,
        modelVersion: j.modelVersion,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/content/analysis/:postId ─────────────────────────

/**
 * Get the stored analysis results for a post (text and/or video).
 */
exports.getAnalysisResults = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const [textAnalysis, videoAnalysis, audioAnalysis, linkAnalysis, claimEntityAnalysis] = await Promise.all([
      textAnalysisService.getAnalysisForPost(postId),
      videoAnalysisService.getAnalysisForPost(postId),
      audioAnalysisService.getAnalysisForPost(postId),
      linkAnalysisService.getAnalysisForPost(postId),
      claimEntityService.getExtractionForPost(postId),
    ]);

    if (!textAnalysis && !videoAnalysis && !audioAnalysis && !linkAnalysis && !claimEntityAnalysis) {
      return res.status(200).json({
        success: true,
        analysis: null,
        message: 'No analysis results available yet',
      });
    }

    res.status(200).json({
      success: true,
      analysis: {
        text: textAnalysis
          ? {
              id: textAnalysis._id,
              post: textAnalysis.post,
              preprocessing: textAnalysis.preprocessing,
              misinformationProbability: textAnalysis.misinformationProbability,
              aiGeneratedProbability: textAnalysis.aiGeneratedProbability,
              claims: textAnalysis.claims,
              entities: textAnalysis.entities,
              confidence: textAnalysis.confidence,
              modelVersion: textAnalysis.modelVersion,
              processingTimeMs: textAnalysis.processingTimeMs,
              errors: textAnalysis.errors,
              createdAt: textAnalysis.createdAt,
            }
          : null,
        video: videoAnalysis
          ? {
              id: videoAnalysis._id,
              post: videoAnalysis.post,
              mediaUrl: videoAnalysis.mediaUrl,
              deepfakeProbability: videoAnalysis.deepfakeProbability,
              manipulationProbability: videoAnalysis.manipulationProbability,
              frameCount: videoAnalysis.frameCount,
              analyzedFrames: videoAnalysis.analyzedFrames,
              faceDetectionRate: videoAnalysis.faceDetectionRate,
              temporalConsistency: videoAnalysis.temporalConsistency,
              confidence: videoAnalysis.confidence,
              modelVersion: videoAnalysis.modelVersion,
              processingTimeMs: videoAnalysis.processingTimeMs,
              errors: videoAnalysis.errors,
              createdAt: videoAnalysis.createdAt,
            }
          : null,
        audio: audioAnalysis
          ? {
              id: audioAnalysis._id,
              post: audioAnalysis.post,
              mediaUrl: audioAnalysis.mediaUrl,
              syntheticSpeechProbability: audioAnalysis.syntheticSpeechProbability,
              manipulationProbability: audioAnalysis.manipulationProbability,
              spectralFeatures: audioAnalysis.spectralFeatures,
              melSpectrogramStats: audioAnalysis.melSpectrogramStats,
              segments: audioAnalysis.segments,
              confidence: audioAnalysis.confidence,
              modelVersion: audioAnalysis.modelVersion,
              processingTimeMs: audioAnalysis.processingTimeMs,
              errors: audioAnalysis.errors,
              createdAt: audioAnalysis.createdAt,
            }
          : null,
        link: linkAnalysis
          ? {
              id: linkAnalysis._id,
              post: linkAnalysis.post,
              originalUrl: linkAnalysis.originalUrl,
              resolvedUrl: linkAnalysis.resolvedUrl,
              httpStatus: linkAnalysis.httpStatus,
              pageTitle: linkAnalysis.pageTitle,
              metaDescription: linkAnalysis.metaDescription,
              misinformationProbability: linkAnalysis.misinformationProbability,
              sourceCredibility: linkAnalysis.sourceCredibility,
              claims: linkAnalysis.claims,
              entities: linkAnalysis.entities,
              factCheckResults: linkAnalysis.factCheckResults,
              confidence: linkAnalysis.confidence,
              finalScore: linkAnalysis.finalScore,
              modelVersion: linkAnalysis.modelVersion,
              processingTimeMs: linkAnalysis.processingTimeMs,
              errors: linkAnalysis.errors,
              createdAt: linkAnalysis.createdAt,
            }
          : null,
        claimsEntities: claimEntityAnalysis
          ? {
              id: claimEntityAnalysis._id,
              post: claimEntityAnalysis.post,
              status: claimEntityAnalysis.status,
              claims: claimEntityAnalysis.claims,
              entities: claimEntityAnalysis.entities,
              preprocessing: claimEntityAnalysis.preprocessing,
              confidence: claimEntityAnalysis.confidence,
              verificationScore: claimEntityAnalysis.verificationScore,
              modelVersion: claimEntityAnalysis.modelVersion,
              processingTimeMs: claimEntityAnalysis.processingTimeMs,
              errors: claimEntityAnalysis.errors,
              createdAt: claimEntityAnalysis.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/content/queue/status ─────────────────────────────

/**
 * Get queue health / status (admin).
 */
exports.getQueueStatus = async (req, res, next) => {
  try {
    const queueStatus = processingQueue.getQueueStatus();

    // Count jobs by status
    const ContentJob = require('../../models/content-job.model');
    const [pending, processing, completed, failed] = await Promise.all([
      ContentJob.countDocuments({ status: 'PENDING' }),
      ContentJob.countDocuments({ status: 'PROCESSING' }),
      ContentJob.countDocuments({ status: 'COMPLETED' }),
      ContentJob.countDocuments({ status: 'FAILED' }),
    ]);

    res.status(200).json({
      success: true,
      queue: queueStatus,
      counts: { pending, processing, completed, failed },
    });
  } catch (error) {
    next(error);
  }
};
