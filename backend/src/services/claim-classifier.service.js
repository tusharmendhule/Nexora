/**
 * Claim Classifier Service
 * ========================
 * Decides WHICH extracted claims may be sent to Google Fact Check, and
 * normalizes claim text for querying/caching.
 *
 * Spec rules implemented here:
 *   §14 — Only FACTUAL claims are sent to Google Fact Check. Opinion,
 *         satire, predictions, moral claims, questions, personal
 *         experience and advertisements are NOT treated as checkable
 *         factual claims.
 *   §15 — Normalize whitespace, punctuation, filler words, duplicated
 *         phrases, URLs, timestamps and speech-transcription artifacts.
 *         The original claim is always preserved alongside the normalized
 *         form (normalized is for search/cache only).
 *
 * Nothing here guesses a truth value — classification is about claim TYPE,
 * which is strictly separate from whether a claim is true or false.
 */

// ─── Normalized claim types ───────────────────────────────────────────

const ClaimType = Object.freeze({
  FACTUAL_CLAIM: 'FACTUAL_CLAIM',
  STATISTICAL_CLAIM: 'STATISTICAL_CLAIM',
  CAUSAL_CLAIM: 'CAUSAL_CLAIM',
  DEFINITION: 'DEFINITION',
  EXPERT_OPINION: 'EXPERT_OPINION',
  OPINION: 'OPINION',
  SATIRE: 'SATIRE',
  PREDICTION: 'PREDICTION',
  MORAL_CLAIM: 'MORAL_CLAIM',
  QUESTION: 'QUESTION',
  PERSONAL_EXPERIENCE: 'PERSONAL_EXPERIENCE',
  ADVERTISEMENT: 'ADVERTISEMENT',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

// Claim types that can be factually verified against an external fact-check.
const FACT_CHECKABLE_TYPES = new Set([
  ClaimType.FACTUAL_CLAIM,
  ClaimType.STATISTICAL_CLAIM,
  ClaimType.CAUSAL_CLAIM,
  ClaimType.DEFINITION,
]);

// Claim types that must never be reported as factual misinformation.
const NON_FACTUAL_TYPES = new Set([
  ClaimType.EXPERT_OPINION,
  ClaimType.OPINION,
  ClaimType.SATIRE,
  ClaimType.PREDICTION,
  ClaimType.MORAL_CLAIM,
  ClaimType.QUESTION,
  ClaimType.PERSONAL_EXPERIENCE,
  ClaimType.ADVERTISEMENT,
]);

// Content types that are non-factual at the post level (Gemini output).
const NON_FACTUAL_CONTENT_TYPES = new Set(['OPINION', 'SATIRE']);

// ─── Raw type → normalized type ───────────────────────────────────────

const RAW_TYPE_PATTERNS = [
  { pattern: /statistic/i, type: ClaimType.STATISTICAL_CLAIM },
  { pattern: /causal/i, type: ClaimType.CAUSAL_CLAIM },
  { pattern: /definition/i, type: ClaimType.DEFINITION },
  { pattern: /expert\s*opinion/i, type: ClaimType.EXPERT_OPINION },
  { pattern: /opinion/i, type: ClaimType.OPINION },
  { pattern: /satire|parody|humou?r/i, type: ClaimType.SATIRE },
  { pattern: /prediction|forecast|speculat/i, type: ClaimType.PREDICTION },
  { pattern: /moral|ethical/i, type: ClaimType.MORAL_CLAIM },
  { pattern: /question|query/i, type: ClaimType.QUESTION },
  { pattern: /personal|anecdote|experience/i, type: ClaimType.PERSONAL_EXPERIENCE },
  { pattern: /advert|promo|sponsor/i, type: ClaimType.ADVERTISEMENT },
  { pattern: /factual|fact\s*claim/i, type: ClaimType.FACTUAL_CLAIM },
];

/**
 * Normalize a raw claim-type string (from the Python NLP service or Gemini)
 * into a ClaimType value.
 */
function normalizeClaimType(rawType) {
  if (!rawType || typeof rawType !== 'string') return ClaimType.UNKNOWN;
  const value = rawType.trim();
  if (Object.values(ClaimType).includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  for (const { pattern, type } of RAW_TYPE_PATTERNS) {
    if (pattern.test(value)) return type;
  }
  return ClaimType.UNKNOWN;
}

/**
 * Classify a claim object into a normalized claim type.
 * Uses `claimType` when present; otherwise falls back to heuristics on text.
 */
function classifyClaim(claim) {
  if (!claim) return ClaimType.UNKNOWN;

  const declared = normalizeClaimType(
    typeof claim === 'string' ? null : claim.claimType || claim.type
  );
  if (declared !== ClaimType.UNKNOWN) return declared;

  const text = typeof claim === 'string' ? claim : claim.text || '';
  return classifyClaimText(text);
}

/**
 * Heuristic fallback when no explicit type is available.
 * Deliberately conservative: only obvious non-factual shapes are excluded.
 */
function classifyClaimText(text) {
  if (!text || typeof text !== 'string') return ClaimType.UNKNOWN;
  const t = text.trim();

  if (t.endsWith('?')) return ClaimType.QUESTION;
  if (/\b(i think|i believe|in my opinion|imo|arguably|feels like|seems to me)\b/i.test(t)) {
    return ClaimType.OPINION;
  }
  if (/\b(should|must|ought to|is immoral|is unethical|is wrong to|is right to)\b/i.test(t)) {
    return ClaimType.MORAL_CLAIM;
  }
  if (/\b(will|would|may|might|is expected to|is predicted to|forecast)\b/i.test(t)) {
    return ClaimType.PREDICTION;
  }
  if (/\b(experts? (?:say|believe|think)|scientists? (?:say|believe|think)|analysts? (?:say|believe|think))\b/i.test(t)) {
    return ClaimType.EXPERT_OPINION;
  }
  if (/\b(breaking|must see|share this|subscribe|click here|buy now|limited offer)\b/i.test(t)) {
    return ClaimType.ADVERTISEMENT;
  }
  return ClaimType.UNKNOWN;
}

// ─── Claim text normalization (§15) ───────────────────────────────────

/**
 * Collapse immediately duplicated words/phrases, e.g. "the the" and
 * "it is true it is true".
 */
function collapseDuplicates(text) {
  if (!text) return '';

  // Collapse immediate repeated words: "the the" -> "the"
  let out = text.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');

  // Collapse repeated sentences (keeping first occurrence order)
  const sentences = out.split(/(?<=[.!?])\s+/);
  const seen = new Set();
  const kept = [];
  for (const sentence of sentences) {
    const key = sentence.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence.trim());
  }
  out = kept.join('. ');

  // Collapse a repeated trailing clause like "X X" split by comma
  out = out.replace(/\b([^,]{12,}?)\s*,\s*\1\b/gi, '$1');

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize claim text for fact-check queries and cache keys, while
 * preserving the original claim separately.
 *
 * @param {string} text - Raw claim text (may come from OCR / ASR / Gemini)
 * @returns {{ originalClaim: string, normalizedClaim: string, transformations: string[] }}
 */
function normalizeClaimText(text) {
  if (!text || typeof text !== 'string') {
    return { originalClaim: '', normalizedClaim: '', transformations: [] };
  }

  const originalClaim = text.trim();
  let value = originalClaim;
  const transformations = [];

  const apply = (pattern, replacement, label) => {
    const next = value.replace(pattern, replacement);
    if (next !== value) transformations.push(label);
    value = next;
  };

  // URLs
  apply(/https?:\/\/\S+/gi, ' ', 'removed_url');
  apply(/\bwww\.\S+/gi, ' ', 'removed_url');

  // Timestamps and time markers (word-level and bracketed)
  apply(/[[(]?\b\d{1,2}:\d{2}(?::\d{2})?\b[\])]?/g, ' ', 'removed_timestamp');
  apply(/\b\d{1,2}\s?(?:am|pm)\b/gi, ' ', 'removed_timestamp');

  // Hashtags / mentions / emoji-style markers
  apply(/[#@]\w+/g, ' ', 'removed_hashtag_mention');

  // Speech-transcription artifacts and speaker labels
  apply(/\[(?:music|applause|laughter|inaudible|crosstalk|noise|silence)\]/gi, ' ', 'removed_asr_artifact');
  apply(/^\s*[A-Z][A-Za-z .'-]{1,30}:\s*/g, '', 'removed_speaker_label'); // "Speaker: ..."
  apply(/\b(?:um+|uh+|erm+|hmm+)\b,?/gi, ' ', 'removed_filler');

  // Leading editorial/CTA labels
  apply(
    /^\s*(?:breaking|exclusive|update|urgent|watch|share this|must see|subscribe)\s*[:\-–]\s*/gi,
    '',
    'removed_editorial_label'
  );

  // Smart quotes -> straight quotes
  apply(/[\u2018\u2019]/g, "'", 'normalized_quotes');
  apply(/[\u201C\u201D]/g, '"', 'normalized_quotes');

  // Whitespace and surrounding quotes
  apply(/\s+/g, ' ', 'normalized_whitespace');
  value = value.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
  if (value !== originalClaim) transformations.push('trimmed_quotes');

  // Duplicated phrases
  const collapsed = collapseDuplicates(value);
  if (collapsed !== value) {
    transformations.push('collapsed_duplicates');
    value = collapsed;
  }

  // Trailing sentence punctuation
  const withoutTrailing = value.replace(/[.!?]+$/g, '').trim();
  if (withoutTrailing !== value) {
    transformations.push('stripped_trailing_punctuation');
    value = withoutTrailing;
  }

  return {
    originalClaim,
    normalizedClaim: value,
    transformations: Array.from(new Set(transformations)),
  };
}

// ─── Gating ───────────────────────────────────────────────────────────

/**
 * Decide whether a single claim should be sent to Google Fact Check.
 *
 * @param {Object|string} claim
 * @param {Object} [options] - { contentType } post-level Gemini content type
 * @returns {{ factCheckable: boolean, claimType: string, reason: string }}
 */
function shouldFactCheckClaim(claim, options = {}) {
  const claimType = classifyClaim(claim);
  const text = typeof claim === 'string' ? claim : claim?.text || '';
  const normalizedClaim = normalizeClaimText(text).normalizedClaim;

  // Too short to be a meaningful verifiable assertion.
  if (normalizedClaim.split(/\s+/).filter(Boolean).length < 4) {
    return { factCheckable: false, claimType, reason: 'claim_too_short' };
  }

  if (NON_FACTUAL_TYPES.has(claimType)) {
    return {
      factCheckable: false,
      claimType,
      reason: `non_factual_claim_type:${claimType}`,
    };
  }

  // Explicit model signal that the claim cannot be verified.
  if (typeof claim?.canVerify === 'boolean' && claim.canVerify === false) {
    return { factCheckable: false, claimType, reason: 'model_marked_unverifiable' };
  }

  const contentLevel = (options.contentType || '').toUpperCase();

  // Post-level opinion/satire: only fact-check claims explicitly typed as factual.
  if (NON_FACTUAL_CONTENT_TYPES.has(contentLevel) && !FACT_CHECKABLE_TYPES.has(claimType)) {
    return {
      factCheckable: false,
      claimType,
      reason: `content_type_${contentLevel.toLowerCase()}_requires_explicit_factual_claim`,
    };
  }

  if (FACT_CHECKABLE_TYPES.has(claimType)) {
    return { factCheckable: true, claimType, reason: 'factual_claim_type' };
  }

  // UNKNOWN: default to fact-checkable. A "no match" result maps to
  // UNVERIFIED, which is honest and never claims certainty.
  return { factCheckable: true, claimType, reason: 'unclassified_claim_default_fact_checkable' };
}

/**
 * Partition extracted claims into those that may be fact-checked and those
 * that must be excluded, preserving the original text on both sides.
 *
 * @param {Array} claims
 * @param {Object} [options] - { contentType }
 * @returns {{ factCheckable: Array, skipped: Array }}
 */
function selectFactCheckableClaims(claims, options = {}) {
  const factCheckable = [];
  const skipped = [];

  for (const claim of claims || []) {
    const decision = shouldFactCheckClaim(claim, options);
    const text = typeof claim === 'string' ? claim : claim?.text || '';
    const { originalClaim, normalizedClaim, transformations } = normalizeClaimText(text);

    const enriched = {
      ...(typeof claim === 'object' && claim !== null ? claim : { text }),
      originalClaim,
      normalizedClaim,
      normalization: transformations,
      claimTypeNorm: decision.claimType,
      factCheckDecision: decision.reason,
    };

    if (decision.factCheckable) {
      factCheckable.push(enriched);
    } else {
      skipped.push(enriched);
    }
  }

  return { factCheckable, skipped };
}

module.exports = {
  ClaimType,
  FACT_CHECKABLE_TYPES,
  NON_FACTUAL_TYPES,
  NON_FACTUAL_CONTENT_TYPES,

  normalizeClaimType,
  classifyClaim,
  classifyClaimText,
  normalizeClaimText,
  collapseDuplicates,
  shouldFactCheckClaim,
  selectFactCheckableClaims,
};
