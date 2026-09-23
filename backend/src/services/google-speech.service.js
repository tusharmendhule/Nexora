/**
 * Google Cloud Speech-to-Text Service
 * ===================================
 * Real integration with the Google Cloud Speech-to-Text API
 * (https://cloud.google.com/speech-to-text).
 *
 * Speech transcription is kept strictly SEPARATE from synthetic-audio
 * detection: this service only produces the transcript, which is then handed
 * to Gemini for claim extraction / context and to Google Fact Check for
 * factual verification.
 *
 * Two supported request shapes:
 *   1. gs://<bucket>/<object>            -> longRunningRecognize
 *   2. Public HTTPS URL (e.g. Cloudinary)
 *        - file <= MAX_INLINE_BYTES       -> synchronous recognize (inline bytes)
 *        - larger, with a bucket configured -> upload to GCS then
 *          longRunningRecognize
 *        - larger, without a bucket        -> reported UNAVAILABLE (never faked)
 *
 * Honest-by-design (spec: no fake data): when credentials are missing, or the
 * API fails, the service returns { available: false, reason, detail } and the
 * pipeline must NOT invent a transcript.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const {
  resolveCredentials,
  clientOptions,
  getStorageBucket,
} = require('./google-cloud-config.service');

// ─── Configuration ────────────────────────────────────────────────────

const MODEL_VERSION = 'nexora-gcp-speech-v1.0.0';
const DOWNLOAD_TIMEOUT_MS = 120000;

// Synchronous recognize accepts up to ~1 minute of audio / 10MB inline.
const MAX_INLINE_BYTES = 10 * 1024 * 1024;

const DEFAULT_LANGUAGE = 'en-US';

// Lazily created client so a missing dependency or bad credentials never
// crashes module load.
let _client = null;
let _clientError = null;

function getClient() {
  if (_client) return _client;
  if (_clientError) throw _clientError;
  try {
    // eslint-disable-next-line global-require
    const { SpeechClient } = require('@google-cloud/speech');
    _client = new SpeechClient(clientOptions());
    return _client;
  } catch (err) {
    _clientError = new Error(`Google Cloud Speech client unavailable: ${err.message}`);
    throw _clientError;
  }
}

// ─── Availability ─────────────────────────────────────────────────────

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

// ─── Encoding mapping ─────────────────────────────────────────────────

/**
 * Map a media file extension to a Google Speech AudioEncoding value.
 * Returns null when the API can auto-detect (e.g. WAV / FLAC headers).
 */
function encodingForExtension(ext) {
  const normalized = (ext || '').toLowerCase().replace('.', '');
  switch (normalized) {
    case 'mp3':
      return 'MP3';
    case 'ogg':
    case 'opus':
      return 'OGG_OPUS';
    case 'flac':
      return 'FLAC';
    case 'wav':
      return 'LINEAR16';
    case 'amr':
      return 'AMR';
    case 'awb':
      return 'AMR_WB';
    case 'mulaw':
      return 'MULAW';
    default:
      return null;
  }
}

function extensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    return path.extname(parsed.pathname);
  } catch (_) {
    return path.extname(url || '');
  }
}

// ─── Normalization ────────────────────────────────────────────────────

/** Convert a protobuf Duration ({seconds, nanos}) to seconds. */
function durationToSeconds(duration) {
  if (!duration) return 0;
  const seconds = Number(duration.seconds || 0);
  const nanos = Number(duration.nanos || 0);
  return Math.round((seconds + nanos / 1e9) * 1000) / 1000;
}

/**
 * Flatten a Speech-to-Text response into the Nexora transcript shape.
 * Real API output only — no synthesized text.
 */
function normalizeResponse(response) {
  const results = response?.results || [];
  const parts = [];
  const words = [];
  const segments = [];
  let languageCode = null;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const result of results) {
    const alternative = result.alternatives?.[0];
    if (!alternative) continue;

    if (alternative.transcript) parts.push(alternative.transcript.trim());
    if (!languageCode && result.languageCode) languageCode = result.languageCode;
    if (typeof alternative.confidence === 'number' && alternative.confidence > 0) {
      confidenceSum += alternative.confidence;
      confidenceCount += 1;
    }

    const resultWords = [];
    for (const w of alternative.words || []) {
      const entry = {
        word: w.word,
        startTime: durationToSeconds(w.startTime),
        endTime: durationToSeconds(w.endTime),
      };
      words.push(entry);
      resultWords.push(entry);
    }

    if (resultWords.length > 0) {
      segments.push({
        startTime: resultWords[0].startTime,
        endTime: resultWords[resultWords.length - 1].endTime,
        text: alternative.transcript?.trim() || '',
        confidence:
          typeof alternative.confidence === 'number'
            ? Math.round(alternative.confidence * 10000) / 10000
            : null,
      });
    }
  }

  const transcript = parts.filter(Boolean).join(' ').trim();

  return {
    transcript,
    languageCode,
    confidence:
      confidenceCount > 0
        ? Math.round((confidenceSum / confidenceCount) * 10000) / 10000
        : null,
    words,
    segments,
    wordCount: words.length,
  };
}

// ─── Input preparation ────────────────────────────────────────────────

function cleanup(tempFile) {
  if (!tempFile) return;
  try {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  } catch (_) {
    /* best-effort temp cleanup */
  }
}

