/**
 * Google Cloud Video Intelligence Service
 * =======================================
 * Real integration with the Google Cloud Video Intelligence API
 * (https://cloud.google.com/video-intelligence).
 *
 * Analysis is performed at frame, shot and segment level — never a single
 * frame — using:
 *   - LABEL_DETECTION             (segment / shot / frame labels)
 *   - SHOT_CHANGE_DETECTION       (shot boundaries)
 *   - TEXT_DETECTION              (on-screen OCR text)
 *   - OBJECT_TRACKING             (objects across the timeline)
 *   - SPEECH_TRANSCRIPTION        (spoken-word transcript of the audio track)
 *   - EXPLICIT_CONTENT_DETECTION  (likelihood per frame)
 *
 * Honest-by-design (spec: no fake data):
 *   - When service-account credentials are absent the service returns
 *     { available: false, reason: 'not_configured' } and the pipeline treats
 *     the signal as UNAVAILABLE. It never invents labels, OCR text,
 *     transcripts or probabilities.
 *   - When the API errors (auth, quota, timeout, 5xx) the error is surfaced
 *     with a machine-readable code so the Trust Score can account for the
 *     missing evidence.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const {
  resolveCredentials,
  clientOptions,
} = require('./google-cloud-config.service');

// ─── Configuration ────────────────────────────────────────────────────

const MODEL_VERSION = 'nexora-gcp-video-intelligence-v1.0.0';
const API_TIMEOUT_MS = 10 * 60 * 1000; // operation poll budget
const DOWNLOAD_TIMEOUT_MS = 120000;

// Inline content is limited by the API to ~20MB.
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const FEATURES = [
  'LABEL_DETECTION',
  'SHOT_CHANGE_DETECTION',
  'TEXT_DETECTION',
  'OBJECT_TRACKING',
  'SPEECH_TRANSCRIPTION',
  'EXPLICIT_CONTENT_DETECTION',
];

// Lazily created client so a missing dependency or bad credentials never
// crashes module load.
let _client = null;
let _clientError = null;

function getClient() {
  if (_client) return _client;
  if (_clientError) throw _clientError;
  try {
    // eslint-disable-next-line global-require
    const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');
    _client = new VideoIntelligenceServiceClient(clientOptions());
    return _client;
  } catch (err) {
    _clientError = new Error(
      `Google Cloud Video Intelligence client unavailable: ${err.message}`
    );
    throw _clientError;
  }
}

// ─── Availability ─────────────────────────────────────────────────────

/**
 * Report whether this service can actually be called.
 */
function getAvailability() {
  const resolved = resolveCredentials();
  if (!resolved.configured) {
    return {
      available: false,
      reason: 'not_configured',
      detail: resolved.reason,
      modelVersion: MODEL_VERSION,
    };
  }
  return { available: true, reason: null, detail: null, modelVersion: MODEL_VERSION };
}

// ─── Input preparation ────────────────────────────────────────────────

/**
 * Prepare the API input.
 *
 * The API accepts a `gs://` URI, or inline bytes for files <= 20MB. Public
 * HTTPS URLs (e.g. Cloudinary) are downloaded and, when small enough, sent
 * as inline content. Larger non-GCS media cannot be analysed without a
 * Storage bucket — that is reported honestly rather than silently skipped.
 *
 * @returns {{ inputUri?: string, inputContent?: Buffer, tempFile?: string }}
 */
