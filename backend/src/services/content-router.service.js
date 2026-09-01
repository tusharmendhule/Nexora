/**
 * Content Router Service
 * ======================
 * Classifies incoming content into a ContentType and routes it
 * to the correct AI processing pipeline.
 *
 * Content types: TEXT, IMAGE, VIDEO, AUDIO, LINK
 * Pipelines:     nlp, image_authenticity, video_deepfake,
 *                audio_authenticity, link_extraction
 */

const ContentJob = require('../models/content-job.model');
const { ApiError } = require('../middleware/error.middleware');

// ─── Content type detection ───────────────────────────────────────

/**
 * Determine the primary content type from a post document.
 *
 * Priority:
 *   1. Explicit contentType field on the post
 *   2. Inferred from media array (first item)
 *   3. linkUrl present → LINK
 *   4. Fallback → TEXT
 */
function classifyContentType(post) {
  // 1. Explicit type
  if (post.contentType) {
    const explicit = post.contentType.toUpperCase();
    if (['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'LINK'].includes(explicit)) {
      return explicit;
    }
  }

  // 2. From media
  if (post.media && post.media.length > 0) {
    const first = post.media[0];
    const mediaType = (first.type || '').toUpperCase();
    if (['IMAGE', 'VIDEO', 'AUDIO'].includes(mediaType)) {
      return mediaType;
    }
  }

  // 3. Link
  if (post.linkUrl) {
    return 'LINK';
  }

  // 4. Fallback
  return 'TEXT';
}

/**
 * Map a content type to its processing pipeline.
 */
function pipelineForContentType(contentType) {
  const mapping = {
    TEXT: 'nlp',
    IMAGE: 'image_authenticity',
    VIDEO: 'video_deepfake',
    AUDIO: 'audio_authenticity',
    LINK: 'link_extraction',
    CLAIM_ENTITY: 'claim_entity_extraction',
  };
  return mapping[contentType] || 'nlp';
}

// ─── Job creation ─────────────────────────────────────────────────

/**
 * Create a processing job for a post.
 * Returns the newly created ContentJob document.
 */
async function createJob(post) {
  const { v4: uuidv4 } = require('uuid');
  const contentType = classifyContentType(post);
  const pipeline = pipelineForContentType(contentType);

  const job = await ContentJob.create({
    jobId: uuidv4(),
    post: post._id,
    contentType,
    pipeline,
    status: 'PENDING',
    contentReference: {
      url: (post.media && post.media[0] && post.media[0].url) || post.linkUrl || null,
      mimeType: (post.media && post.media[0] && post.media[0].mimeType) || null,
      fileSize: (post.media && post.media[0] && post.media[0].fileSize) || null,
    },
  });

  return job;
}

// ─── Job lifecycle helpers ────────────────────────────────────────

/**
 * Mark a job as PROCESSING.
 */
async function markProcessing(jobId) {
  return ContentJob.findOneAndUpdate(
    { jobId },
    { status: 'PROCESSING', startedAt: new Date() },
    { new: true }
  );
}

/**
 * Mark a job as COMPLETED with results.
 */
async function markCompleted(jobId, results, modelVersion) {
  return ContentJob.findOneAndUpdate(
    { jobId },
    {
      status: 'COMPLETED',
      results,
      modelVersion,
      completedAt: new Date(),
    },
    { new: true }
  );
}

/**
 * Mark a job as FAILED with error details.
 */
async function markFailed(jobId, error) {
  return ContentJob.findOneAndUpdate(
    { jobId },
    {
      status: 'FAILED',
      error: {
        message: error.message || 'Unknown error',
        code: error.code || null,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : null,
      },
      completedAt: new Date(),
    },
    { new: true }
  );
}

/**
 * Mark a job as REVIEW_REQUIRED.
 */
async function markReviewRequired(jobId, results) {
  return ContentJob.findOneAndUpdate(
    { jobId },
    {
      status: 'REVIEW_REQUIRED',
      results,
      completedAt: new Date(),
    },
    { new: true }
  );
}

// ─── Query helpers ────────────────────────────────────────────────

/**
 * Get a job by its UUID.
 */
async function getJobById(jobId) {
  return ContentJob.findOne({ jobId }).populate('post');
}

/**
 * Get all jobs for a given post.
 */
async function getJobsForPost(postId) {
  return ContentJob.find({ post: postId }).sort({ createdAt: -1 });
}

/**
 * Get pending jobs (for queue processing).
 */
async function getPendingJobs(limit = 10) {
  return ContentJob.find({ status: 'PENDING' })
    .sort({ createdAt: 1 })
    .limit(limit);
}

module.exports = {
  classifyContentType,
  pipelineForContentType,
  createJob,
  markProcessing,
  markCompleted,
  markFailed,
  markReviewRequired,
  getJobById,
  getJobsForPost,
  getPendingJobs,
};
