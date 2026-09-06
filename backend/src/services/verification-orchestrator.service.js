/**
 * Verification Orchestrator Service
 * ==================================
 * Coordinates the sequential verification pipeline:
 *   1. Gemini Analysis (content understanding, claim extraction)
 *   2. Google Fact Check (external verification of claims)
 *   3. Trust Score calculation (backend engine)
 *
 * CRITICAL: Only ONE provider runs at a time.
 * Gemini and Google Fact Check are NEVER simultaneous.
 *
 * Flow:
 *   CONTENT
 *     ↓
 *   GEMINI ANALYSIS (sequential, completes first)
 *     ↓
 *   CLAIM EXTRACTION (from Gemini or heuristics)
 *     ↓
 *   GOOGLE FACT CHECK (only if claims exist, runs after Gemini)
 *     ↓
 *   EVIDENCE NORMALIZATION
 *     ↓
 *   TRUST SCORE ENGINE (backend calculation)
 *     ↓
 *   TRUST LABEL (rule-based)
 */

const geminiService = require('./gemini-analysis.service');
const factCheckService = require('./fact-check.service');
const trustScoreService = require('./trust-score.service');
const evidenceNormalizationService = require('./evidence-normalization.service');
const claimEntityService = require('./claim-entity-extraction.service');

// ─── Verification Status ───────────────────────────────────────────────

