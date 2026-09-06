/**
 * Verification Orchestrator Service
 * ==================================
 * Coordinates the verification pipeline with Google Fact Check as the
 * PRIMARY and FIRST verification method.
 *
 * CRITICAL PRIORITY:
 *   1. Google Fact Check API (FIRST)
 *   2. Fallback: Gemini / Python / ML models (ONLY on service failure)
 *
 * Flow:
 *   CONTENT
 *     ↓
 *   CLAIM EXTRACTION (heuristic, no external API needed)
 *     ↓
 *   GOOGLE FACT CHECK API (FIRST PRIORITY)
 *     ├── SUCCESS + RESULT → use fact check, skip fallback
 *     ├── SUCCESS + NO MATCH → UNVERIFIED, skip fallback
 *     └── SERVICE ERROR → fallback to Gemini/Python/ML
 *     ↓
 *   EVIDENCE NORMALIZATION
 *     ↓
 *   TRUST SCORE ENGINE (backend calculation)
 *     ↓
 *   TRUST LABEL (rule-based)
 *     ↓
 *   MongoDB persistence
 *
 * RULES:
 *   - Google Fact Check and fallback providers NEVER run simultaneously
 *   - When Google Fact Check succeeds, NO other provider runs
 *   - Fallback activates ONLY when Google Fact Check SERVICE fails
 *   - "No match" from Google Fact Check is NOT a service failure
 */

const factCheckService = require('./fact-check.service');
const trustScoreService = require('./trust-score.service');
const evidenceNormalizationService = require('./evidence-normalization.service');
const claimEntityService = require('./claim-entity-extraction.service');

// ─── Lazy-loaded services (avoid circular deps) ───────────────────────

let geminiService = null;

function _getGeminiService() {
  if (!geminiService) {
    try {
      geminiService = require('./gemini-analysis.service');
    } catch (_) {
      // Gemini not available — fallback will use other providers
    }
  }
  return geminiService;
}

let textAnalysisService = null;

function _getTextAnalysisService() {
  if (!textAnalysisService) {
    try {
      textAnalysisService = require('./text-analysis.service');
    } catch (_) {}
  }
  return textAnalysisService;
}

// ─── Verification Status ───────────────────────────────────────────────

