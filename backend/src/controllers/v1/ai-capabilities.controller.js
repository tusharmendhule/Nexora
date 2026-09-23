/**
 * AI Capabilities Controller
 * ==========================
 * GET /api/v1/content/ai-capabilities
 *
 * Reports which analysis providers and models are actually configured.
 * This exists so operators (and the final report) never have to guess —
 * a provider listed as `configured: false` is simply not used, and no
 * substitute result is fabricated for it.
 */

const mediaClaimsService = require('../../services/media-claims.service');
const googleCloudConfig = require('../../services/google-cloud-config.service');

exports.getAiCapabilities = async (req, res, next) => {
  try {
    const providers = mediaClaimsService.providerStatus();

    res.status(200).json({
      success: true,
      providers: {
        // Google Fact Check Tools API — first priority for factual claims.
        googleFactCheck: {
          configured: !!process.env.GOOGLE_FACT_CHECK_API_KEY,
          role: 'primary factual verification',
        },
        // Gemini — claim extraction, content understanding, media OCR/claims.
        gemini: {
          configured: providers.gemini.available,
          model: providers.gemini.model,
          role: 'AI reasoning / claim extraction / media understanding',
        },
        // Google Cloud Video Intelligence.
        googleVideoIntelligence: {
          configured: providers.videoIntelligence.available,
          reason: providers.videoIntelligence.reason,
          role: 'video frames/shots/OCR/objects/speech transcription',
        },
        // Google Cloud Speech-to-Text.
        googleSpeechToText: {
          configured: providers.speechToText.available,
          reason: providers.speechToText.reason,
          role: 'audio speech transcription',
        },
        // Python AI service (transformers, OpenCV, librosa + optional
        // fine-tuned Nexora models).
        pythonAiService: {
          url: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000',
          role: 'text/claim NLP and media authenticity models',
        },
      },
      googleCloud: googleCloudConfig.describeConfiguration(),
      models: {
        misinformation: process.env.NEXORA_MISINFO_MODEL || 'facebook/bart-large-mnli (zero-shot)',
        claimVerification: process.env.NEXORA_CLAIM_MODEL || 'not-configured',
        imageAI: process.env.NEXORA_IMAGE_MODEL || 'built-in-heuristics',
        audioSynthetic: process.env.NEXORA_AUDIO_MODEL || 'built-in-spectral',
        videoManipulation: process.env.NEXORA_VIDEO_MODEL || 'built-in-heuristics',
        aiTextDetection: 'gpt2',
      },
      note:
        'A provider reported as not configured is NOT used during analysis. ' +
        'Signals that depend on it are recorded as unavailable rather than ' +
        'substituted with heuristics or invented values.',
    });
  } catch (error) {
    next(error);
  }
};
