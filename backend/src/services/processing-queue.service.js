/**
 * Processing Queue Service
 * ========================
 * Lightweight in-process job queue for content processing.
 * Uses the Pipeline Orchestrator to run the full verification pipeline.
 *
 * Designed to be later swapped out for Bull/Redis or any
 * external job queue without changing callers.
 *
 * Processes jobs sequentially in the background
 * using setImmediate / setTimeout to avoid blocking the
 * main HTTP event loop.
 */

const contentRouter = require('./content-router.service');
const pipelineOrchestrator = require('./pipeline-orchestrator.service');

// ─── Queue state ──────────────────────────────────────────────────────

let _processing = false;
let _drainTimer = null;
const DRAIN_INTERVAL_MS = 5000; // check for pending jobs every 5s

// ─── Queue processing loop ────────────────────────────────────────────

/**
 * Process the next batch of pending jobs using the pipeline orchestrator.
 */
async function processNextBatch() {
  if (_processing) return; // already running
  _processing = true;

  try {
    const pendingJobs = await contentRouter.getPendingJobs(5);

    for (const job of pendingJobs) {
      try {
        // Mark as processing in the content-router model
        await contentRouter.markProcessing(job.jobId);

        // Load the post
        const Post = require('../models/post.model');
        const post = await Post.findById(job.post);
        if (!post) {
          console.error(`[Queue] Post not found for job ${job.jobId}, skipping`);
          await contentRouter.markFailed(job.jobId, new Error('Post not found'));
          continue;
        }

        // Execute the full pipeline
        const result = await pipelineOrchestrator.executePipeline(post, job);

        if (result.status === 'COMPLETED') {
          // Update the content-router job with results
          await contentRouter.markCompleted(
            job.jobId,
            {
              pipelineId: result.pipelineId,
              finalVerificationStatus: result.finalVerificationStatus,
              trustScore: result.trustScoreResult?.score,
              trustLabel: result.trustScoreResult?.label,
              moderationDecision: result.moderationDecision?.action,
            },
            result.trustScoreResult?.label ? `nexora-pipeline-v1.0.0` : null
          );

          console.log(
            `[Queue] Job ${job.jobId} (${job.contentType}) completed via pipeline — status: ${result.finalVerificationStatus}`
          );
        } else {
          // Pipeline failed
          await contentRouter.markFailed(
            job.jobId,
            new Error(result.error || 'Pipeline failed')
          );

          console.error(
            `[Queue] Job ${job.jobId} (${job.contentType}) failed: ${result.error}`
          );
        }
      } catch (err) {
        console.error(`[Queue] Job ${job.jobId} failed:`, err.message);
        await contentRouter.markFailed(job.jobId, err);
      }
    }
  } catch (err) {
    console.error('[Queue] Batch processing error:', err.message);
  } finally {
    _processing = false;
  }
}

// ─── Queue control ────────────────────────────────────────────────────

/**
 * Start the background drain loop.
 */
function startDrainLoop() {
  if (_drainTimer) return;
  console.log('[Queue] Starting background drain loop');
  _drainTimer = setInterval(processNextBatch, DRAIN_INTERVAL_MS);
  // Run immediately once
  processNextBatch();
}

/**
 * Stop the background drain loop.
 */
function stopDrainLoop() {
  if (_drainTimer) {
    clearInterval(_drainTimer);
    _drainTimer = null;
    console.log('[Queue] Stopped drain loop');
  }
}

/**
 * Enqueue a job for immediate processing (bypasses drain timer).
 */
async function enqueueJob(job) {
  console.log(`[Queue] Enqueuing job ${job.jobId} (${job.contentType})`);
  // Process immediately in the next tick (non-blocking)
  setImmediate(async () => {
    try {
      await contentRouter.markProcessing(job.jobId);

      // Load the post
      const Post = require('../models/post.model');
      const post = await Post.findById(job.post);
      if (!post) {
        console.error(`[Queue] Post not found for job ${job.jobId}`);
        await contentRouter.markFailed(job.jobId, new Error('Post not found'));
        return;
      }

      // Execute the full pipeline
      const result = await pipelineOrchestrator.executePipeline(post, job);

      if (result.status === 'COMPLETED') {
        await contentRouter.markCompleted(
          job.jobId,
          {
            pipelineId: result.pipelineId,
            finalVerificationStatus: result.finalVerificationStatus,
            trustScore: result.trustScoreResult?.score,
            trustLabel: result.trustScoreResult?.label,
            moderationDecision: result.moderationDecision?.action,
          },
          result.trustScoreResult?.label ? `nexora-pipeline-v1.0.0` : null
        );

        console.log(`[Queue] Job ${job.jobId} completed — status: ${result.finalVerificationStatus}`);
      } else {
        await contentRouter.markFailed(
          job.jobId,
          new Error(result.error || 'Pipeline failed')
        );
        console.error(`[Queue] Job ${job.jobId} failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`[Queue] Job ${job.jobId} failed:`, err.message);
      await contentRouter.markFailed(job.jobId, err);
    }
  });
}

/**
 * Get queue status (for monitoring).
 */
function getQueueStatus() {
  return {
    processing: _drainTimer !== null,
    drainIntervalMs: DRAIN_INTERVAL_MS,
  };
}

module.exports = {
  startDrainLoop,
  stopDrainLoop,
  enqueueJob,
  processNextBatch,
  getQueueStatus,
};
