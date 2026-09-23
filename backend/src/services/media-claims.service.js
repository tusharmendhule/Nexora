/**
 * Media Claims Service
 * ====================
 * Extracts text and factual claims from IMAGE / VIDEO / AUDIO media so they
 * can be verified by Google Fact Check exactly like text posts.
 *
 * Pipelines (spec §7, §10–§13):
 *
 *   IMAGE  → Gemini multimodal (OCR + understanding) → claims
 *   VIDEO  → Google Cloud Video Intelligence (labels, shots, on-screen OCR,
 *            object tracking, speech transcription) → Gemini (claims)
 *            and, when available, Speech-to-Text for the audio track
 *   AUDIO  → Google Cloud Speech-to-Text (transcript) → Gemini (claims)
 *
 * Honest-by-design (spec §31): each provider reports whether it was actually
 * used. A provider that is not configured, or that failed, contributes NO
 * claims and is recorded as an unavailable signal — nothing is fabricated.
 *
 * Note: speech transcription is kept separate from synthetic-audio /
 * manipulation detection, which stays in the authenticity services.
 */

const geminiService = require('./gemini-analysis.service');
const videoIntelligenceService = require('./google-video-intelligence.service');
const speechService = require('./google-speech.service');
const claimClassifier = require('./claim-classifier.service');
const factCheckService = require('./fact-check.service');
const ClaimEntity = require('../models/claim-entity.model');

const MODEL_VERSION = 'nexora-media-claims-v1.0.0';

// ─── Signal helpers ───────────────────────────────────────────────────

function signal(name, available, reason = null, detail = null, modelVersion = null) {
  return { name, available: !!available, reason, detail, modelVersion };
}

/**
 * Normalize claims returned by Gemini so downstream stages see a consistent
 * shape. Adds the originating source so evidence stays attributable.
 */
function tagClaims(claims, source) {
  return (claims || [])
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .map((c) => ({
      text: c.text.trim(),
      subject: c.subject || null,
      predicate: c.predicate || null,
      object: c.object || null,
      canVerify: c.canVerify ?? true,
      source,
    }));
}

// ─── Image ────────────────────────────────────────────────────────────

/**
 * Extract visible text and factual claims from an image using Gemini's
 * multimodal understanding (real OCR by the model, using GEMINI_API_KEY).
 */