async function prepareInput(mediaUrl) {
  if (/^gs:\/\//i.test(mediaUrl)) {
    return { inputUri: mediaUrl };
  }

  const tempFile = path.join(
    os.tmpdir(),
    `nexora_vi_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  );

  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_INLINE_BYTES,
      maxBodyLength: MAX_INLINE_BYTES,
    });
    const buffer = Buffer.from(response.data);
    fs.writeFileSync(tempFile, buffer);
    if (buffer.length > MAX_INLINE_BYTES) {
      return { tempFile, tooLarge: true, bytes: buffer.length };
    }
    return { inputContent: buffer, tempFile };
  } catch (err) {
    cleanup(tempFile);
    throw new Error(`Failed to download video for Video Intelligence: ${err.message}`);
  }
}

function cleanup(tempFile) {
  if (!tempFile) return;
  try {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  } catch (_) {
    /* temp cleanup is best-effort */
  }
}

// ─── Normalization helpers ────────────────────────────────────────────

/** Convert a protobuf Duration ({seconds, nanos}) to seconds. */
function durationToSeconds(duration) {
  if (!duration) return 0;
  const seconds = Number(duration.seconds || 0);
  const nanos = Number(duration.nanos || 0);
  return Math.round((seconds + nanos / 1e9) * 1000) / 1000;
}

/** Parse a protobuf Timestamp ({seconds, nanos}) to milliseconds since epoch. */
function timestampToMs(ts) {
  if (!ts) return null;
  const seconds = Number(ts.seconds || 0);
  const nanos = Number(ts.nanos || 0);
  return seconds * 1000 + Math.round(nanos / 1e6);
}

/**
 * Merge label annotations from segment/shot/frame levels into a single
 * de-duplicated list ordered by confidence. Real API output only.
 */
function normalizeLabels(annotation) {
  const byName = new Map();
  const sources = [
    annotation.segmentLabelAnnotations || [],
    annotation.shotLabelAnnotations || [],
    annotation.frameLabelAnnotations || [],
  ];

  for (const group of sources) {
    for (const label of group) {
      const name = label.entity?.description;
      if (!name) continue;
      const confidence = Number(label.confidence || 0);
      const existing = byName.get(name);
      if (!existing || confidence > existing.confidence) {
        byName.set(name, {
          name,
          confidence: Math.round(confidence * 10000) / 10000,
          level:
            group === annotation.segmentLabelAnnotations
              ? 'SEGMENT'
              : group === annotation.shotLabelAnnotations
                ? 'SHOT'
                : 'FRAME',
          categoryEntities: (label.categoryEntities || []).map((c) => c.description).filter(Boolean),
        });
      }
    }
  }

  return Array.from(byName.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50);
}

/** Normalize shot-change detection output. */
function normalizeShots(annotation) {
  return (annotation.shotAnnotations || []).map((shot) => ({
    startTime: durationToSeconds(shot.startTimeOffset),
    endTime: durationToSeconds(shot.endTimeOffset),
  }));
}

/** Normalize on-screen OCR output (TEXT_DETECTION). */
function normalizeTextDetections(annotation) {
  return (annotation.textAnnotations || []).map((t) => ({
    text: t.text || '',
    segments: (t.segments || []).map((seg) => ({
      startTime: durationToSeconds(seg.segment?.startTimeOffset),
      endTime: durationToSeconds(seg.segment?.endTimeOffset),
      confidence: Number(seg.confidence || 0),
      frames: (seg.frames || []).map((f) => ({
        timeOffset: durationToSeconds(f.timeOffset),
      })),
    })),
  }));
}

/** Normalize object tracking output. */
function normalizeObjects(annotation) {
  return (annotation.objectAnnotations || []).map((obj) => ({
    name: obj.entity?.description || null,
    confidence: Number(obj.confidence || 0),
    frames: (obj.frames || []).map((f) => ({
      timeOffset: durationToSeconds(f.timeOffset),
      normalizedBoundingBox: f.normalizedBoundingBox
        ? {
            left: Number(f.normalizedBoundingBox.left || 0),
            top: Number(f.normalizedBoundingBox.top || 0),
            right: Number(f.normalizedBoundingBox.right || 0),
            bottom: Number(f.normalizedBoundingBox.bottom || 0),
          }
        : null,
    })),
  }));
}

/** Normalize the speech transcript of the video's audio track. */
function normalizeSpeechTranscription(annotation) {
  const transcriptions = annotation.speechTranscriptions || [];
  if (transcriptions.length === 0) {
    return { transcript: '', languageCode: null, confidence: null, words: [], available: false };
  }

  const parts = [];
  const words = [];
  let languageCode = null;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const t of transcriptions) {
    for (const alt of t.alternatives || []) {
      if (alt.transcript) parts.push(alt.transcript.trim());
      if (!languageCode && t.languageCode) languageCode = t.languageCode;
      if (typeof alt.confidence === 'number') {
        confidenceSum += alt.confidence;
        confidenceCount += 1;
      }
      for (const w of alt.words || []) {
        words.push({
          word: w.word,
          startTime: durationToSeconds(w.startTime),
          endTime: durationToSeconds(w.endTime),
        });
      }
    }
  }

  return {
    transcript: parts.filter(Boolean).join(' ').trim(),
    languageCode,
    confidence: confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 10000) / 10000 : null,
    words,
    available: parts.some(Boolean),
  };
}

/** Normalize explicit-content likelihood per frame. */
function normalizeExplicitContent(annotation) {
  const frames = annotation.explicitAnnotation?.frames || [];
  const likelihoodCounts = {};
  const samples = [];

  for (const frame of frames) {
    const likelihood = frame.pornographyLikelihood;
    const label = likelihoodName(likelihood);
    likelihoodCounts[label] = (likelihoodCounts[label] || 0) + 1;
    if (samples.length < 50) {
      samples.push({
        timeOffset: durationToSeconds(frame.timeOffset),
        pornographyLikelihood: label,
      });
    }
  }

  return { likelihoodCounts, samples, frameCount: frames.length };
}

function likelihoodName(value) {
  const LIKE = {
    0: 'UNKNOWN',
    1: 'VERY_UNLIKELY',
    2: 'UNLIKELY',
    3: 'POSSIBLE',
    4: 'LIKELY',
    5: 'VERY_LIKELY',
  };
  return typeof value === 'number' ? LIKE[value] || String(value) : String(value ?? 'UNKNOWN');
}

/** Build the combined on-screen + spoken text used for claim extraction. */
function combinedText(normalized) {
  const ocrText = (normalized.textDetections || [])
    .map((t) => t.text)
    .filter(Boolean)
    .join(' ');
  const speech = normalized.speechTranscription?.transcript || '';
  return { ocrText: ocrText.trim(), speechText: speech.trim() };
}

// ─── Main analysis ────────────────────────────────────────────────────

/**
 * Analyse a video with the Google Cloud Video Intelligence API.
 *
 * @param {string} mediaUrl - Public HTTPS URL or gs:// URI
 * @param {Object} [options] - { languageCode }
 * @returns {Object} Normalized annotations, or { available:false, reason, detail }
 */
async function analyzeVideo(mediaUrl, options = {}) {
  const availability = getAvailability();
  if (!availability.available) {
    return {
      available: false,
      reason: availability.reason,
      detail: availability.detail,
      modelVersion: MODEL_VERSION,
    };
  }

  if (!mediaUrl || typeof mediaUrl !== 'string') {
    return {
      available: false,
      reason: 'invalid_input',
      detail: 'mediaUrl must be a non-empty string',
      modelVersion: MODEL_VERSION,
    };
  }

  let prepared;
  try {
    prepared = await prepareInput(mediaUrl);
  } catch (err) {
    return {
      available: false,
      reason: 'download_failed',
      detail: err.message,
      modelVersion: MODEL_VERSION,
    };
  }

  if (prepared.tooLarge) {
    cleanup(prepared.tempFile);
    return {
      available: false,
      reason: 'media_too_large_for_inline_request',
      detail:
        `Video is ${(prepared.bytes / (1024 * 1024)).toFixed(1)}MB, above the ` +
        '20MB inline limit. Provide a gs:// URI or configure ' +
        'GOOGLE_CLOUD_STORAGE_BUCKET for larger media.',
      modelVersion: MODEL_VERSION,
    };
  }

  const startTime = Date.now();

  try {
    const client = getClient();

    const request = {
      features: FEATURES,
      videoContext: {
        speechTranscriptionConfig: {
          languageCode: options.languageCode || 'en-US',
          enableAutomaticPunctuation: true,
        },
        textDetectionConfig: {
          languageHints: [options.textLanguageHint || 'en'],
        },
      },
    };
    if (prepared.inputUri) {
      request.inputUri = prepared.inputUri;
    } else {
      request.inputContent = prepared.inputContent;
    }

    const [operation] = await client.annotateVideo(request, {
      // The operation itself is polled by the client; guard the overall wait.
      timeout: API_TIMEOUT_MS,
    });
    const [result] = await operation.promise();

    const annotation = result?.annotationResults?.[0] || {};

    const normalized = {
      labels: normalizeLabels(annotation),
      shots: normalizeShots(annotation),
      textDetections: normalizeTextDetections(annotation),
      objects: normalizeObjects(annotation),
      speechTranscription: normalizeSpeechTranscription(annotation),
      explicitContent: normalizeExplicitContent(annotation),
      error: annotation.error
        ? { code: annotation.error.code, message: annotation.error.message }
        : null,
    };

    const text = combinedText(normalized);

    return {
      available: true,
      reason: null,
      detail: null,
      ...normalized,
      ocrText: text.ocrText,
      speechText: text.speechText,
      processingTimeMs: Date.now() - startTime,
      modelVersion: MODEL_VERSION,
    };
  } catch (err) {
    return {
      available: false,
      reason: classifyError(err),
      detail: err.message,
      processingTimeMs: Date.now() - startTime,
      modelVersion: MODEL_VERSION,
    };
  } finally {
    cleanup(prepared.tempFile);
  }
}

/**
 * Map a Google API error to a machine-readable code so the Trust Score engine
 * can account for the missing signal.
 */
function classifyError(err) {
  const code = err?.code;
  const status = err?.response?.status || err?.status;
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'timeout';
  }
  if (status === 401 || status === 403 || code === 16 || code === 7) {
    return 'authentication_failed';
  }
  if (status === 429 || code === 8) return 'quota_exceeded';
  if (status >= 500 || code === 13 || code === 14) return 'service_unavailable';
  if (code === 3 || status === 400) return 'invalid_request';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return 'unavailable';
  return 'api_error';
}

module.exports = {
  analyzeVideo,
  getAvailability,
  isConfigured: () => getAvailability().available,
  FEATURES,
  MODEL_VERSION,
  // exposed for tests
  durationToSeconds,
  timestampToMs,
  normalizeLabels,
  normalizeShots,
  normalizeTextDetections,
  normalizeSpeechTranscription,
  normalizeExplicitContent,
  classifyError,
};