const VerificationStatus = Object.freeze({
  PENDING: 'PENDING',
  GEMINI_ANALYZING: 'GEMINI_ANALYZING',
  GEMINI_COMPLETED: 'GEMINI_COMPLETED',
  FACT_CHECK_ANALYZING: 'FACT_CHECK_ANALYZING',
  FACT_CHECK_COMPLETED: 'FACT_CHECK_COMPLETED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

// ─── Provider Types ─────────────────────────────────────────────────────

const ProviderType = Object.freeze({
  GEMINI: 'GEMINI',
  GOOGLE_FACT_CHECK: 'GOOGLE_FACT_CHECK',
  NONE: 'NONE',
});

// ─── Orchestration Result ───────────────────────────────────────────────

class VerificationResult {
  constructor() {
    this.providerUsed = ProviderType.NONE;
    this.providerStatus = 'PENDING';
    this.geminiAnalysis = null;
    this.factCheckResults = null;
    this.evidenceItems = [];
    this.trustScoreResult = null;
    this.verificationStatus = VerificationStatus.PENDING;
    this.error = null;
    this.processingTimeMs = 0;
  }
}

// ─── In-Memory Analysis State (for duplicate prevention) ──────────────
// In production, this should be backed by MongoDB/Redis.

const _analysisState = new Map();
const STATE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getAnalysisState(postId) {
  const state = _analysisState.get(postId);
  if (!state) return null;
  if (Date.now() - state.startedAt > STATE_TIMEOUT_MS) {
    _analysisState.delete(postId);
    return null;
  }
  return state;
}

function setAnalysisState(postId, state) {
  _analysisState.set(postId, {
    ...state,
    startedAt: Date.now(),
  });
}

function cleanupStaleStates() {
  const now = Date.now();
  for (const [postId, state] of _analysisState.entries()) {
    if (now - state.startedAt > STATE_TIMEOUT_MS) {
      _analysisState.delete(postId);
    }
  }
}

// ─── Main Orchestration Function ───────────────────────────────────────

/**
 * Orchestrate the full verification pipeline for a post.
 * Executes providers SEQUENTIALLY, never in parallel.
 *
 * @param {Object} params - Orchestration parameters
 * @param {string} params.postId - MongoDB post ID
 * @param {string} params.text - Content text to analyze
 * @param {string} params.contentType - Content type (TEXT, IMAGE, VIDEO, etc.)
 * @param {boolean} params.skipFactCheck - Skip fact-check if true
 * @returns {VerificationResult} Complete verification result
 */
async function orchestrateVerification({ postId, text, contentType = 'TEXT', skipFactCheck = false } = {}) {
  const result = new VerificationResult();
  const startTime = Date.now();

  // Check for existing analysis (duplicate prevention)
  const existingState = getAnalysisState(postId);
  if (existingState) {
    if (existingState.providerStatus === 'ANALYZING') {
      return {
        ...result,
        verificationStatus: 'ANALYZING',
        error: 'Analysis already in progress for this post',
      };
    }
    // Return cached result if complete
    if (existingState.verificationStatus === 'COMPLETED' || existingState.verificationStatus === 'FAILED') {
      return existingState;
    }
  }

  // Initialize state
  const state = {
    postId,
    providerUsed: ProviderType.NONE,
    providerStatus: 'PENDING',
    geminiAnalysis: null,
    factCheckResults: null,
    evidenceItems: [],
    trustScoreResult: null,
    verificationStatus: VerificationStatus.PENDING,
    error: null,
    startedAt: Date.now(),
  };
  setAnalysisState(postId, state);

  try {
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Gemini Analysis (content understanding, claim extraction)
    // ─────────────────────────────────────────────────────────────
    result.providerStatus = 'GEMINI_ANALYZING';
    result.verificationStatus = VerificationStatus.GEMINI_ANALYZING;

    const geminiResult = await geminiService.analyzeWithGemini(text, postId);

    if (geminiResult.status === 'COMPLETED') {
      result.geminiAnalysis = geminiResult.result;
      result.providerUsed = ProviderType.GEMINI;
      result.providerStatus = 'COMPLETED';
      result.verificationStatus = VerificationStatus.GEMINI_COMPLETED;
      state.geminiAnalysis = result.geminiAnalysis;
    } else if (geminiResult.status === 'FAILED') {
      // Gemini failed - still continue with heuristic analysis
      console.warn('[Orchestrator] Gemini analysis failed, using fallback:', geminiResult.error);
      result.error = `Gemini analysis failed: ${geminiResult.error}`;
      // Continue with fallback - don't fail the whole pipeline
    }

    // Update state
    state.geminiAnalysis = result.geminiAnalysis;
    state.providerUsed = result.providerUsed;
    state.providerStatus = result.providerStatus;
    setAnalysisState(postId, state);

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Claim Extraction (from Gemini or heuristics)
    // ─────────────────────────────────────────────────────────────
    // Claims are extracted as part of Gemini analysis or via heuristics

    let claims = [];
    if (result.geminiAnalysis?.claims?.length > 0) {
      claims = result.geminiAnalysis.claims;
    } else {
      // Fallback: Use heuristic claim extraction
      try {
        const heuristicResult = await claimEntityService.extractClaimsAndEntities(
          text,
          postId,
          null // contentJobId
        );
        if (heuristicResult?.savedAnalysis?.claims) {
          claims = heuristicResult.savedAnalysis.claims;
        }
      } catch (claimErr) {
        console.warn('[Orchestrator] Claim extraction fallback failed:', claimErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Google Fact Check (SEQUENTIAL - after Gemini completes)
    // Only run if there are claims to verify
    // ─────────────────────────────────────────────────────────────
    if (!skipFactCheck && claims.length > 0) {
      result.providerStatus = 'FACT_CHECK_ANALYZING';
      result.verificationStatus = VerificationStatus.FACT_CHECK_ANALYZING;
      result.providerUsed = ProviderType.GOOGLE_FACT_CHECK;

      // Update state to show fact-check is starting
      state.providerStatus = 'FACT_CHECK_ANALYZING';
      state.verificationStatus = VerificationStatus.FACT_CHECK_ANALYZING;
      setAnalysisState(postId, state);

      // Fact check claims - this is sequential, NOT parallel with Gemini
      const factCheckResult = await factCheckService.factCheckClaims(
        claims.map((c) => ({ text: c.text, id: c.text })),
        { postId }
      );

      result.factCheckResults = factCheckResult.results;
      result.providerStatus = 'COMPLETED';
      result.verificationStatus = VerificationStatus.FACT_CHECK_COMPLETED;

      // Update state
      state.factCheckResults = result.factCheckResults;
      state.providerStatus = 'COMPLETED';
      state.verificationStatus = VerificationStatus.FACT_CHECK_COMPLETED;
      setAnalysisState(postId, state);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Evidence Normalization
    // ─────────────────────────────────────────────────────────────
    let evidenceItems = [];
    try {
      // Build evidence inputs from Gemini analysis and fact-check results
      const evidenceInputs = {
        claim: text.substring(0, 200),
        postId: postId,
        modelConfidence: {
          overallConfidence: result.geminiAnalysis?.confidence || 0.5,
          modelVersion: result.geminiAnalysis?.modelVersion || 'gemini-' + geminiService.GEMINI_MODEL,
          processingTimeMs: result.geminiAnalysis?.processingTimeMs || 0,
        },
        contentMetadata: {
          contentType,
          hasMedia: false,
        },
        sourceAnalysis: {
          credibilityScore: 0.5, // Will be updated by source analysis if available
          publisherName: null,
        },
      };

      // Add Gemini signals
      if (result.geminiAnalysis) {
        evidenceInputs.geminiAnalysis = {
          contentType: result.geminiAnalysis.contentType,
          opinionProbability: result.geminiAnalysis.opinionProbability,
          satireProbability: result.geminiAnalysis.satireProbability,
          editedProbability: result.geminiAnalysis.editedProbability,
          contextConcerns: result.geminiAnalysis.contextConcerns,
        };
      }

      // Add fact-check evidence if available
      if (result.factCheckResults?.length > 0) {
        const factCheckData = result.factCheckResults[0];
        evidenceInputs.factCheckResults = {
          status: factCheckData.status,
          reviews: (factCheckData.reviews || []).map((r) => ({
            publisher: { name: r.publisher?.name },
            textualRating: r.textualRating,
            url: r.url,
          })),
          factualVerificationScore: factCheckService.verificationStatusToScore(
            factCheckData.status
          ),
        };
      }

      evidenceItems = await evidenceNormalizationService.normalizeEvidence(evidenceInputs);
      result.evidenceItems = evidenceItems;
      state.evidenceItems = evidenceItems;
    } catch (evidenceErr) {
      console.warn('[Orchestrator] Evidence normalization failed:', evidenceErr.message);
      result.error = `Evidence normalization failed: ${evidenceErr.message}`;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 5: Trust Score Calculation (backend engine)
    // ─────────────────────────────────────────────────────────────
    const trustScoreInput = {
      authenticityScore: 0.5, // Default neutral
      factualVerificationScore: 0.5, // Default neutral
      sourceCredibilityScore: 0.5, // Default neutral
      modelConfidenceScore: result.geminiAnalysis?.confidence || 0.5,
      contentType: contentType.toLowerCase(),
      evidence: [],
    };
    void trustScoreInput;
    // (Legacy `trustScoreInput` is replaced below by `trustScoreService`
    // inputs built from the collected signals; kept minimal by design.)

    // Adjust scores based on Gemini analysis
    if (result.geminiAnalysis) {
      // Authenticity signal from Gemini (inverse of manipulation concerns)
      const manipulationConcern = Math.max(
        result.geminiAnalysis.satireProbability || 0,
        result.geminiAnalysis.editedProbability || 0,
        (result.geminiAnalysis.contextConcerns?.length || 0) * 0.1
      );
      trustScoreInput.authenticityScore = 1 - manipulationConcern;

      // Model confidence from Gemini
      trustScoreInput.modelConfidenceScore = result.geminiAnalysis.confidence;

      // Content type signals
      if (result.geminiAnalysis.contentType === 'OPINION') {
        trustScoreInput.contentType = 'opinion';
      } else if (result.geminiAnalysis.contentType === 'SATIRE') {
        trustScoreInput.contentType = 'satire';
      } else if (result.geminiAnalysis.contentType === 'EDITED') {
        trustScoreInput.contentType = 'edited';
      }
    }

    // Adjust scores based on fact-check results
    if (result.factCheckResults?.length > 0) {
      // Use fact-check service to compute factual verification score
      const factualScore = factCheckService.computeFactualVerificationScore(
        result.factCheckResults
      );
      trustScoreInput.factualVerificationScore = factualScore;

      // Check for confirmed false
      if (factCheckService.isConfirmedFalse(result.factCheckResults)) {
        trustScoreInput.isConfirmedFalse = true;
      }
    }

    // Add evidence items
    if (evidenceItems.length > 0) {
      for (const evidence of evidenceItems) {
        if (evidence.evidenceItems) {
          trustScoreInput.evidence.push(...evidence.evidenceItems);
        }
      }
    }

    // Calculate trust score using backend engine. The input used is the
    // same one the stage-based pipeline builds (defaults then adjusted by
    // the Gemini + fact-check signals gathered above) so results persist
    // consistently with the rest of Nexora.
    const trustScoreResult = trustScoreService.computeTrustScore(trustScoreInput);
    result.trustScoreResult = trustScoreResult;
    state.trustScoreResult = trustScoreResult;

    // Persist the REAL computed result (TrustScore document + post fields)
    // so the feed badge, post detail and "Why this label?" sheet show the
    // actual Gemini-derived analysis — not a neutral default.
    await persistVerificationResult(postId, trustScoreResult).catch((err) => {
      console.warn('[Orchestrator] Failed to persist verification result:', err.message);
    });

    // ─────────────────────────────────────────────────────────────
    // Finalize
    // ─────────────────────────────────────────────────────────────
    result.verificationStatus = VerificationStatus.COMPLETED;
    result.processingTimeMs = Date.now() - startTime;
    state.verificationStatus = VerificationStatus.COMPLETED;
    state.processingTimeMs = result.processingTimeMs;
    setAnalysisState(postId, state);

    return result;

  } catch (error) {
    console.error('[Orchestrator] Verification failed:', error.message);
    result.verificationStatus = VerificationStatus.FAILED;
    result.error = error.message;
    result.processingTimeMs = Date.now() - startTime;

    state.verificationStatus = VerificationStatus.FAILED;
    state.error = error.message;
    state.processingTimeMs = result.processingTimeMs;
    setAnalysisState(postId, state);

    return result;
  }
}

/**
 * Get the current verification state for a post.
 */
function getVerificationState(postId) {
  return getAnalysisState(postId);
}

/**
 * Cancel an in-progress verification.
 */
function cancelVerification(postId) {
  const state = _analysisState.get(postId);
  if (state) {
    state.isCancelled = true;
    state.verificationStatus = 'CANCELLED';
  }
}

// ─── Exports ────────────────────────────────────────────────────────────

module.exports = {
  // Status enums
  VerificationStatus,
  ProviderType,

  // Main orchestration
  orchestrateVerification,

  // State management
  getVerificationState,
  cancelVerification,
  cleanupStaleStates,

  // Result class
  VerificationResult,
};