const VerificationStatus = Object.freeze({
  PENDING: 'PENDING',
  CLAIM_EXTRACTION: 'CLAIM_EXTRACTION',
  GOOGLE_FACT_CHECK: 'GOOGLE_FACT_CHECK',
  GOOGLE_FACT_CHECK_COMPLETED: 'GOOGLE_FACT_CHECK_COMPLETED',
  FALLBACK_ANALYZING: 'FALLBACK_ANALYZING',
  FALLBACK_COMPLETED: 'FALLBACK_COMPLETED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

// ─── Provider Types ─────────────────────────────────────────────────────

const ProviderType = Object.freeze({
  GOOGLE_FACT_CHECK: 'GOOGLE_FACT_CHECK',
  GEMINI: 'GEMINI',
  PYTHON_MODEL: 'PYTHON_MODEL',
  FALLBACK: 'FALLBACK',
  NONE: 'NONE',
});

// ─── Orchestration Result ───────────────────────────────────────────────

class VerificationResult {
  constructor() {
    this.providerUsed = ProviderType.NONE;
    this.providerStatus = 'PENDING';
    this.claims = [];
    this.factCheckResults = null;
    this.fallbackAnalysis = null;
    this.evidenceItems = [];
    this.trustScoreResult = null;
    this.verificationStatus = VerificationStatus.PENDING;
    this.error = null;
    this.processingTimeMs = 0;
    this.analyzedAt = null;
  }
}

// ─── In-Memory Analysis State (for duplicate prevention) ──────────────

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
 *
 * Google Fact Check is attempted FIRST. If it succeeds (even with no
 * matching result), fallback models are NOT called. Fallback is only
 * activated when the Google Fact Check SERVICE itself is unavailable
 * or errors.
 *
 * @param {Object} params
 * @param {string} params.postId - MongoDB post ID
 * @param {string} params.text - Content text to analyze
 * @param {string} params.contentType - Content type (TEXT, IMAGE, VIDEO, etc.)
 * @param {boolean} params.skipFactCheck - Skip fact-check if true
 * @returns {VerificationResult} Complete verification result
 */
async function orchestrateVerification({ postId, text, contentType = 'TEXT', skipFactCheck = false } = {}) {
  const result = new VerificationResult();
  const startTime = Date.now();

  // ─── Duplicate prevention ──────────────────────────────────────────
  const existingState = getAnalysisState(postId);
  if (existingState) {
    if (existingState.providerStatus === 'ANALYZING' || existingState.providerStatus === 'GOOGLE_FACT_CHECK') {
      return {
        ...result,
        verificationStatus: 'ANALYZING',
        providerStatus: 'ANALYZING',
        error: 'Analysis already in progress for this post',
      };
    }
    if (existingState.verificationStatus === 'COMPLETED' || existingState.verificationStatus === 'FAILED') {
      return existingState;
    }
  }

  // Initialize state
  const state = {
    postId,
    providerUsed: ProviderType.NONE,
    providerStatus: 'PENDING',
    claims: [],
    factCheckResults: null,
    fallbackAnalysis: null,
    evidenceItems: [],
    trustScoreResult: null,
    verificationStatus: VerificationStatus.PENDING,
    error: null,
    startedAt: Date.now(),
  };
  setAnalysisState(postId, state);

  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: CLAIM EXTRACTION (heuristic, no external API needed)
    // ═══════════════════════════════════════════════════════════════════
    result.verificationStatus = VerificationStatus.CLAIM_EXTRACTION;
    result.providerStatus = 'CLAIM_EXTRACTION';
    state.verificationStatus = VerificationStatus.CLAIM_EXTRACTION;
    state.providerStatus = 'CLAIM_EXTRACTION';
    setAnalysisState(postId, state);

    let claims = [];
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
      console.warn('[TrustAnalysis] Heuristic claim extraction failed:', claimErr.message);
    }

    // If no claims from heuristics, try Gemini for claim extraction only
    if (claims.length === 0) {
      const geminiSvc = _getGeminiService();
      if (geminiSvc) {
        try {
          const geminiClaimsResult = await geminiSvc.extractClaimsWithGemini(text, postId);
          if (geminiClaimsResult.status === 'COMPLETED' && geminiClaimsResult.claims?.length > 0) {
            claims = geminiClaimsResult.claims.map(c => ({
              text: c.text || '',
              textHash: require('../models/claim-entity.model').hashClaimText(c.text || ''),
              ...c,
            }));
          }
        } catch (geminiClaimErr) {
          console.warn('[TrustAnalysis] Gemini claim extraction failed:', geminiClaimErr.message);
        }
      }
    }

    result.claims = claims;
    state.claims = claims;
    setAnalysisState(postId, state);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: GOOGLE FACT CHECK API (FIRST PRIORITY)
    // ═══════════════════════════════════════════════════════════════════
    let factCheckSuccess = false;
    let factCheckError = false;
    let factCheckResult = null;

    if (!skipFactCheck && claims.length > 0) {
      result.verificationStatus = VerificationStatus.GOOGLE_FACT_CHECK;
      result.providerStatus = 'GOOGLE_FACT_CHECK_ANALYZING';
      result.providerUsed = ProviderType.GOOGLE_FACT_CHECK;
      state.verificationStatus = VerificationStatus.GOOGLE_FACT_CHECK;
      state.providerStatus = 'GOOGLE_FACT_CHECK_ANALYZING';
      state.providerUsed = ProviderType.GOOGLE_FACT_CHECK;
      setAnalysisState(postId, state);

      try {
        console.log('[TrustAnalysis] Provider: GOOGLE_FACT_CHECK Status: ANALYZING');

        factCheckResult = await factCheckService.factCheckClaims(
          claims.map((c) => ({ text: c.text, id: c.textHash || c.text })),
          { postId }
        );

        // Google Fact Check returned successfully (even if no matches found)
        // This is a SUCCESS, not an error — "no match" means UNVERIFIED
        factCheckSuccess = true;
        result.factCheckResults = factCheckResult.results;
        result.providerStatus = 'GOOGLE_FACT_CHECK_COMPLETED';
        result.verificationStatus = VerificationStatus.GOOGLE_FACT_CHECK_COMPLETED;

        state.factCheckResults = factCheckResult.results;
        state.providerStatus = 'GOOGLE_FACT_CHECK_COMPLETED';
        state.verificationStatus = VerificationStatus.GOOGLE_FACT_CHECK_COMPLETED;
        setAnalysisState(postId, state);

        console.log('[TrustAnalysis] Provider: GOOGLE_FACT_CHECK Status: SUCCESS');

        // Store fact-check results in claim entities for persistence
        await _persistFactCheckResults(postId, claims, factCheckResult).catch(err => {
          console.warn('[TrustAnalysis] Failed to persist fact-check results:', err.message);
        });

      } catch (fcError) {
        // Google Fact Check SERVICE failed (timeout, network error, API error)
        factCheckError = true;
        console.error('[TrustAnalysis] Provider: GOOGLE_FACT_CHECK Status: ERROR');
        console.error('[TrustAnalysis] Error:', fcError.message);
        result.error = `Google Fact Check failed: ${fcError.message}`;
      }
    } else if (!skipFactCheck && claims.length === 0) {
      // No claims to verify — skip fact check entirely
      console.log('[TrustAnalysis] No claims to fact-check, proceeding with other signals');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: FALLBACK — ONLY if Google Fact Check SERVICE failed
    // ═══════════════════════════════════════════════════════════════════
    // IMPORTANT: When Google Fact Check succeeds (even with NO match),
    // fallback is NEVER activated.
    if (factCheckError) {
      result.verificationStatus = VerificationStatus.FALLBACK_ANALYZING;
      result.providerStatus = 'FALLBACK_ANALYZING';
      state.verificationStatus = VerificationStatus.FALLBACK_ANALYZING;
      state.providerStatus = 'FALLBACK_ANALYZING';
      setAnalysisState(postId, state);

      console.log('[TrustAnalysis] Falling back to alternative analysis providers');

      let fallbackResult = null;

      // Fallback 1: Gemini API
      const geminiSvc = _getGeminiService();
      if (geminiSvc) {
        try {
          console.log('[TrustAnalysis] Fallback: GEMINI Status: ANALYZING');
          const geminiAnalysis = await geminiSvc.analyzeWithGemini(text, postId);
          if (geminiAnalysis.status === 'COMPLETED' && geminiAnalysis.result) {
            fallbackResult = {
              provider: ProviderType.GEMINI,
              analysis: geminiAnalysis.result,
              claims: geminiAnalysis.result.claims || [],
            };
            result.providerUsed = ProviderType.GEMINI;
            result.fallbackAnalysis = fallbackResult;
            console.log('[TrustAnalysis] Fallback: GEMINI Status: SUCCESS');
          } else {
            console.warn('[TrustAnalysis] Fallback: GEMINI Status: FAILED -', geminiAnalysis.error);
          }
        } catch (geminiErr) {
          console.warn('[TrustAnalysis] Fallback: GEMINI Status: ERROR -', geminiErr.message);
        }
      }

      // Fallback 2: Python AI service (if Gemini failed)
      if (!fallbackResult) {
        const textSvc = _getTextAnalysisService();
        if (textSvc) {
          try {
            console.log('[TrustAnalysis] Fallback: PYTHON_MODEL Status: ANALYZING');
            // Create a minimal job-like object for text analysis
            const fakeJob = {
              post: postId,
              _id: postId,
            };
            const pythonResult = await textSvc.analyzeText(fakeJob);
            if (pythonResult.status === 'COMPLETED' && pythonResult.results) {
              fallbackResult = {
                provider: ProviderType.PYTHON_MODEL,
                analysis: pythonResult.results,
                claims: pythonResult.results.claims || [],
              };
              result.providerUsed = ProviderType.PYTHON_MODEL;
              result.fallbackAnalysis = fallbackResult;
              console.log('[TrustAnalysis] Fallback: PYTHON_MODEL Status: SUCCESS');
            }
          } catch (pyErr) {
            console.warn('[TrustAnalysis] Fallback: PYTHON_MODEL Status: ERROR -', pyErr.message);
          }
        }
      }

      if (fallbackResult) {
        result.providerStatus = 'FALLBACK_COMPLETED';
        result.verificationStatus = VerificationStatus.FALLBACK_COMPLETED;
        state.providerStatus = 'FALLBACK_COMPLETED';
        state.verificationStatus = VerificationStatus.FALLBACK_COMPLETED;
        state.fallbackAnalysis = fallbackResult;
        setAnalysisState(postId, state);
      } else {
        // All fallback providers also failed
        console.error('[TrustAnalysis] All fallback providers failed');
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: EVIDENCE NORMALIZATION
    // ═══════════════════════════════════════════════════════════════════
    let evidenceItems = [];
    try {
      const primaryClaim = text ? text.substring(0, 200) : `${contentType} content`;

      const evidenceInputs = {
        claim: primaryClaim,
        postId: postId,
        modelConfidence: {
          overallConfidence: 0.5,
          modelVersion: 'nexora-trust-v1.0.0',
          processingTimeMs: 0,
        },
        contentMetadata: {
          contentType,
          hasMedia: false,
        },
        sourceAnalysis: {
          credibilityScore: 0.5,
          publisherName: null,
        },
      };

      // Add Google Fact Check evidence (primary source)
      if (factCheckSuccess && factCheckResult?.results?.length > 0) {
        const fcData = factCheckResult.results[0];
        evidenceInputs.factCheckResults = {
          status: fcData.status,
          reviews: (fcData.reviews || []).map((r) => ({
            publisher: { name: r.publisher?.name || r.publisherName },
            textualRating: r.textualRating || r.rating,
            url: r.url,
          })),
          factualVerificationScore: factCheckService.verificationStatusToScore(fcData.status),
        };
      }

      // Add fallback analysis evidence (only if Google Fact Check failed)
      if (factCheckError && result.fallbackAnalysis) {
        const fb = result.fallbackAnalysis;
        if (fb.provider === ProviderType.GEMINI && fb.analysis) {
          evidenceInputs.geminiAnalysis = {
            contentType: fb.analysis.contentType,
            opinionProbability: fb.analysis.opinionProbability,
            satireProbability: fb.analysis.satireProbability,
            editedProbability: fb.analysis.editedProbability,
            contextConcerns: fb.analysis.contextConcerns,
          };
          evidenceInputs.modelConfidence.overallConfidence = fb.analysis.confidence || 0.5;
          evidenceInputs.modelConfidence.modelVersion = fb.analysis.modelVersion || 'gemini';
        } else if (fb.provider === ProviderType.PYTHON_MODEL && fb.analysis) {
          evidenceInputs.aiDetectorResults = {
            misinfoProbability: fb.analysis.misinformationProbability || 0,
            aiGeneratedProbability: fb.analysis.aiGeneratedProbability || 0,
            confidence: fb.analysis.confidence || 0.5,
            modelVersion: fb.analysis.modelVersion || 'python-model',
          };
        }
      }

      evidenceItems = await evidenceNormalizationService.normalizeEvidence(evidenceInputs);
      result.evidenceItems = evidenceItems;
      state.evidenceItems = evidenceItems;
    } catch (evidenceErr) {
      console.warn('[TrustAnalysis] Evidence normalization failed:', evidenceErr.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: TRUST SCORE CALCULATION (backend engine)
    // ═══════════════════════════════════════════════════════════════════
    const trustScoreInput = {
      authenticityScore: 0.5,
      factualVerificationScore: 0.5,
      sourceCredibilityScore: 0.5,
      modelConfidenceScore: 0.5,
      contentType: contentType.toLowerCase(),
      evidence: [],
    };

    // ── Set scores based on Google Fact Check results (primary) ────
    if (factCheckSuccess && factCheckResult?.results?.length > 0) {
      // Use real fact-check data for factual verification
      const factualScore = factCheckService.computeFactualVerificationScore(factCheckResult.results);
      trustScoreInput.factualVerificationScore = factualScore;

      if (factCheckService.isConfirmedFalse(factCheckResult.results)) {
        trustScoreInput.isConfirmedFalse = true;
      }

      // Source credibility from fact-check publisher reviews
      const reviews = factCheckResult.results.flatMap(r => r.reviews || []);
      if (reviews.length > 0) {
        // Higher credibility if reputable publishers reviewed it
        trustScoreInput.sourceCredibilityScore = Math.min(0.9, 0.5 + reviews.length * 0.05);
      }
    }

    // ── Set scores based on fallback analysis (only if Google Fact Check failed) ──
    if (factCheckError && result.fallbackAnalysis) {
      const fb = result.fallbackAnalysis;

      if (fb.provider === ProviderType.GEMINI && fb.analysis) {
        // Authenticity signal from Gemini (inverse of manipulation concerns)
        const manipulationConcern = Math.max(
          fb.analysis.satireProbability || 0,
          fb.analysis.editedProbability || 0,
          (fb.analysis.contextConcerns?.length || 0) * 0.1
        );
        trustScoreInput.authenticityScore = 1 - manipulationConcern;
        trustScoreInput.modelConfidenceScore = fb.analysis.confidence || 0.5;

        if (fb.analysis.contentType === 'OPINION') {
          trustScoreInput.contentType = 'opinion';
        } else if (fb.analysis.contentType === 'SATIRE') {
          trustScoreInput.contentType = 'satire';
        } else if (fb.analysis.contentType === 'EDITED') {
          trustScoreInput.contentType = 'edited';
        }
      } else if (fb.provider === ProviderType.PYTHON_MODEL && fb.analysis) {
        trustScoreInput.authenticityScore = 1 - (fb.analysis.misinformationProbability || 0);
        trustScoreInput.modelConfidenceScore = fb.analysis.confidence || 0.5;
      }
    }

    // ── Add evidence items to trust score input ──
    if (evidenceItems.length > 0) {
      for (const evidence of evidenceItems) {
        if (evidence.evidenceItems) {
          trustScoreInput.evidence.push(...evidence.evidenceItems);
        }
      }
    }

    // Compute trust score using backend engine
    const trustScoreResult = trustScoreService.computeTrustScore(trustScoreInput);
    result.trustScoreResult = trustScoreResult;
    state.trustScoreResult = trustScoreResult;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: PERSIST TO MONGODB
    // ═══════════════════════════════════════════════════════════════════
    await persistVerificationResult(postId, trustScoreResult, {
      providerUsed: result.providerUsed,
      factCheckResults: result.factCheckResults,
      fallbackAnalysis: result.fallbackAnalysis,
      claims: result.claims,
    }).catch((err) => {
      console.warn('[TrustAnalysis] Failed to persist verification result:', err.message);
    });

    // ═══════════════════════════════════════════════════════════════════
    // FINALIZE
    // ═══════════════════════════════════════════════════════════════════
    result.verificationStatus = VerificationStatus.COMPLETED;
    result.processingTimeMs = Date.now() - startTime;
    result.analyzedAt = new Date();
    state.verificationStatus = VerificationStatus.COMPLETED;
    state.processingTimeMs = result.processingTimeMs;
    state.analyzedAt = result.analyzedAt;
    setAnalysisState(postId, state);

    return result;

  } catch (error) {
    console.error('[TrustAnalysis] Verification failed:', error.message);
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

// ─── Persistence ──────────────────────────────────────────────────────

/**
 * Persist the verification result to MongoDB.
 * Updates the TrustScore document and the Post document.
 */
async function persistVerificationResult(postId, trustScoreResult, metadata = {}) {
  const TrustScore = require('../models/trust-score.model');
  const Post = require('../models/post.model');

  const explanation = trustScoreResult.reasoning.join('\n');

  // Build the explanation with real data
  let enrichedExplanation = explanation;

  // Add Google Fact Check specific explanation
  if (metadata.providerUsed === ProviderType.GOOGLE_FACT_CHECK && metadata.factCheckResults?.length > 0) {
    const fcExplanations = metadata.factCheckResults.map(r => {
      const reviews = r.reviews || [];
      if (reviews.length > 0) {
        const publisherNames = reviews.map(rev => rev.publisher?.name || rev.publisherName).filter(Boolean).join(', ');
        const ratings = reviews.map(rev => rev.textualRating || rev.rating).filter(Boolean).join(', ');
        return `Google Fact Check found a review from ${publisherNames || 'a publisher'} rating this claim as ${ratings || 'unavailable'}.`;
      }
      return `Google Fact Check returned status: ${r.status}.`;
    });
    enrichedExplanation = fcExplanations.join(' ') + '\n' + explanation;
  }

  // Add fallback explanation
  if (metadata.providerUsed === ProviderType.GEMINI) {
    enrichedExplanation = 'Analysis performed using Gemini AI (Google Fact Check was unavailable).\n' + explanation;
  } else if (metadata.providerUsed === ProviderType.PYTHON_MODEL) {
    enrichedExplanation = 'Analysis performed using Python AI model (Google Fact Check was unavailable).\n' + explanation;
  }

  // Determine verification status for the post
  let verificationStatus = 'VERIFIED';
  if (trustScoreResult.label === 'Red') {
    verificationStatus = 'REJECTED';
  } else if (trustScoreResult.label === 'Orange') {
    verificationStatus = 'REVIEW_REQUIRED';
  }

  // Save TrustScore document
  await TrustScore.findOneAndUpdate(
    { post: postId },
    {
      post: postId,
      score: trustScoreResult.trustScore,
      authenticity: trustScoreResult.componentScores.authenticity,
      factualVerification: trustScoreResult.componentScores.factualVerification,
      sourceCredibility: trustScoreResult.componentScores.sourceCredibility,
      modelConfidence: trustScoreResult.componentScores.modelConfidence,
      label: trustScoreResult.label,
      explanation: enrichedExplanation,
      modelVersion: trustScoreResult.modelVersion,
      ruleVersion: trustScoreResult.ruleVersion,
      isOverrideApplied: trustScoreResult.isOverrideApplied,
      // New fields for provider tracking
      providerUsed: metadata.providerUsed || ProviderType.NONE,
      analyzedAt: new Date(),
      factCheckData: metadata.factCheckResults ? {
        aggregateStatus: metadata.factCheckResults.length > 0 ? metadata.factCheckResults[0].status : 'NO_EVIDENCE',
        claimCount: metadata.claims?.length || 0,
        reviewCount: metadata.factCheckResults.reduce((sum, r) => sum + (r.reviews?.length || 0), 0),
        publisherNames: metadata.factCheckResults
          .flatMap(r => (r.reviews || []).map(rev => rev.publisher?.name || rev.publisherName))
          .filter(Boolean),
      } : null,
    },
    { upsert: true, new: true }
  );

  // Update Post document
  await Post.findByIdAndUpdate(postId, {
    trustScore: trustScoreResult.trustScore,
    trustBadge: trustScoreResult.label,
    trustBreakdown: {
      factualVerification: trustScoreResult.componentScores.factualVerification,
      authenticity: trustScoreResult.componentScores.authenticity,
      sourceCredibility: trustScoreResult.componentScores.sourceCredibility,
      modelConfidence: trustScoreResult.componentScores.modelConfidence,
    },
    verificationStatus,
    pipelineCompletedAt: new Date(),
  });
}

/**
 * Persist Google Fact Check results to ClaimEntity documents.
 */
async function _persistFactCheckResults(postId, claims, factCheckResult) {
  const ClaimEntity = require('../models/claim-entity.model');
  const crypto = require('crypto');

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const fcResult = factCheckResult.results?.[i];

    if (fcResult && fcResult.reviews?.length > 0) {
      const textHash = claim.textHash || crypto
        .createHash('sha256')
        .update((claim.text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim())
        .digest('hex')
        .slice(0, 32);

      await ClaimEntity.findOneAndUpdate(
        { post: postId, 'claims.textHash': textHash },
        {
          $set: {
            'claims.$.factCheckStatus': fcResult.status === 'VERIFIED_TRUE' ? 'verified' :
              fcResult.status === 'VERIFIED_FALSE' ? 'failed' : 'verifying',
            'claims.$.factCheckResults': (fcResult.reviews || []).map(r => ({
              publisherName: r.publisher?.name || r.publisherName || null,
              publisherSite: r.publisher?.site || r.publisherSite || null,
              url: r.url || null,
              title: r.title || null,
              rating: r.textualRating || r.rating || null,
            })),
          },
        },
        { upsert: false }
      );
    }
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────

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

  // Persistence
  persistVerificationResult,

  // State management
  getVerificationState,
  cancelVerification,
  cleanupStaleStates,

  // Result class
  VerificationResult,
};