async function downloadToTemp(mediaUrl) {
  const tempFile = path.join(
    os.tmpdir(),
    `nexora_stt_${Date.now()}_${Math.floor(Math.random() * 1e6)}${extensionFromUrl(mediaUrl)}`
  );
  const response = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
  });
  const buffer = Buffer.from(response.data);
  fs.writeFileSync(tempFile, buffer);
  return { tempFile, buffer };
}

/**
 * Upload a local file to Cloud Storage and return a gs:// URI.
 * Only attempted when GOOGLE_CLOUD_STORAGE_BUCKET is configured.
 */
async function uploadToGcs(localFile, objectName) {
  const bucketName = getStorageBucket();
  if (!bucketName) {
    throw new Error('GOOGLE_CLOUD_STORAGE_BUCKET is not configured');
  }
  // eslint-disable-next-line global-require
  const { Storage } = require('@google-cloud/storage');
  const storage = new Storage(clientOptions());
  const destination = objectName || `nexora-media/${path.basename(localFile)}`;

  await storage.bucket(bucketName).upload(localFile, {
    destination,
    resumable: false,
  });

  return {
    uri: `gs://${bucketName}/${destination}`,
    cleanup: async () => {
      try {
        await storage.bucket(bucketName).file(destination).delete();
      } catch (_) {
        /* best-effort cleanup */
      }
    },
  };
}

// ─── Main transcription ───────────────────────────────────────────────

/**
 * Build a RecognitionConfig for the given media.
 */
function buildConfig(mediaUrl, options) {
  const ext = extensionFromUrl(mediaUrl);
  const encoding = encodingForExtension(ext);

  const config = {
    languageCode: options.languageCode || DEFAULT_LANGUAGE,
    enableAutomaticPunctuation: options.enableAutomaticPunctuation !== false,
    model: options.model || 'latest_short',
  };

  // Only set encoding when we can map it; otherwise let the API auto-detect.
  if (encoding) config.encoding = encoding;
  if (options.sampleRateHertz) config.sampleRateHertz = options.sampleRateHertz;

  return config;
}

/**
 * Transcribe audio from a public HTTPS URL or a gs:// URI.
 *
 * @param {string} mediaUrl - HTTPS URL or gs:// URI
 * @param {Object} [options] - { languageCode, sampleRateHertz, model }
 * @returns {Object} { available, transcript, ... } or { available:false, reason, detail }
 */
async function transcribe(mediaUrl, options = {}) {
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

  const startTime = Date.now();

  // ── gs:// input → long-running recognition ──────────────────────────
  if (/^gs:\/\//i.test(mediaUrl)) {
    return longRunningFromUri(mediaUrl, options, startTime);
  }

  // ── HTTPS input → download, then inline sync or GCS long-running ────
  let downloaded;
  try {
    downloaded = await downloadToTemp(mediaUrl);
  } catch (err) {
    return {
      available: false,
      reason: 'download_failed',
      detail: err.message,
      modelVersion: MODEL_VERSION,
    };
  }

  try {
    const { tempFile, buffer } = downloaded;

    if (buffer.length <= MAX_INLINE_BYTES) {
      return await recognizeInline(buffer, mediaUrl, options, startTime);
    }

    // Too large for inline sync recognition.
    if (!getStorageBucket()) {
      return {
        available: false,
        reason: 'media_too_large_for_inline_request',
        detail:
          `Audio is ${(buffer.length / (1024 * 1024)).toFixed(1)}MB, above the ` +
          '10MB synchronous limit. Configure GOOGLE_CLOUD_STORAGE_BUCKET so the ' +
          'file can be uploaded for long-running recognition, or supply a gs:// URI.',
        modelVersion: MODEL_VERSION,
      };
    }

    const uploaded = await uploadToGcs(tempFile);
    try {
      const result = await longRunningFromUri(uploaded.uri, options, startTime);
      return result;
    } finally {
      await uploaded.cleanup();
    }
  } catch (err) {
    return {
      available: false,
      reason: classifyError(err),
      detail: err.message,
      processingTimeMs: Date.now() - startTime,
      modelVersion: MODEL_VERSION,
    };
  } finally {
    cleanup(downloaded.tempFile);
  }
}

/**
 * Synchronous recognition of inline audio bytes (<= ~1 minute).
 */
async function recognizeInline(buffer, mediaUrl, options, startTime) {
  try {
    const client = getClient();
    const [response] = await client.recognize({
      config: buildConfig(mediaUrl, options),
      audio: { content: buffer },
    });

    return {
      available: true,
      reason: null,
      detail: null,
      ...normalizeResponse(response),
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
  }
}

/**
 * Long-running recognition of a Cloud Storage object.
 */
async function longRunningFromUri(uri, options, startTime = Date.now()) {
  try {
    const client = getClient();
    const config = buildConfig(uri, options);
    // Long-running recognition uses the long-form model.
    config.model = options.model || 'latest_long';

    const [operation] = await client.longRunningRecognize({
      config,
      audio: { uri },
    });
    const [response] = await operation.promise();

    return {
      available: true,
      reason: null,
      detail: null,
      ...normalizeResponse(response),
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
  }
}

/**
 * Map a Google API error to a machine-readable code.
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
  transcribe,
  getAvailability,
  isConfigured: () => getAvailability().available,
  encodingForExtension,
  normalizeResponse,
  MODEL_VERSION,
  MAX_INLINE_BYTES,
  // exposed for tests
  classifyError,
  durationToSeconds,
};
