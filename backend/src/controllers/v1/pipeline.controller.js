/**
 * Pipeline Controller
 * ===================
 * Endpoints for querying pipeline status, history, and statistics.
 *
 * GET /api/v1/pipeline/:postId       — get current pipeline status for a post
 * GET /api/v1/pipeline/:postId/history — get pipeline run history
 * GET /api/v1/pipeline/stats          — get pipeline statistics (admin)
 * POST /api/v1/pipeline/retry/:postId — re-trigger pipeline for a failed post
 */

const pipelineOrchestrator = require('../../services/pipeline-orchestrator.service');
const contentRouter = require('../../services/content-router.service');
const processingQueue = require('../../services/processing-queue.service');
const Post = require('../../models/post.model');
const { ApiError } = require('../../middleware/error.middleware');

// ─── GET /api/v1/pipeline/:postId ────────────────────────────────────

/**
 * Get the current pipeline status for a post.
 * Returns the full pipeline stage breakdown with per-stage timing,
 * errors, retry counts, and model versions.
 */
exports.getPipelineStatus = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const pipelineStatus = await pipelineOrchestrator.getPipelineStatus(postId);

    if (!pipelineStatus) {
      return res.status(200).json({
        success: true,
        pipeline: null,
        post: {
          verificationStatus: post.verificationStatus,
          moderationStatus: post.moderationStatus,
          trustScore: post.trustScore,
          trustBadge: post.trustBadge,
        },
        message: 'No pipeline run found for this post',
      });
    }

    res.status(200).json({
      success: true,
      pipeline: pipelineStatus,
      post: {
        verificationStatus: post.verificationStatus,
        moderationStatus: post.moderationStatus,
        trustScore: post.trustScore,
        trustBadge: post.trustBadge,
        trustBreakdown: post.trustBreakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/pipeline/:postId/history ─────────────────────────────

/**
 * Get pipeline run history for a post (last 10 runs).
 */
exports.getPipelineHistory = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    const history = await pipelineOrchestrator.getPipelineHistory(postId);

    res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/pipeline/stats ───────────────────────────────────────

/**
 * Get pipeline statistics (admin monitoring).
 * Returns aggregate metrics: total runs, avg duration, status distribution,
 * content type distribution.
 */
exports.getPipelineStats = async (req, res, next) => {
  try {
    const stats = await pipelineOrchestrator.getPipelineStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/pipeline/retry/:postId ──────────────────────────────

/**
 * Re-trigger the pipeline for a failed or rejected post.
 * Creates a new ContentJob and enqueues it for processing.
 */
exports.retryPipeline = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Only allow retry for failed, rejected, or review_required posts
    const retryableStatuses = ['FAILED', 'REJECTED', 'REVIEW_REQUIRED', 'failed'];
    if (!retryableStatuses.includes(post.verificationStatus)) {
      throw new ApiError(
        400,
        `Cannot retry pipeline for post with status "${post.verificationStatus}". Only FAILED, REJECTED, or REVIEW_REQUIRED posts can be retried.`
      );
    }

    // Reset post status
    await Post.findByIdAndUpdate(postId, {
      verificationStatus: 'PENDING_VERIFICATION',
      moderationStatus: 'pending',
      pipelineError: null,
    });

    // Create a new content job
    const job = await contentRouter.createJob(post);

    // Enqueue for background processing
    await processingQueue.enqueueJob(job);

    res.status(202).json({
      success: true,
      message: 'Pipeline retry queued',
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

// ─── GET /api/v1/pipeline/stages ──────────────────────────────────────

/**
 * Get the list of all pipeline stages (for UI display / documentation).
 */
exports.getPipelineStages = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      stages: pipelineOrchestrator.STAGES,
      criticalStages: Array.from(pipelineOrchestrator.CRITICAL_STAGES),
      skippableForType: pipelineOrchestrator.SKIPPABLE_FOR_TYPE,
    });
  } catch (error) {
    next(error);
  }
};
