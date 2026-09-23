/**
 * Gemini Analysis Service
 * ========================
 * Real Google Gemini API integration for Nexora content analysis.
 *
 * Uses Gemini for:
 *   - Content understanding and classification
 *   - Claim extraction from text
 *   - Opinion/satire/edited content detection
 *   - Context analysis
 *   - Generating explanations for "Why this label?"
 *
 * IMPORTANT: Gemini returns ANALYSIS SIGNALS, not final trust scores.
 * The backend Trust Score engine calculates the final score.
 *
 * Provider lock: only one Gemini analysis per post at a time.
 */

const axios = require('axios');

// ─── Configuration ─────────────────────────────────────────────────────

// Read from env at call time to support test mocking
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const GEMINI_TIMEOUT_MS = 30000;

// Maximum retries for Gemini API
const MAX_GEMINI_RETRIES = 2;

// ─── Verification Status ───────────────────────────────────────────────

const GeminiAnalysisStatus = Object.freeze({
  PENDING: 'PENDING',
  ANALYZING: 'ANALYZING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

// ─── In-Memory Provider Lock (for single-request guarantee) ───────────
// In production, this should be backed by Redis or MongoDB.
// For now, we use an in-memory map with postId as key.

const _analysisLocks = new Map();
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max lock

/**
 * Get the lock entry for a post (null if none or stale).
 * Returns the full lock object so callers can read status/result.
 */
function getAnalysisStatus(postId) {
  const lock = _analysisLocks.get(postId);
  if (!lock) return null;
  if (Date.now() - lock.startedAt > LOCK_TIMEOUT_MS) {
    // Stale lock - clean up
    _analysisLocks.delete(postId);
    return null;
  }
  return lock;
}

/**
 * Acquire a provider lock for a post. Returns false if already locked.
 */
function acquireLock(postId, provider) {
  const existing = _analysisLocks.get(postId);
  if (existing) {
    if (Date.now() - existing.startedAt > LOCK_TIMEOUT_MS) {
      _analysisLocks.delete(postId);
    } else {
      return false; // Already locked
    }
  }
  _analysisLocks.set(postId, {
    provider,
    status: GeminiAnalysisStatus.ANALYZING,
    startedAt: Date.now(),
  });
  return true;
}

/**
 * Release the lock and store the result.
 */
function releaseLock(postId, status, result) {
  const lock = _analysisLocks.get(postId);
  if (lock) {
    lock.status = status;
    lock.result = result;
    lock.completedAt = Date.now();
  }
}

/**
 * Clean up stale locks periodically (called externally).
 */
function cleanupStaleLocks() {
  const now = Date.now();
  for (const [postId, lock] of _analysisLocks.entries()) {
    if (now - lock.startedAt > LOCK_TIMEOUT_MS) {
      _analysisLocks.delete(postId);
    }
  }
}

// ─── API Key Validation ────────────────────────────────────────────────

/**
 * Validate that a Gemini API key is configured.
 * @throws {Error} If GEMINI_API_KEY is not set
 */
function validateApiKey() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return apiKey;
}

/**
 * A standard Google AI Studio API key ("AIza..."). These are always sent
 * as an API key (never as an OAuth Bearer token).
 */
function isStandardApiKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('AIza');
}

/**
 * A classic OAuth access token from `gcloud auth print-access-token`
 * ("ya29...."). These are only valid as `Authorization: Bearer`.
 */
function isOAuthToken(apiKey) {
  return typeof apiKey === 'string' && /^ya29\./.test(apiKey);
}

/**
 * Try the request with API-key auth, then — only when the key is not a
 * standard "AIza" API key — retry once with OAuth Bearer auth on a 401.
 *
 * Gemini accepts API keys through the `x-goog-api-key` header (the form
 * used here, matching the official SDK) as well as the `key=` query
 * parameter. Some valid keys (e.g. "AQ." prefixed) are NOT OAuth tokens,
 * so guessing auth style purely from the prefix is unreliable — the fall-
 * back keeps genuine `ya29.` OAuth tokens working while fixing keys that
 * the old prefix heuristic wrongly sent as Bearer.
 */