async function extractFromImage({ mediaUrl, postId = null, caption = null }) {
  const signals = [];
  const modelVersions = {};

  if (!mediaUrl) {
    return {
      available: false,
      contentType: 'IMAGE',
      claims: [],
      extractedText: '',
      signals: [signal('gemini_image_understanding', false, 'no_media_url')],
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  const result = await geminiService.analyzeImageWithGemini(mediaUrl, { postId, caption });

  if (result.status !== 'COMPLETED' || !result.result) {
    signals.push(
      signal(
        'gemini_image_understanding',
        false,
        result.errorCode ? String(result.errorCode).toLowerCase() : result.status.toLowerCase(),
        result.error || result.message || null,
        geminiService.GEMINI_MODEL
      )
    );
    return {
      available: false,
      contentType: 'IMAGE',
      claims: [],
      extractedText: '',
      gemini: result,
      signals,
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  const gem = result.result;
  modelVersions.gemini = gem.modelVersion || geminiService.GEMINI_MODEL;
  signals.push(signal('gemini_image_understanding', true, null, null, modelVersions.gemini));

  const claims = tagClaims(gem.claims, 'gemini_image');

  return {
    available: claims.length > 0 || !!gem.extractedText,
    contentType: 'IMAGE',
    extractedText: gem.extractedText || '',
    description: gem.description || '',
    claims,
    claimContentType: gem.contentType || 'OTHER',
    opinionProbability: gem.opinionProbability ?? null,
    satireProbability: gem.satireProbability ?? null,
    editedProbability: gem.editedProbability ?? null,
    contextConcerns: gem.contextConcerns || [],
    confidence: gem.confidence ?? null,
    gemini: result,
    signals,
    modelVersions,
    modelVersion: MODEL_VERSION,
  };
}

// ─── Video ────────────────────────────────────────────────────────────

/**
 * Extract text (on-screen OCR + speech transcript) and factual claims from a
 * video using Google Cloud Video Intelligence, with Speech-to-Text for the
 * audio track when Video Intelligence is unavailable.
 */
async function extractFromVideo({ mediaUrl, postId = null, caption = null }) {
  const signals = [];
  const modelVersions = {};

  if (!mediaUrl) {
    return {
      available: false,
      contentType: 'VIDEO',
      claims: [],
      extractedText: '',
      signals: [signal('google_video_intelligence', false, 'no_media_url')],
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  let ocrText = '';
  let speechText = '';
  let videoIntelligence = null;
  let speech = null;

  // ── Video Intelligence: frames/shots/labels/OCR/objects/transcript ──
  videoIntelligence = await videoIntelligenceService.analyzeVideo(mediaUrl);

  if (videoIntelligence.available) {
    modelVersions.videoIntelligence = videoIntelligence.modelVersion;
    signals.push(
      signal('google_video_intelligence', true, null, null, videoIntelligence.modelVersion)
    );
    ocrText = videoIntelligence.ocrText || '';
    speechText = videoIntelligence.speechTranscription?.transcript || '';
  } else {
    signals.push(
      signal(
        'google_video_intelligence',
        false,
        videoIntelligence.reason,
        videoIntelligence.detail,
        videoIntelligence.modelVersion
      )
    );
  }

  // ── Speech-to-Text fallback for the audio track ────────────────────
  // Only used when Video Intelligence did not already transcribe the audio
  // (and never run in parallel with it).
  if (!speechText) {
    speech = await speechService.transcribe(mediaUrl);
    if (speech.available && speech.transcript) {
      modelVersions.speech = speech.modelVersion;
      speechText = speech.transcript;
      signals.push(signal('google_speech_to_text', true, null, null, speech.modelVersion));
    } else {
      signals.push(
        signal('google_speech_to_text', false, speech.reason, speech.detail, speech.modelVersion)
      );
    }
  }

  const combinedText = [ocrText, speechText].filter(Boolean).join('\n').trim();

  if (!combinedText) {
    return {
      available: false,
      contentType: 'VIDEO',
      claims: [],
      extractedText: '',
      ocrText,
      transcript: speechText,
      videoIntelligence,
      speech,
      signals,
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  // ── Gemini: understand the extracted text + extract claims ──────────
  const geminiResult = await geminiService.analyzeTranscriptWithGemini(combinedText, {
    postId,
    source: 'video',
    caption,
  });

  if (geminiResult.status !== 'COMPLETED' || !geminiResult.result) {
    signals.push(
      signal(
        'gemini_video_claims',
        false,
        geminiResult.errorCode ? String(geminiResult.errorCode).toLowerCase() : geminiResult.status.toLowerCase(),
        geminiResult.error || geminiResult.message || null,
        geminiService.GEMINI_MODEL
      )
    );
    return {
      available: false,
      contentType: 'VIDEO',
      claims: [],
      extractedText: combinedText,
      ocrText,
      transcript: speechText,
      videoIntelligence,
      speech,
      gemini: geminiResult,
      signals,
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  const gem = geminiResult.result;
  modelVersions.gemini = gem.modelVersion || geminiService.GEMINI_MODEL;
  signals.push(signal('gemini_video_claims', true, null, null, modelVersions.gemini));

  const claims = tagClaims(gem.claims, 'gemini_video');

  return {
    available: true,
    contentType: 'VIDEO',
    extractedText: combinedText,
    ocrText,
    transcript: speechText,
    labels: videoIntelligence?.labels || [],
    shots: videoIntelligence?.shots || [],
    objects: videoIntelligence?.objects || [],
    claimContentType: gem.contentType || 'OTHER',
    opinionProbability: gem.opinionProbability ?? null,
    satireProbability: gem.satireProbability ?? null,
    editedProbability: gem.editedProbability ?? null,
    contextConcerns: gem.contextConcerns || [],
    confidence: gem.confidence ?? null,
    claims,
    videoIntelligence,
    speech,
    gemini: geminiResult,
    signals,
    modelVersions,
    modelVersion: MODEL_VERSION,
  };
}

// ─── Audio ────────────────────────────────────────────────────────────

/**
 * Transcribe audio with Google Cloud Speech-to-Text and extract claims.
 */
async function extractFromAudio({ mediaUrl, postId = null, caption = null }) {
  const signals = [];
  const modelVersions = {};

  if (!mediaUrl) {
    return {
      available: false,
      contentType: 'AUDIO',
      claims: [],
      extractedText: '',
      signals: [signal('google_speech_to_text', false, 'no_media_url')],
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  const speech = await speechService.transcribe(mediaUrl);

  if (!speech.available || !speech.transcript) {
    signals.push(
      signal('google_speech_to_text', false, speech.reason, speech.detail, speech.modelVersion)
    );
    return {
      available: false,
      contentType: 'AUDIO',
      claims: [],
      extractedText: '',
      transcript: '',
      speech,
      signals,
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  modelVersions.speech = speech.modelVersion;
  signals.push(signal('google_speech_to_text', true, null, null, speech.modelVersion));

  const geminiResult = await geminiService.analyzeTranscriptWithGemini(speech.transcript, {
    postId,
    source: 'audio',
    caption,
  });

  if (geminiResult.status !== 'COMPLETED' || !geminiResult.result) {
    signals.push(
      signal(
        'gemini_audio_claims',
        false,
        geminiResult.errorCode ? String(geminiResult.errorCode).toLowerCase() : geminiResult.status.toLowerCase(),
        geminiResult.error || geminiResult.message || null,
        geminiService.GEMINI_MODEL
      )
    );
    return {
      available: false,
      contentType: 'AUDIO',
      claims: [],
      extractedText: speech.transcript,
      transcript: speech.transcript,
      speech,
      gemini: geminiResult,
      signals,
      modelVersions,
      modelVersion: MODEL_VERSION,
    };
  }

  const gem = geminiResult.result;
  modelVersions.gemini = gem.modelVersion || geminiService.GEMINI_MODEL;
  signals.push(signal('gemini_audio_claims', true, null, null, modelVersions.gemini));

  const claims = tagClaims(gem.claims, 'gemini_audio');

  return {
    available: true,
    contentType: 'AUDIO',
    extractedText: speech.transcript,
    transcript: speech.transcript,
    transcriptConfidence: speech.confidence,
    transcriptLanguage: speech.languageCode,
    claimContentType: gem.contentType || 'OTHER',
    opinionProbability: gem.opinionProbability ?? null,
    satireProbability: gem.satireProbability ?? null,
    editedProbability: gem.editedProbability ?? null,
    contextConcerns: gem.contextConcerns || [],
    confidence: gem.confidence ?? null,
    claims,
    speech,
    gemini: geminiResult,
    signals,
    modelVersions,
    modelVersion: MODEL_VERSION,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────

/**
 * Extract media-derived text and claims for a given content type.
 *
 * @param {Object} params
 * @param {string} params.contentType - 'IMAGE' | 'VIDEO' | 'AUDIO'
 * @param {string} params.mediaUrl
 * @param {string} [params.postId]
 * @param {string} [params.caption] - The post's own text, used as context only
 * @returns {Object} Normalized media extraction result
 */
async function extractMediaClaims({ contentType, mediaUrl, postId = null, caption = null }) {
  const type = (contentType || '').toUpperCase();

  switch (type) {
    case 'IMAGE':
      return extractFromImage({ mediaUrl, postId, caption });
    case 'VIDEO':
      return extractFromVideo({ mediaUrl, postId, caption });
    case 'AUDIO':
      return extractFromAudio({ mediaUrl, postId, caption });
    default:
      return {
        available: false,
        contentType: type || 'UNKNOWN',
        claims: [],
        extractedText: '',
        signals: [signal('media_text_extraction', false, 'unsupported_content_type')],
        modelVersions: {},
        modelVersion: MODEL_VERSION,
      };
  }
}

// ─── Media verification (claims → Google Fact Check) ──────────────────

/**
 * Map a fact-check service status to the ClaimEntity storage enum.
 */
function mapFactCheckStatus(status) {
  switch (status) {
    case 'VERIFIED_TRUE':
    case 'VERIFIED_FALSE':
    case 'MIXED':
      return 'verified';
    case 'NO_EVIDENCE':
      return 'unverified';
    default:
      return 'unverified';
  }
}

/**
 * Run the full media verification path: extract media claims, gate them by
 * claim type, verify the factual ones with Google Fact Check, and persist the
 * claims + ClaimReview evidence to MongoDB.
 *
 * Google Fact Check is attempted FIRST and only for factual claims. Claims
 * classified as opinion/satire/prediction/etc. are NOT fact-checked and are
 * stored with factCheckStatus 'not_applicable'.
 *
 * @param {Object} params
 * @param {string} params.postId
 * @param {string} params.contentType - IMAGE | VIDEO | AUDIO
 * @param {string} params.mediaUrl
 * @param {string} [params.caption]
 * @param {string} [params.contentJobId]
 * @returns {Object} { extraction, selection, factCheck, persisted, summary }
 */
async function verifyMediaContent({
  postId,
  contentType,
  mediaUrl,
  caption = null,
  contentJobId = null,
}) {
  const extraction = await extractMediaClaims({ contentType, mediaUrl, postId, caption });

  const selection = claimClassifier.selectFactCheckableClaims(extraction.claims, {
    contentType: extraction.claimContentType,
  });

  let factCheck = null;
  if (selection.factCheckable.length > 0) {
    const claimsForApi = selection.factCheckable.map((c) => ({
      text: c.normalizedClaim || c.text,
      id: ClaimEntity.hashClaimText(c.text),
    }));
    try {
      factCheck = await factCheckService.factCheckClaims(claimsForApi, { postId });
    } catch (err) {
      // Google Fact Check service failure — record it, do not fabricate evidence.
      factCheck = {
        results: [],
        aggregateStatus: 'UNKNOWN',
        summary: { total: claimsForApi.length, verified: 0, false: 0, mixed: 0, noEvidence: 0, unknown: claimsForApi.length },
        error: err.message,
      };
    }
  }

  // ── Persist claims + fact-check evidence ────────────────────────────
  const claimsForStorage = [];

  selection.factCheckable.forEach((claim, index) => {
    const result = factCheck?.results?.[index] || null;
    claimsForStorage.push({
      text: claim.text,
      claimType: claim.claimTypeNorm,
      subject: claim.subject || null,
      predicate: claim.predicate || null,
      object: claim.object || null,
      confidence: typeof claim.confidence === 'number' ? claim.confidence : 0,
      textHash: ClaimEntity.hashClaimText(claim.text),
      factCheckStatus: result ? mapFactCheckStatus(result.status) : 'unverified',
      factCheckResults: (result?.reviews || []).map((r) => ({
        publisherName: r.publisher?.name || r.publisherName || null,
        publisherSite: r.publisher?.site || r.publisherSite || null,
        url: r.url || null,
        title: r.title || null,
        rating: r.textualRating || r.rating || null,
      })),
    });
  });

  selection.skipped.forEach((claim) => {
    claimsForStorage.push({
      text: claim.text,
      claimType: claim.claimTypeNorm,
      subject: claim.subject || null,
      predicate: claim.predicate || null,
      object: claim.object || null,
      confidence: typeof claim.confidence === 'number' ? claim.confidence : 0,
      textHash: ClaimEntity.hashClaimText(claim.text),
      factCheckStatus: 'not_applicable',
      factCheckResults: [],
    });
  });

  let persisted = null;
  if (claimsForStorage.length > 0) {
    try {
      persisted = await ClaimEntity.create({
        contentJob: contentJobId || null,
        post: postId || null,
        inputText: extraction.extractedText || caption || `${contentType} media`,
        claims: claimsForStorage,
        entities: [],
        preprocessing: {
          characterCount: (extraction.extractedText || '').length,
          wordCount: (extraction.extractedText || '').split(/\s+/).filter(Boolean).length,
          sentenceCount: 0,
          language: 'unknown',
          languageConfidence: 0,
        },
        confidence: extraction.confidence ?? 0,
        modelVersion: extraction.modelVersion,
        errors: (extraction.signals || [])
          .filter((s) => !s.available)
          .map((s) => ({ stage: s.name, message: s.reason || 'unavailable' })),
        verificationScore:
          factCheck && factCheck.results?.length > 0
            ? Math.round(factCheckService.computeFactualVerificationScore(factCheck.results) * 100)
            : null,
        status: 'completed',
      });
    } catch (err) {
      // Persistence failure is non-fatal — analysis results still return.
      persisted = null;
    }
  }

  return {
    extraction,
    selection,
    factCheck,
    persisted,
    summary: {
      claimsExtracted: extraction.claims.length,
      claimsFactChecked: selection.factCheckable.length,
      claimsSkippedAsNonFactual: selection.skipped.length,
      factCheckStatus: factCheck?.aggregateStatus || null,
      factCheckReviews: (factCheck?.results || []).reduce(
        (sum, r) => sum + (r.reviews?.length || 0),
        0
      ),
    },
  };
}

/**
 * Report which media providers are configured (for /health and diagnostics).
 */
function providerStatus() {
  return {
    videoIntelligence: videoIntelligenceService.getAvailability(),
    speechToText: speechService.getAvailability(),
    gemini: { available: !!process.env.GEMINI_API_KEY, model: geminiService.GEMINI_MODEL },
  };
}

module.exports = {
  extractMediaClaims,
  extractFromImage,
  extractFromVideo,
  extractFromAudio,
  verifyMediaContent,
  providerStatus,
  MODEL_VERSION,
};
