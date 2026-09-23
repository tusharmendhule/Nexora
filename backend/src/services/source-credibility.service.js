/**
 * Source Credibility Service
 * ==========================
 * Derives a source-credibility score from ACTUAL evidence produced during
 * analysis. There is no per-domain hardcoded reputation table: every point
 * of the score is traceable to a signal that was really observed.
 *
 * Signals (each returned with its own weight and value):
 *   - fact_check_publisher_presence : the claim was reviewed by external,
 *     vetted fact-checking publishers (presence in the ClaimReview index).
 *   - independent_corroboration     : how many distinct independent
 *     publishers/domains actually engaged with the claim.
 *   - source_is_fact_check_publisher: the content's own source host matches
 *     a fact-check publisher site.
 *   - link_analysis_credibility     : a credibility score computed by the
 *     link-analysis pipeline from real page/source signals, when available.
 *
 * Spec rule: source credibility is kept SEPARATE from factuality. The
 * direction of a fact-check (true/false) is NOT used here.
 *
 * When no signal is available the score is neutral (0.5) and
 * `available: false`, so the Trust Score can treat it as missing evidence
 * rather than inventing a value.
 */

const MODEL_VERSION = 'nexora-source-credibility-v1.0.0';

const NEUTRAL_SCORE = 0.5;

// Documented weights (normalized over whichever signals are present).
const WEIGHTS = Object.freeze({
  factCheckPublisherPresence: 0.35,
  independentCorroboration: 0.25,
  sourceIsFactCheckPublisher: 0.20,
  linkAnalysisCredibility: 0.20,
});

// ─── Helpers ──────────────────────────────────────────────────────────

function clamp(value, min = 0, max = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Safely extract the hostname from a URL.
 */
function hostnameOf(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return null;
  }
}

/**
 * Unique, non-empty publisher names from fact-check reviews.
 * Accepts both the nested API shape and the flattened stored shape.
 */
function uniquePublishers(reviews) {
  const names = new Set();
  for (const review of reviews || []) {
    const name = review?.publisher?.name || review?.publisherName;
    if (name && typeof name === 'string') names.add(name.trim());
  }
  return Array.from(names);
}

/**
 * Unique publisher hosts across reviews and any corroborating sources.
 */
function uniqueDomains(reviews, corroboratingSources) {
  const domains = new Set();

  for (const review of reviews || []) {
    const site = review?.publisher?.site || review?.publisherSite;
    const host = hostnameOf(site);
    if (host) domains.add(host);
  }

  for (const source of corroboratingSources || []) {
    const host = hostnameOf(typeof source === 'string' ? source : source?.url);
    if (host) domains.add(host);
  }

  return Array.from(domains);
}

/**
 * Unique publisher hosts from the content's own source, when available.
 */
function sourceHost(input) {
  return (
    hostnameOf(input.sourceUrl) ||
    hostnameOf(input.publisherSite) ||
    null
  );
}

// ─── Main computation ─────────────────────────────────────────────────

/**
 * Compute source credibility from real evidence.
 *
 * @param {Object} [input]
 * @param {Array}   [input.factCheckReviews]        Fact-check reviews with publishers
 * @param {string}  [input.sourceUrl]               The content's own source URL
 * @param {string}  [input.publisherSite]           Publisher site from stored results
 * @param {number}  [input.linkAnalysisCredibility] Credibility from link analysis (0-1)
 * @param {Array}   [input.corroboratingSources]    Additional independent sources
 * @returns {{ score: number, available: boolean, signals: Array, modelVersion: string }}
 */
function computeSourceCredibility(input = {}) {
  const {
    factCheckReviews = [],
    sourceUrl = null,
    publisherSite = null,
    linkAnalysisCredibility = null,
    corroboratingSources = [],
  } = input;

  const signals = [];

  const addSignal = (name, value, weight, evidence) => {
    signals.push({
      name,
      value: Math.round(clamp(value) * 10000) / 10000,
      weight,
      evidence,
    });
  };

  // 1. Fact-check publisher presence.
  const publishers = uniquePublishers(factCheckReviews);
  if (publishers.length > 0) {
    // Presence in the external ClaimReview index is a real, verifiable signal
    // that vetted organisations engaged with the claim. More independent
    // publishers increase confidence, capped below certainty.
    const value = 0.6 + Math.min(0.3, (publishers.length - 1) * 0.1);
    addSignal('fact_check_publisher_presence', value, WEIGHTS.factCheckPublisherPresence, {
      publishers,
      count: publishers.length,
    });
  }

  // 2. Independent corroboration.
  const domains = uniqueDomains(factCheckReviews, corroboratingSources);
  if (domains.length > 0) {
    const value = Math.min(1, 0.4 + (domains.length - 1) * 0.15);
    addSignal('independent_corroboration', value, WEIGHTS.independentCorroboration, {
      domains,
      count: domains.length,
    });
  }

  // 3. The content's own source is a fact-check publisher.
  const ownHost = sourceHost({ sourceUrl, publisherSite });
  if (ownHost) {
    const publisherHosts = uniqueDomains(factCheckReviews, []);
    const match = publisherHosts.some(
      (host) => host === ownHost || host.endsWith(`.${ownHost}`) || ownHost.endsWith(`.${host}`)
    );
    if (match) {
      addSignal('source_is_fact_check_publisher', 0.9, WEIGHTS.sourceIsFactCheckPublisher, {
        host: ownHost,
      });
    }
  }

  // 4. Link-analysis credibility (already computed from real signals upstream).
  if (typeof linkAnalysisCredibility === 'number' && !Number.isNaN(linkAnalysisCredibility)) {
    addSignal('link_analysis_credibility', linkAnalysisCredibility, WEIGHTS.linkAnalysisCredibility, {
      source: 'link-analysis',
    });
  }

  if (signals.length === 0) {
    return {
      score: NEUTRAL_SCORE,
      available: false,
      signals: [],
      reason: 'no_source_evidence',
      modelVersion: MODEL_VERSION,
    };
  }

  const weightTotal = signals.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = signals.reduce((sum, s) => sum + s.value * s.weight, 0);
  const score = weightTotal > 0 ? weightedSum / weightTotal : NEUTRAL_SCORE;

  return {
    score: Math.round(clamp(score) * 10000) / 10000,
    available: true,
    signals,
    reason: null,
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Convenience: derive credibility directly from a fact-check aggregate result.
 *
 * @param {Object} factCheckResult - { results: [{ reviews, status }] }
 * @param {Object} [extra]         - { sourceUrl, publisherSite, linkAnalysisCredibility }
 */
function fromFactCheckResult(factCheckResult, extra = {}) {
  const reviews = (factCheckResult?.results || []).flatMap((r) => r.reviews || []);
  return computeSourceCredibility({ factCheckReviews: reviews, ...extra });
}

module.exports = {
  computeSourceCredibility,
  fromFactCheckResult,
  hostnameOf,
  uniquePublishers,
  uniqueDomains,
  WEIGHTS,
  MODEL_VERSION,
  NEUTRAL_SCORE,
};