async function callGemini(url, body, apiKey) {
  // Attempt 1: API-key auth (works for AIza, AQ. and other API keys).
  try {
    return await axios.post(
      url,
      body,
      {
        timeout: GEMINI_TIMEOUT_MS,
        headers: { 'x-goog-api-key': apiKey },
      }
    );
  } catch (apiKeyErr) {
    const is401 = apiKeyErr.response?.status === 401;
    if (!is401 || isStandardApiKey(apiKey)) {
      throw apiKeyErr;
    }
    // Attempt 2: OAuth Bearer auth (for genuine gcloud access tokens).
    return axios.post(
      url,
      body,
      {
        timeout: GEMINI_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
  }
}

// ─── Content Analysis Prompt ───────────────────────────────────────────

const CONTENT_ANALYSIS_PROMPT = `You are a content analysis assistant for a fact-checking platform called Nexora.

Analyze the following text and return a JSON object with these fields:
{
  "contentType": "FACTUAL | OPINION | SATIRE | EDITED | OTHER",
  "claims": ["list of factual claims found in the text"],
  "opinionProbability": 0.0-1.0,
  "satireProbability": 0.0-1.0,
  "editedProbability": 0.0-1.0,
  "contextConcerns": ["any contextual issues, manipulations, or concerns detected"],
  "confidence": 0.0-1.0,
  "analysis": "brief analysis summary"
}

Guidelines:
- contentType: Classify the overall content type
- claims: Extract specific factual claims that could be verified
- opinionProbability: How likely is this to be opinion rather than fact?
- satireProbability: How likely is this to be satire?
- editedProbability: How likely is this content to be edited/manipulated?
- contextConcerns: Any issues with context, framing, or manipulation
- confidence: Your confidence in this analysis
- analysis: Brief summary of your analysis

Return ONLY valid JSON, no other text.`;

// ─── Claim Extraction Prompt ───────────────────────────────────────────

const CLAIM_EXTRACTION_PROMPT = `Extract all factual claims from the following text. A factual claim is a statement that can be verified as true or false.

Return a JSON array of claim objects:
[
  {
    "text": "the exact claim text",
    "subject": "what is being discussed",
    "predicate": "what is being claimed about the subject",
    "object": "the value/fact being claimed",
    "canVerify": true/false
  }
]

Return ONLY valid JSON array, no other text.

Text to analyze:
`;

// ─── Explanation Generation Prompt ─────────────────────────────────────

const EXPLANATION_PROMPT = `Generate a concise explanation for why a piece of content received a particular trust label.

You must ONLY reference evidence that actually exists. Do NOT invent sources, URLs, or fact-check results.

Input data:
- Trust Label: {{LABEL}}
- Trust Score: {{SCORE}}/100
- Content Type: {{CONTENT_TYPE}}
- Gemini Analysis: {{GEMINI_ANALYSIS}}
- Fact Check Results: {{FACT_CHECK_RESULTS}}
- Evidence: {{EVIDENCE}}

Generate a 2-3 sentence explanation that:
1. References only the actual evidence provided above
2. Explains why the label was assigned
3. Is clear and helpful to the user

Return ONLY the explanation text, no other formatting.`;

// ─── Main Analysis Function ────────────────────────────────────────────

/**
 * Analyze content using Gemini API.
 * Returns structured analysis signals for the Trust Score engine.
 *
 * @param {string} text - Content text to analyze
 * @param {string} postId - MongoDB post ID (for provider lock)
 * @returns {Object} Gemini analysis result
 */
async function analyzeWithGemini(text, postId = null) {
  // Check for existing analysis (duplicate prevention)
  if (postId) {
    const existingLock = getAnalysisStatus(postId);
    if (existingLock && existingLock.status === GeminiAnalysisStatus.ANALYZING) {
      // Analysis already in progress - return existing status
      return {
        status: 'DUPLICATE',
        message: 'Analysis already in progress for this post',
        existingStatus: existingLock.status,
      };
    }
    if (existingLock && existingLock.status === GeminiAnalysisStatus.COMPLETED && existingLock.result) {
      // Return cached result
      return {
        status: 'CACHED',
        result: existingLock.result,
      };
    }
  }

  // Acquire provider lock
  if (postId && !acquireLock(postId, 'GEMINI')) {
    return {
      status: 'LOCKED',
      message: 'Another analysis is in progress for this post',
    };
  }

  const startTime = Date.now();
  let geminiResult = null;

  try {
    const apiKey = validateApiKey();

    // Generate content with structured output using REST API.
    const result = await callGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: CONTENT_ANALYSIS_PROMPT },
              { text: `Text to analyze:\n\n${text}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      },
      apiKey
    );

    const response = result.data;
    const geminiResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResponse) {
      throw new Error('No response from Gemini API');
    }

    // Parse JSON response
    let analysis;
    try {
      analysis = JSON.parse(geminiResponse);
    } catch (parseErr) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse Gemini response as JSON');
      }
    }

    geminiResult = {
      contentType: analysis.contentType || 'OTHER',
      claims: Array.isArray(analysis.claims) ? analysis.claims : [],
      opinionProbability: clamp(analysis.opinionProbability || 0),
      satireProbability: clamp(analysis.satireProbability || 0),
      editedProbability: clamp(analysis.editedProbability || 0),
      contextConcerns: Array.isArray(analysis.contextConcerns)
        ? analysis.contextConcerns
        : [],
      confidence: clamp(analysis.confidence || 0.5),
      analysis: analysis.analysis || '',
      provider: 'GEMINI',
      modelVersion: GEMINI_MODEL,
      processingTimeMs: Date.now() - startTime,
    };

    // Release lock with success
    if (postId) {
      releaseLock(postId, GeminiAnalysisStatus.COMPLETED, geminiResult);
    }

    return {
      status: 'COMPLETED',
      result: geminiResult,
    };

  } catch (error) {
    console.error('[Gemini] Analysis failed:', error.message);

    const errorMessage = error.response?.data?.error?.message || error.message;

    // Release lock with failure
    if (postId) {
      releaseLock(postId, GeminiAnalysisStatus.FAILED, {
        error: errorMessage,
        provider: 'GEMINI',
        processingTimeMs: Date.now() - startTime,
      });
    }

    return {
      status: 'FAILED',
      error: errorMessage,
      errorCode: getGeminiErrorCode(error),
      provider: 'GEMINI',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract claims from text using Gemini.
 * This is more thorough than the heuristic extraction.
 *
 * @param {string} text - Text to extract claims from
 * @param {string} postId - Optional post ID for locking
 * @returns {Object} Claim extraction result
 */
async function extractClaimsWithGemini(text, postId = null) {
  // For duplicate prevention, use same locking mechanism
  if (postId) {
    const existingLock = getAnalysisStatus(postId);
    if (existingLock?.status === GeminiAnalysisStatus.COMPLETED && existingLock?.result?.claims) {
      return {
        status: 'CACHED',
        claims: existingLock.result.claims,
      };
    }
  }

  if (postId && !acquireLock(postId, 'GEMINI_CLAIMS')) {
    return {
      status: 'LOCKED',
      message: 'Another analysis is in progress',
    };
  }

  const startTime = Date.now();

  try {
    const apiKey = validateApiKey();

    const result = await callGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: CLAIM_EXTRACTION_PROMPT + text },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      },
      apiKey
    );

    const response = result.data;
    const geminiResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResponse) {
      throw new Error('No response from Gemini API');
    }

    let claims;
    try {
      claims = JSON.parse(geminiResponse);
    } catch (parseErr) {
      const jsonMatch = geminiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        claims = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse Gemini response');
      }
    }

    const processedClaims = Array.isArray(claims) ? claims.map((c) => ({
      text: c.text || '',
      subject: c.subject || '',
      predicate: c.predicate || '',
      object: c.object || '',
      canVerify: c.canVerify ?? true,
      source: 'GEMINI',
    })) : [];

    if (postId) {
      releaseLock(postId, GeminiAnalysisStatus.COMPLETED, {
        claims: processedClaims,
        provider: 'GEMINI',
      });
    }

    return {
      status: 'COMPLETED',
      claims: processedClaims,
      processingTimeMs: Date.now() - startTime,
    };

  } catch (error) {
    if (postId) {
      releaseLock(postId, GeminiAnalysisStatus.FAILED, {
        error: error.message,
        provider: 'GEMINI',
      });
    }
    return {
      status: 'FAILED',
      error: error.message,
      provider: 'GEMINI',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Generate explanation for "Why this label?" using Gemini.
 * This uses actual evidence - never invents sources.
 *
 * @param {Object} params - Explanation parameters
 * @param {string} params.label - Trust label (Green, Blue, Purple, Orange, Red)
 * @param {number} params.score - Trust score (0-100)
 * @param {string} params.contentType - Content type
 * @param {Object} params.geminiAnalysis - Gemini analysis result
 * @param {Array} params.factCheckResults - Fact check results
 * @param {Array} params.evidence - Evidence items
 * @returns {string} Generated explanation
 */
async function generateExplanation({ label, score, contentType, geminiAnalysis, factCheckResults, evidence }) {
  try {
    const apiKey = validateApiKey();

    // Build factual context from actual evidence
    const factCheckSummary = factCheckResults?.length > 0
      ? factCheckResults.map((r) => `${r.status}: ${r.claimText}`).join('; ')
      : 'No fact-check results available';

    const evidenceSummary = evidence?.length > 0
      ? evidence.map((e) => `${e.source || 'Unknown'}: ${e.verdict || 'No verdict'}`).join('; ')
      : 'No additional evidence';

    const geminiSummary = geminiAnalysis?.analysis || 'No Gemini analysis available';

    const prompt = EXPLANATION_PROMPT
      .replace('{{LABEL}}', label)
      .replace('{{SCORE}}', score.toString())
      .replace('{{CONTENT_TYPE}}', contentType || 'unknown')
      .replace('{{GEMINI_ANALYSIS}}', geminiSummary)
      .replace('{{FACT_CHECK_RESULTS}}', factCheckSummary)
      .replace('{{EVIDENCE}}', evidenceSummary);

    const result = await callGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      },
      apiKey
    );

    const response = result.data;
    const explanation = response.candidates?.[0]?.content?.parts?.[0]?.text;

    return explanation || 'Unable to generate explanation.';
  } catch (error) {
    console.error('[Gemini] Explanation generation failed:', error.message);
    return 'Explanation generation failed. Please see the analysis details for more information.';
  }
}

// ─── Media Analysis Prompts ────────────────────────────────────────────

const IMAGE_ANALYSIS_PROMPT = `You are a content analysis assistant for a fact-checking platform called Nexora.

You are shown a single image. Perform two jobs:
1. Transcribe ALL readable text visible in the image, verbatim (OCR). If no text is visible, use an empty string.
2. Classify the content and extract the factual claims the image asserts (including claims made by overlaid or accompanying text).

Return a JSON object with exactly these fields:
{
  "extractedText": "verbatim text visible in the image, or \"\"",
  "description": "short factual description of what the image shows",
  "captions": ["text cues that accompany the image"],
  "contentType": "FACTUAL | OPINION | SATIRE | EDITED | OTHER",
  "claims": [
    {"text": "the exact claim text", "subject": "what is discussed", "predicate": "what is claimed", "object": "the value claimed", "canVerify": true}
  ],
  "opinionProbability": 0.0-1.0,
  "satireProbability": 0.0-1.0,
  "editedProbability": 0.0-1.0,
  "contextConcerns": ["contextual issues, framing or manipulation concerns"],
  "confidence": 0.0-1.0,
  "analysis": "brief analysis summary"
}

Rules:
- Only extract claims that could be verified as true or false.
- NEVER invent text that is not actually visible in the image.
- Do NOT decide whether a claim is true or false.

Return ONLY valid JSON, no other text.`;

const TRANSCRIPT_ANALYSIS_PROMPT = `You are a content analysis assistant for a fact-checking platform called Nexora.

You are given a transcript of spoken audio from a piece of media content.

Classify the content and extract its factual claims.

Return a JSON object with exactly these fields:
{
  "contentType": "FACTUAL | OPINION | SATIRE | EDITED | OTHER",
  "claims": [
    {"text": "the exact claim text", "subject": "what is discussed", "predicate": "what is claimed", "object": "the value claimed", "canVerify": true}
  ],
  "opinionProbability": 0.0-1.0,
  "satireProbability": 0.0-1.0,
  "editedProbability": 0.0-1.0,
  "contextConcerns": ["contextual issues, framing or manipulation concerns"],
  "confidence": 0.0-1.0,
  "analysis": "brief analysis summary"
}

Rules:
- Only extract claims that could be verified as true or false.
- Ignore filler, greetings and non-factual speech.
- Do NOT decide whether a claim is true or false.

Return ONLY valid JSON, no other text.`;

const MEDIA_ANALYSIS_MODEL_TAG = 'gemini-media-claims';

// ─── Media Analysis (image OCR/understanding + transcripts) ────────────

/**
 * Parse a model response that should contain JSON, tolerating fenced code
 * blocks and surrounding prose.
 */
function parseJsonLoose(raw, expectArray = false) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty model response');
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    const pattern = expectArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const match = raw.match(pattern);
    if (!match) throw new Error('Failed to parse model response as JSON');
    return JSON.parse(match[0]);
  }
}

/**
 * Normalize the model's media-analysis payload into Nexora signal shape.
 */
function normalizeMediaAnalysis(analysis) {
  return {
    contentType: analysis.contentType || 'OTHER',
    claims: Array.isArray(analysis.claims)
      ? analysis.claims.map((c) => ({
          text: c.text || '',
          subject: c.subject || '',
          predicate: c.predicate || '',
          object: c.object || '',
          canVerify: c.canVerify ?? true,
          source: 'GEMINI',
        }))
      : [],
    opinionProbability: clamp(analysis.opinionProbability || 0),
    satireProbability: clamp(analysis.satireProbability || 0),
    editedProbability: clamp(analysis.editedProbability || 0),
    contextConcerns: Array.isArray(analysis.contextConcerns) ? analysis.contextConcerns : [],
    confidence: clamp(analysis.confidence || 0.5),
    analysis: analysis.analysis || '',
    extractedText: typeof analysis.extractedText === 'string' ? analysis.extractedText : '',
    description: analysis.description || '',
    captions: Array.isArray(analysis.captions) ? analysis.captions : [],
    provider: 'GEMINI',
    modelVersion: GEMINI_MODEL,
  };
}

/**
 * Guess an image mime type from a URL extension.
 */
function guessImageMimeType(url) {
  const lower = (url || '').toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

/**
 * Analyze an image with Gemini's multimodal understanding: OCR the visible
 * text, describe the image and extract verifiable factual claims.
 *
 * Uses GEMINI_API_KEY (backend-only). Returns a real model result or an
 * explicit failure — it never fabricates text or claims.
 *
 * @param {string} imageUrl - Public HTTPS image URL
 * @param {Object} [options] - { postId, caption, mimeType }
 * @returns {Object} { status: 'COMPLETED', result } | { status: 'FAILED', error }
 */
async function analyzeImageWithGemini(imageUrl, options = {}) {
  const { postId = null, caption = null } = options;
  const lockKey = postId ? `${postId}:image` : null;
  const startTime = Date.now();

  if (!imageUrl || typeof imageUrl !== 'string') {
    return { status: 'FAILED', error: 'imageUrl is required', provider: 'GEMINI' };
  }

  if (lockKey && !acquireLock(lockKey, 'GEMINI_IMAGE')) {
    return { status: 'LOCKED', message: 'Another image analysis is in progress for this post' };
  }

  try {
    const apiKey = validateApiKey();

    // Fetch the image and inline it as base64. Gemini's REST API only accepts
    // Google-hosted file URIs or inline bytes for public URLs.
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: GEMINI_TIMEOUT_MS,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
    });
    const mimeType = options.mimeType || imageResponse.headers?.['content-type']?.split(';')[0] || guessImageMimeType(imageUrl);
    const base64 = Buffer.from(imageResponse.data).toString('base64');

    const parts = [
      { text: IMAGE_ANALYSIS_PROMPT },
      { inlineData: { mimeType, data: base64 } },
    ];
    if (caption) {
      parts.push({ text: `Accompanying post text (use only as context, do not treat as visible text):\n${caption}` });
    }

    const response = await callGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      },
      apiKey
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const analysis = parseJsonLoose(raw);
    const result = {
      ...normalizeMediaAnalysis(analysis),
      processingTimeMs: Date.now() - startTime,
    };

    if (lockKey) releaseLock(lockKey, GeminiAnalysisStatus.COMPLETED, result);
    return { status: 'COMPLETED', result };
  } catch (error) {
    console.error('[Gemini] Image analysis failed:', error.message);
    const errorMessage = error.response?.data?.error?.message || error.message;
    if (lockKey) {
      releaseLock(lockKey, GeminiAnalysisStatus.FAILED, { error: errorMessage, provider: 'GEMINI' });
    }
    return {
      status: 'FAILED',
      error: errorMessage,
      errorCode: getGeminiErrorCode(error),
      provider: 'GEMINI',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Analyze a speech transcript (or on-screen OCR text) with Gemini: classify
 * the content and extract verifiable factual claims.
 *
 * @param {string} transcript - Real transcript/OCR text (from Speech-to-Text,
 *                              Video Intelligence or an ML model)
 * @param {Object} [options] - { postId, source, caption }
 * @returns {Object} { status: 'COMPLETED', result } | { status: 'FAILED', error }
 */
async function analyzeTranscriptWithGemini(transcript, options = {}) {
  const { postId = null, source = 'transcript', caption = null } = options;
  const lockKey = postId ? `${postId}:${source}` : null;
  const startTime = Date.now();

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return {
      status: 'FAILED',
      error: 'A non-empty transcript is required',
      provider: 'GEMINI',
    };
  }

  if (lockKey && !acquireLock(lockKey, 'GEMINI_TRANSCRIPT')) {
    return { status: 'LOCKED', message: 'Another transcript analysis is in progress for this post' };
  }

  try {
    const apiKey = validateApiKey();

    let userText = `Transcript (${source}):\n\n${transcript.slice(0, 20000)}`;
    if (caption) {
      userText += `\n\nAccompanying post text (context only):\n${caption}`;
    }

    const response = await callGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [{ text: TRANSCRIPT_ANALYSIS_PROMPT }, { text: userText }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      },
      apiKey
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const analysis = parseJsonLoose(raw);
    const result = {
      ...normalizeMediaAnalysis(analysis),
      extractedText: transcript.slice(0, 20000),
      processingTimeMs: Date.now() - startTime,
    };

    if (lockKey) releaseLock(lockKey, GeminiAnalysisStatus.COMPLETED, result);
    return { status: 'COMPLETED', result };
  } catch (error) {
    console.error('[Gemini] Transcript analysis failed:', error.message);
    const errorMessage = error.response?.data?.error?.message || error.message;
    if (lockKey) {
      releaseLock(lockKey, GeminiAnalysisStatus.FAILED, { error: errorMessage, provider: 'GEMINI' });
    }
    return {
      status: 'FAILED',
      error: errorMessage,
      errorCode: getGeminiErrorCode(error),
      provider: 'GEMINI',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Helper Functions ──────────────────────────────────────────────────

function clamp(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getGeminiErrorCode(error) {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'TIMEOUT';
  }
  if (error.response?.status === 429) {
    return 'RATE_LIMITED';
  }
  if (error.response?.status === 400) {
    return 'INVALID_REQUEST';
  }
  if (error.response?.status === 403) {
    return 'AUTHENTICATION_FAILED';
  }
  if (error.response?.status >= 500) {
    return 'API_ERROR';
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
}

// ─── Exports ────────────────────────────────────────────────────────────

module.exports = {
  // Analysis status enum
  GeminiAnalysisStatus,

  // Main analysis
  analyzeWithGemini,
  extractClaimsWithGemini,
  analyzeImageWithGemini,
  analyzeTranscriptWithGemini,
  generateExplanation,

  // Lock management
  getAnalysisStatus,
  acquireLock,
  releaseLock,
  cleanupStaleLocks,

  // Configuration (for testing)
  GEMINI_MODEL,
  MAX_GEMINI_RETRIES,
  MEDIA_ANALYSIS_MODEL_TAG,
  // Media helpers (exposed for testing)
  parseJsonLoose,
  normalizeMediaAnalysis,
  guessImageMimeType,
};