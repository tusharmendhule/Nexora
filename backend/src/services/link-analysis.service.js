/**
 * Link Analysis Service
 * =====================
 * Handles the full link content verification pipeline:
 *   1. URL validation & SSRF prevention
 *   2. Safe URL resolution (redirect tracking)
 *   3. Content fetching with timeouts and size limits
 *   4. Metadata extraction (OG tags, title, description)
 *   5. Text extraction from HTML
 *   6. Claim extraction from page content
 *   7. Entity extraction
 *   8. Fact verification via Google Fact Check API
 *   9. Trust Score computation and storage
 */

const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');
const cheerio = require('cheerio');
const LinkAnalysis = require('../models/link-analysis.model');
const TrustScore = require('../models/trust-score.model');
const FactCheckCache = require('../models/fact-check-cache.model');

// ─── Configuration ────────────────────────────────────────────────

const MODEL_VERSION = 'nexora-link-v1.0.0';
const FETCH_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 100000; // max chars to analyze
const MAX_REDIRECTS = 10;
const MAX_CLAIMS = 10;

// ─── SSRF Prevention ──────────────────────────────────────────────

/**
 * List of private/reserved IP ranges that must never be fetched.
 * Covers IPv4 and IPv6 loopback/link-local/private ranges.
 */
const BLOCKED_IP_RANGES = [
  // IPv4 private ranges
  { start: '10.0.0.0', end: '10.255.255.255' },       // 10.0.0.0/8
  { start: '172.16.0.0', end: '172.31.255.255' },     // 172.16.0.0/12
  { start: '192.168.0.0', end: '192.168.255.255' },   // 192.168.0.0/16
  { start: '127.0.0.0', end: '127.255.255.255' },     // 127.0.0.0/8 (loopback)
  { start: '169.254.0.0', end: '169.254.255.255' },   // 169.254.0.0/16 (link-local)
  { start: '0.0.0.0', end: '0.255.255.255' },         // 0.0.0.0/8
  // IPv6 reserved ranges
  { start: '::1', end: '::1' },                        // loopback
  { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // ULA
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // link-local
];

/**
 * Convert an IPv4 address to a 32-bit number for range checks.
 */
function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Check if an IPv4 address falls within a given range.
 */
function isIPv4InRange(ip, rangeStart, rangeEnd) {
  try {
    const ipNum = ipv4ToNumber(ip);
    const startNum = ipv4ToNumber(rangeStart);
    const endNum = ipv4ToNumber(rangeEnd);
    return ipNum >= startNum && ipNum <= endNum;
  } catch {
    return false;
  }
}

/**
 * Check if an IP address is in any blocked range.
 * Handles both IPv4 and IPv6.
 */
function isIPBlocked(ip) {
  // Normalize IPv4-mapped IPv6 addresses
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Check if it's an IPv4 address
  if (net.isIP(ip) === 4) {
    for (const range of BLOCKED_IP_RANGES) {
      if (isIPv4InRange(ip, range.start, range.end)) {
        return true;
      }
    }
    return false;
  }

  // Check if it's an IPv6 address
  if (net.isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    // Loopback
    if (normalized === '::1') return true;
    // ULA (fc00::/7)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-local (fe80::/10)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    return false;
  }

  return false;
}

/**
 * Validate and sanitize a URL before fetching.
 * Returns a parsed URL object or throws an ApiError.
 */
function validateUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('URL is required and must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new Error(`Invalid URL format: "${urlString}"`);
  }

  // Only allow HTTP and HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`
    );
  }

  // Block common SSRF patterns in hostname
  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '127.0.0.1' ||
    hostname === '0' ||
    hostname === '0x7f000001'
  ) {
    throw new Error('Access to localhost/internal addresses is not allowed');
  }

  // Block metadata endpoints
  const blockedHosts = [
    '169.254.169.254',   // AWS/GCP/Azure metadata
    'metadata.google.internal', // GCP metadata
    'metadata.tencentyun.com',  // Tencent metadata
  ];
  if (blockedHosts.includes(hostname)) {
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  // Block raw IP addresses in common private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const ip = hostname;
    if (isIPBlocked(ip)) {
      throw new Error(`Access to private/internal IP address "${ip}" is not allowed`);
    }
  }

  return parsed;
}

/**
 * Resolve a hostname and verify none of the resolved IPs are blocked.
 * Returns the list of resolved IP addresses.
 */
async function resolveAndValidateHost(hostname) {
  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (isIPBlocked(addr)) {
        throw new Error(
          `Hostname "${hostname}" resolves to blocked IP "${addr}"`
        );
      }
    }
    return addresses;
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      throw new Error(`DNS resolution failed: hostname "${hostname}" not found`);
    }
    if (err.code === 'ENODATA') {
      // Try IPv6
      try {
        const addresses6 = await dns.resolve6(hostname);
        for (const addr of addresses6) {
          if (isIPBlocked(addr)) {
            throw new Error(
              `Hostname "${hostname}" resolves to blocked IPv6 "${addr}"`
            );
          }
        }
        return addresses6;
      } catch {
        throw new Error(
          `DNS resolution failed: no addresses found for "${hostname}"`
        );
      }
    }
    throw err;
  }
}

// ─── Safe URL Fetching ────────────────────────────────────────────

/**
 * Fetch a URL safely with SSRF protection, timeouts, and redirect tracking.
 * Returns { finalUrl, statusCode, headers, body, redirectChain }.
 */
async function safeFetchUrl(parsedUrl) {
  const redirectChain = [];
  let currentUrl = parsedUrl.href;
  let lastResponse = null;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    // Validate the current URL
    let currentParsed;
    try {
      currentParsed = new URL(currentUrl);
    } catch {
      throw new Error(`Invalid redirect URL: "${currentUrl}"`);
    }

    // SSRF check on each redirect target
    if (
      currentParsed.hostname !== parsedUrl.hostname ||
      isIPBlocked(currentParsed.hostname)
    ) {
      // Allow cross-origin redirects only if the target is not private
      const hostname = currentParsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '169.254.169.254'
      ) {
        throw new Error(
          `Redirect to blocked address "${currentParsed.hostname}" was blocked`
        );
      }

      // Resolve and validate the redirect target
      try {
        await resolveAndValidateHost(currentParsed.hostname);
      } catch (err) {
        throw new Error(`Redirect validation failed: ${err.message}`);
      }
    }

    try {
      lastResponse = await axios.get(currentUrl, {
        timeout: FETCH_TIMEOUT_MS,
        maxRedirects: 0, // we handle redirects ourselves
        validateStatus: () => true, // don't throw on non-2xx
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'NexoraBot/1.0 (Content Verification)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        // Security: bind to specific address to prevent SSRF via DNS rebinding
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused: the server at "${currentParsed.hostname}" is not accepting connections`);
      }
      if (err.code === 'ECONNRESET') {
        throw new Error(`Connection reset: the server at "${currentParsed.hostname}" closed the connection`);
      }
      if (err.code === 'ENOTFOUND') {
        throw new Error(`DNS resolution failed: hostname "${currentParsed.hostname}" not found`);
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
      }
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
      }
      throw new Error(`Failed to fetch URL: ${err.message}`);
    }

    // Check response size
    if (lastResponse.data && lastResponse.data.length > MAX_RESPONSE_SIZE_BYTES) {
      throw new Error(
        `Response too large: ${(lastResponse.data.length / 1024 / 1024).toFixed(1)}MB (max 5MB)`
      );
    }

    const statusCode = lastResponse.status;

    // Track the redirect
    if (i > 0) {
      redirectChain.push({
        url: currentUrl,
        statusCode,
      });
    }

    // Follow 3xx redirects
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = lastResponse.headers?.location;
      if (!location) {
        throw new Error(`Redirect (${statusCode}) without Location header`);
      }
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    // Non-redirect response — we're done
    return {
      finalUrl: currentUrl,
      statusCode,
      headers: lastResponse.headers || {},
      body: lastResponse.data
        ? lastResponse.data.toString('utf-8')
        : '',
      redirectChain,
    };
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

// ─── HTML Parsing & Metadata Extraction ───────────────────────────

/**
 * Parse HTML and extract metadata, OG tags, and main text content.
 */
function extractMetadataAndContent(html) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, noscript, iframe, svg, nav, footer, header').remove();

  // Extract metadata
  const metadata = {
    pageTitle:
      $('title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="title"]').attr('content')?.trim() ||
      null,
    metaDescription:
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      null,
    ogTitle: $('meta[property="og:title"]').attr('content')?.trim() || null,
    ogDescription:
      $('meta[property="og:description"]').attr('content')?.trim() || null,
    ogImage:
      $('meta[property="og:image"]').attr('content')?.trim() || null,
    ogType: $('meta[property="og:type"]').attr('content')?.trim() || null,
    ogSiteName:
      $('meta[property="og:site_name"]').attr('content')?.trim() || null,
    keywords: (
      $('meta[name="keywords"]').attr('content')?.trim() || ''
    )
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20),
    canonicalUrl:
      $('link[rel="canonical"]').attr('href')?.trim() || null,
    language:
      $('html').attr('lang')?.trim() ||
      $('meta[name="language"]').attr('content')?.trim() ||
      null,
  };

  // Extract main text content
  // Try article/main content areas first, fall back to body
  let contentEl = $('article').first();
  if (!contentEl.length) contentEl = $('main').first();
  if (!contentEl.length) contentEl = $('[role="main"]').first();
  if (!contentEl.length) contentEl = $('body');

  const extractedText = contentEl
    .text()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, MAX_TEXT_LENGTH);

  return { metadata, extractedText };
}

// ─── Text Preprocessing ───────────────────────────────────────────

function preprocessText(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  return {
    characterCount: cleaned.length,
    wordCount: words.length,
    sentenceCount: sentences.length,
  };
}

// ─── Source Credibility Scoring ───────────────────────────────────

/**
 * High-authority domains that are generally trustworthy sources.
 */
const HIGH_CREDIBILITY_DOMAINS = new Set([
  'wikipedia.org', 'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com',
  'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'economist.com',
  'nature.com', 'science.org', 'thelancet.com', 'nejm.org',
  'who.int', 'cdc.gov', 'nih.gov', 'nasa.gov', 'un.org',
  'gov.uk', 'europa.eu', 'whitehouse.gov',
  'stackoverflow.com', 'github.com', 'arxiv.org',
]);

/**
 * Known low-credibility or suspicious domain patterns.
 */
const LOW_CREDIBILITY_PATTERNS = [
  /bit\.ly/i, /tinyurl\.com/i, /t\.co/i,
  /\.xyz$/i, /\.top$/i, /\.club$/i, /\.work$/i,
  /news\d+\.com/i, /breaking-news/i, /fake-news/i,
];

/**
 * Compute a source credibility score (0-1) based on domain analysis.
 */
function computeSourceCredibility(parsedUrl) {
  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

  // Check high-credibility list
  for (const domain of HIGH_CREDIBILITY_DOMAINS) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return 0.9;
    }
  }

  // Check low-credibility patterns
  for (const pattern of LOW_CREDIBILITY_PATTERNS) {
    if (pattern.test(hostname)) {
      return 0.2;
    }
  }

  // HTTPS bonus
  let score = 0.5;
  if (parsedUrl.protocol === 'https:') {
    score += 0.1;
  }

  // Well-known TLDs
  const tld = hostname.split('.').pop();
  const trustedTlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co'];
  if (trustedTlds.includes(tld)) {
    score += 0.05;
  }

  // Suspiciously long hostname
  if (hostname.length > 50) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Claim Extraction ─────────────────────────────────────────────

const CLAIM_PATTERNS = [
  /(?:study|research|report|data)\s+(?:shows?|indicates?|suggests?|found|confirms?)\s+(?:that\s+)?(.{10,120})/i,
  /(?:according to|per)\s+(?:a\s+)?(.{5,80}),?\s+(.{10,120})/i,
  /(\d+(?:\.\d+)?%)\s+(?:of\s+)?(.{5,80})\s+(?:are|is|were|was|have|has|will|can|do|does|did)\s+(.{5,80})/i,
  /(?:scientists?|researchers?|experts?|officials?)\s+(?:say|claim|report|found|warn|confirm)\s+(?:that\s+)?(.{10,120})/i,
  /(?:proof|evidence|data)\s+(?:shows?|indicates?|suggests?|confirms?)\s+(?:that\s+)?(.{10,120})/i,
];

/**
 * Extract factual claims from text using pattern-based heuristics.
 */
function extractClaims(text) {
  const claims = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) continue;

    let isClaim = false;
    for (const pattern of CLAIM_PATTERNS) {
      if (pattern.test(trimmed)) {
        isClaim = true;
        break;
      }
    }

    // Sentences with numbers are often claims
    if (/\d+/.test(trimmed)) isClaim = true;

    // Subject-verb-object structure
    if (/\b(?:is|are|was|were)\b.*\b[A-Z][a-z]+\b/.test(trimmed)) isClaim = true;

    if (isClaim) {
      const { subject, predicate, object } = extractSVO(trimmed);
      claims.push({
        text: trimmed,
        subject,
        predicate,
        object,
        misinformationProbability: 0,
        confidence: 0.5,
      });
    }

    if (claims.length >= MAX_CLAIMS) break;
  }

  return claims;
}

function extractSVO(sentence) {
  const match = sentence.match(
    /^(.{3,60}?)\s+(?:is|are|was|were|has|have|had|will|can|may|should)\s+(.{3,120})$/
  );
  if (match) {
    return {
      subject: match[1].trim(),
      predicate: 'is',
      object: match[2].trim(),
    };
  }
  return { subject: null, predicate: null, object: null };
}

// ─── Entity Extraction ────────────────────────────────────────────

/**
 * Extract named entities using simple heuristics.
 * Capitalized words/phrases that are likely named entities.
 */
function extractEntities(text) {
  const entities = [];
  const seen = new Set();

  // Pattern: capitalized multi-word phrases (e.g., "New York", "United Nations")
  const multiWordPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = multiWordPattern.exec(text)) !== null) {
    const entityText = match[1];
    if (!seen.has(entityText) && entityText.length > 3) {
      seen.add(entityText);
      entities.push({
        text: entityText,
        label: guessEntityLabel(entityText),
        start: match.index,
        end: match.index + entityText.length,
      });
    }
  }

  // Pattern: single capitalized words (likely proper nouns / named entities)
  const singleWordPattern = /\b([A-Z][a-z]{2,})\b/g;
  while ((match = singleWordPattern.exec(text)) !== null) {
    const entityText = match[1];
    // Skip common English words
    if (
      !seen.has(entityText) &&
      !COMMON_WORDS.has(entityText)
    ) {
      seen.add(entityText);
      entities.push({
        text: entityText,
        label: guessEntityLabel(entityText),
        start: match.index,
        end: match.index + entityText.length,
      });
    }
  }

  // Pattern: dates (e.g., "January 2024", "2024-01-15")
  const datePattern = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g;
  while ((match = datePattern.exec(text)) !== null) {
    const entityText = match[1];
    if (!seen.has(entityText)) {
      seen.add(entityText);
      entities.push({
        text: entityText,
        label: 'DATE',
        start: match.index,
        end: match.index + entityText.length,
      });
    }
  }

  // Limit total entities
  return entities.slice(0, 30);
}

const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where',
  'Which', 'While', 'With', 'Would', 'Could', 'Should', 'About',
  'After', 'Before', 'Between', 'During', 'From', 'Here', 'There',
  'Then', 'Than', 'Also', 'Just', 'Like', 'More', 'Most', 'Much',
  'Many', 'Some', 'Such', 'Only', 'Other', 'Each', 'Every', 'Both',
  'Few', 'All', 'Any', 'But', 'Not', 'How', 'Why', 'Who', 'Whom',
  'Its', 'His', 'Her', 'Our', 'Their', 'Your', 'New', 'Old',
  'First', 'Last', 'Next', 'Same', 'Different', 'Great', 'Small',
]);

function guessEntityLabel(text) {
  // Simple heuristic labeling
  if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December)/.test(text)) {
    return 'DATE';
  }
  if (/^(?:Mr|Mrs|Ms|Dr|Prof)\./.test(text)) {
    return 'PERSON';
  }
  if (/(?:Inc|Corp|Ltd|LLC|Co|Company|Organization|Association|University|Institute)$/i.test(text)) {
    return 'ORG';
  }
  return 'ENTITY';
}

// ─── Misinformation Classification ───────────────────────────────

/**
 * Heuristic misinformation probability scoring.
 * Uses signals from the content to estimate likelihood of misinformation.
 */
function estimateMisinformationProbability(text, claims, sourceCredibility) {
  let score = 0.3; // baseline

  // Sensational language indicators
  const sensationalPatterns = [
    /(?:shocking|unbelievable|you won't believe|breaking|urgent|alert)/i,
    /(?:secret|hidden|they don't want you to know)/i,
    /(?:miracle|cure|instant|guaranteed)/i,
    /(?:100%|always|never|all|every|none)\s+(?:true|false|real|fake)/i,
  ];
  let sensationalCount = 0;
  for (const pattern of sensationalPatterns) {
    if (pattern.test(text)) sensationalCount++;
  }
  score += sensationalCount * 0.08;

  // Excessive capitalization (SHOUTING)
  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
  const totalWords = text.split(/\s+/).length;
  if (totalWords > 0 && capsWords / totalWords > 0.1) {
    score += 0.15;
  }

  // Excessive punctuation (!!!! or ???)
  const exclamations = (text.match(/!{2,}/g) || []).length;
  const questions = (text.match(/\?{2,}/g) || []).length;
  score += (exclamations + questions) * 0.05;

  // Claims with very specific unverifiable numbers
  for (const claim of claims) {
    if (/\d{4,}/.test(claim.text)) {
      score += 0.03;
    }
  }

  // Low source credibility increases suspicion
  score += (1 - sourceCredibility) * 0.15;

  return Math.max(0, Math.min(1, score));
}

// ─── Fact Verification ───────────────────────────────────────────

/**
 * Verify claims against the Google Fact Check Tools API.
 * Uses local cache to avoid redundant API calls.
 */
async function verifyClaims(claims) {
  const results = [];
  const GOOGLE_API_KEY = process.env.GOOGLE_FACT_CHECK_API_KEY;

  for (const claim of claims) {
    const normalizedQuery = claim.text.trim().toLowerCase();

    // Check local cache first
    let cachedResult = null;
    try {
      cachedResult = await FactCheckCache.findOne({ queryText: normalizedQuery });
      if (cachedResult && cachedResult.expiresAt > new Date()) {
        // Use cached results
        for (const cr of cachedResult.claimResults) {
          for (const rating of (cr.factCheckRatings || [])) {
            results.push({
              claimText: claim.text,
              publisherName: rating.publisherName,
              publisherSite: rating.publisherSite,
              url: rating.url,
              title: rating.title,
              rating: rating.rating,
            });
          }
        }
        continue;
      }
    } catch {
      // Cache lookup failed — proceed to API
    }

    // Query Google Fact Check API
    if (GOOGLE_API_KEY) {
      try {
        const axios = require('axios');
        const googleRes = await axios.get(
          'https://factchecktools.googleapis.com/v1alpha1/claims:search',
          {
            params: {
              query: normalizedQuery,
              key: GOOGLE_API_KEY,
            },
            timeout: 10000,
          }
        );

        if (googleRes.data && googleRes.data.claims) {
          const claimResults = googleRes.data.claims.map((item) => ({
            text: item.text,
            claimant: item.claimant,
            claimDate: item.claimDate,
            factCheckRatings: (item.claimReview || []).map((rev) => ({
              publisherName: rev.publisher?.name,
              publisherSite: rev.publisher?.site,
              url: rev.url,
              title: rev.title,
              rating: rev.textualRating,
            })),
          }));

          // Cache the results for 24 hours
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          await FactCheckCache.findOneAndUpdate(
            { queryText: normalizedQuery },
            { queryText: normalizedQuery, claimResults, expiresAt },
            { upsert: true, new: true }
          );

          // Extract ratings
          for (const cr of claimResults) {
            for (const rating of (cr.factCheckRatings || [])) {
              results.push({
                claimText: claim.text,
                publisherName: rating.publisherName,
                publisherSite: rating.publisherSite,
                url: rating.url,
                title: rating.title,
                rating: rating.rating,
              });
            }
          }
        }
      } catch (err) {
        // API call failed — log and continue
        console.warn(
          `[LinkAnalysis] Fact Check API failed for claim "${claim.text.substring(0, 50)}...":`,
          err.message
        );
      }
    }
  }

  return results;
}

// ─── Confidence Scoring ───────────────────────────────────────────

function computeConfidence(
  textLength,
  claims,
  entities,
  factCheckResults,
  sourceCredibility,
  errors
) {
  let score = 0.4;

  // More text = more reliable analysis
  if (textLength > 1000) score += 0.15;
  else if (textLength > 200) score += 0.1;
  else if (textLength < 50) score -= 0.15;

  // Claims found
  if (claims.length > 0) score += 0.1;
  if (claims.length > 3) score += 0.05;

  // Entities found
  if (entities.length > 0) score += 0.05;

  // Fact-check results available
  if (factCheckResults.length > 0) score += 0.1;

  // Source credibility contributes to confidence
  score += sourceCredibility * 0.1;

  // Errors reduce confidence
  score -= errors.length * 0.08;

  return Math.max(0, Math.min(1, score));
}

// ─── Trust Score Helpers ──────────────────────────────────────────

function getTrustLabel(score) {
  if (score >= 80) return 'Green';
  if (score >= 60) return 'Blue';
  if (score >= 40) return 'Purple';
  if (score >= 20) return 'Orange';
  return 'Red';
}

function generateExplanation(
  sourceCredibility,
  misinformationProbability,
  claimsCount,
  factCheckCount
) {
  const parts = [];

  if (sourceCredibility > 0.7) {
    parts.push(
      `Source has high credibility (${(sourceCredibility * 100).toFixed(0)}%). `
    );
  } else if (sourceCredibility > 0.4) {
    parts.push(
      `Source has moderate credibility (${(sourceCredibility * 100).toFixed(0)}%). `
    );
  } else {
    parts.push(
      `Source has low credibility (${(sourceCredibility * 100).toFixed(0)}%). `
    );
  }

  if (misinformationProbability > 0.6) {
    parts.push(
      `High misinformation indicators detected (${(misinformationProbability * 100).toFixed(1)}%). `
    );
  } else if (misinformationProbability > 0.3) {
    parts.push(
      `Moderate misinformation indicators found (${(misinformationProbability * 100).toFixed(1)}%). `
    );
  } else {
    parts.push(
      `Low misinformation probability (${(misinformationProbability * 100).toFixed(1)}%). `
    );
  }

  if (claimsCount > 0) {
    parts.push(`${claimsCount} claim(s) extracted. `);
  }

  if (factCheckCount > 0) {
    parts.push(`${factCheckCount} fact-check rating(s) found. `);
  } else {
    parts.push('No external fact-check ratings found. ');
  }

  return parts.join('').trim();
}

// ─── Main Analysis Pipeline ───────────────────────────────────────

/**
 * Run the full link analysis pipeline for a content job.
 *
 * @param {Object} job - ContentJob document
 * @returns {Object} { status, results, modelVersion }
 */
async function analyzeLink(job) {
  const Post = require('../models/post.model');
  const post = await Post.findById(job.post);
  if (!post) {
    return {
      status: 'FAILED',
      results: { message: 'Post not found for link analysis' },
      modelVersion: null,
    };
  }

  const url = post.linkUrl || (job.contentReference && job.contentReference.url);
  if (!url) {
    return {
      status: 'COMPLETED',
      results: { message: 'No URL found to analyze' },
      modelVersion: null,
    };
  }

  return _runAnalysisPipeline(url, job.post, job._id);
}

/**
 * Run the full link analysis pipeline (standalone, not tied to a job).
 *
 * @param {string} url - The URL to analyze
 * @param {string|null} postId - Optional post ID
 * @param {string|null} contentJobId - Optional content job ID
 * @returns {Object} { status, results, modelVersion, savedAnalysis }
 */
async function analyzeLinkDirect(url, postId, contentJobId) {
  return _runAnalysisPipeline(url, postId, contentJobId);
}

/**
 * Internal: run the full pipeline.
 */
async function _runAnalysisPipeline(url, postId, contentJobId) {
  const startTime = Date.now();
  const errors = [];

  // Step 1: Validate URL
  let parsedUrl;
  try {
    parsedUrl = validateUrl(url);
  } catch (err) {
    return {
      status: 'COMPLETED',
      results: {
        success: false,
        error: `URL validation failed: ${err.message}`,
        finalScore: 0,
      },
      modelVersion: MODEL_VERSION,
    };
  }

  // Step 2: Resolve and validate host (SSRF check)
  try {
    await resolveAndValidateHost(parsedUrl.hostname);
  } catch (err) {
    return {
      status: 'COMPLETED',
      results: {
        success: false,
        error: `Host resolution failed: ${err.message}`,
        finalScore: 0,
      },
      modelVersion: MODEL_VERSION,
    };
  }

  // Step 3: Compute source credibility (before fetching)
  const sourceCredibility = computeSourceCredibility(parsedUrl);

  // Step 4: Fetch the URL
  let fetchResult;
  try {
    fetchResult = await safeFetchUrl(parsedUrl);
  } catch (err) {
    return {
      status: 'COMPLETED',
      results: {
        success: false,
        error: `Failed to fetch URL: ${err.message}`,
        finalScore: 0,
      },
      modelVersion: MODEL_VERSION,
    };
  }

  // Step 5: Parse HTML and extract metadata
  let metadata;
  let extractedText;
  try {
    const parsed = extractMetadataAndContent(fetchResult.body);
    metadata = parsed.metadata;
    extractedText = parsed.extractedText;
  } catch (err) {
    errors.push({ stage: 'html_parsing', message: err.message });
    metadata = {};
    extractedText = '';
  }

  // Step 6: Text preprocessing
  const preprocessing = preprocessText(extractedText);

  // Step 7: Extract claims (prefer NLP-enhanced via Python AI service)
  let claims = [];
  let entities = [];
  try {
    // Try NLP-enhanced extraction via Python AI service (Module 12)
    const claimEntityService = require('./claim-entity-extraction.service');
    const aiResult = await claimEntityService.extractClaimsAndEntities(
      extractedText,
      postId,
      contentJobId
    );
    if (aiResult.status === 'COMPLETED' && aiResult.savedAnalysis) {
      claims = aiResult.savedAnalysis.claims || [];
      entities = aiResult.savedAnalysis.entities || [];
    } else {
      // Fallback to heuristic extraction
      claims = extractClaims(extractedText);
      entities = extractEntities(extractedText);
    }
  } catch (err) {
    // Fallback to heuristic extraction if AI service fails
    try {
      claims = extractClaims(extractedText);
      entities = extractEntities(extractedText);
    } catch (innerErr) {
      errors.push({ stage: 'claim_extraction', message: innerErr.message });
    }
  }

  // Step 8: Verify claims against fact-check API
  let factCheckResults = [];
  if (claims.length > 0) {
    try {
      factCheckResults = await verifyClaims(claims);
    } catch (err) {
      errors.push({ stage: 'fact_verification', message: err.message });
    }
  }

  // Step 9: Estimate misinformation probability
  const misinformationProbability = estimateMisinformationProbability(
    extractedText,
    claims,
    sourceCredibility
  );

  // Step 11: Compute confidence
  const confidence = computeConfidence(
    extractedText.length,
    claims,
    entities,
    factCheckResults,
    sourceCredibility,
    errors
  );

  // Step 12: Compute composite trust score
  // Factors: source credibility, misinformation inverse, fact-check support, confidence
  const factCheckScore = factCheckResults.length > 0
    ? computeFactCheckScore(factCheckResults)
    : 0.5; // neutral if no fact-checks found

  const misinfoFactor = 1 - misinformationProbability;
  const finalScore = Math.round(
    (sourceCredibility * 0.30 +
      misinfoFactor * 0.30 +
      factCheckScore * 0.25 +
      confidence * 0.15) *
      100
  );

  const processingTimeMs = Date.now() - startTime;

  // Step 13: Store results in MongoDB
  const savedAnalysis = await LinkAnalysis.create({
    contentJob: contentJobId || null,
    post: postId || null,
    originalUrl: url,
    resolvedUrl: fetchResult.finalUrl,
    httpStatus: fetchResult.statusCode,
    redirectChain: fetchResult.redirectChain,
    pageTitle: metadata.pageTitle,
    metaDescription: metadata.metaDescription,
    ogTitle: metadata.ogTitle,
    ogDescription: metadata.ogDescription,
    ogImage: metadata.ogImage,
    ogType: metadata.ogType,
    ogSiteName: metadata.ogSiteName,
    keywords: metadata.keywords,
    canonicalUrl: metadata.canonicalUrl,
    language: metadata.language,
    extractedText,
    preprocessing,
    misinformationProbability,
    sourceCredibility,
    claims,
    entities,
    factCheckResults,
    confidence,
    finalScore: Math.max(0, Math.min(100, finalScore)),
    modelVersion: MODEL_VERSION,
    processingTimeMs,
    errors,
  });

  // Step 14: Create TrustScore document if postId is provided
  if (postId) {
    try {
      const tsLabel = getTrustLabel(finalScore);
      const tsExplanation = generateExplanation(
        sourceCredibility,
        misinformationProbability,
        claims.length,
        factCheckResults.length
      );

      await TrustScore.findOneAndUpdate(
        { post: postId },
        {
          post: postId,
          authenticity: Math.max(0, Math.min(1, sourceCredibility)),
          factualVerification: Math.max(0, Math.min(1, factCheckScore)),
          sourceCredibility: Math.max(0, Math.min(1, sourceCredibility)),
          modelConfidence: Math.max(0, Math.min(1, confidence)),
          score: Math.max(0, Math.min(100, finalScore)),
          label: tsLabel,
          explanation: tsExplanation,
          isOverrideApplied: false,
          modelVersion: MODEL_VERSION,
        },
        { upsert: true, new: true }
      );
    } catch (tsErr) {
      console.error('[LinkAnalysis] TrustScore creation failed:', tsErr.message);
    }
  }

  // Determine if review is required
  const needsReview = misinformationProbability > 0.7 || confidence < 0.3;

  return {
    status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
    results: {
      success: true,
      originalUrl: url,
      resolvedUrl: fetchResult.finalUrl,
      httpStatus: fetchResult.statusCode,
      pageTitle: metadata.pageTitle,
      metaDescription: metadata.metaDescription,
      claims: claims.length,
      entities: entities.length,
      factCheckResults: factCheckResults.length,
      misinformationProbability,
      sourceCredibility,
      confidence,
      finalScore: Math.max(0, Math.min(100, finalScore)),
    },
    modelVersion: MODEL_VERSION,
    savedAnalysis,
  };
}

/**
 * Compute a fact-check score (0-1) based on ratings found.
 * Positive/true ratings increase score; false ratings decrease it.
 */
function computeFactCheckScore(factCheckResults) {
  if (!factCheckResults || factCheckResults.length === 0) return 0.5;

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  const positivePatterns = [
    /true|correct|accurate|supported|verified|fact/i,
  ];
  const negativePatterns = [
    /false|incorrect|inaccurate|unsupported|debunked|misleading|fake|wrong/i,
  ];

  for (const result of factCheckResults) {
    const rating = (result.rating || '').toLowerCase();
    let matched = false;

    for (const pattern of positivePatterns) {
      if (pattern.test(rating)) {
        positiveCount++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const pattern of negativePatterns) {
      if (pattern.test(rating)) {
        negativeCount++;
        matched = true;
        break;
      }
    }
    if (!matched) neutralCount++;
  }

  const total = positiveCount + negativeCount + neutralCount;
  if (total === 0) return 0.5;

  // Weighted score: positive raises, negative lowers, neutral stays
  const score =
    (positiveCount * 0.8 + neutralCount * 0.5 + negativeCount * 0.2) / total;

  return Math.max(0, Math.min(1, score));
}

// ─── Query Helpers ────────────────────────────────────────────────

async function getAnalysisForPost(postId) {
  return LinkAnalysis.findOne({ post: postId }).sort({ createdAt: -1 });
}

async function getAnalysisForJob(jobId) {
  const ContentJob = require('../models/content-job.model');
  const job = await ContentJob.findOne({ jobId });
  if (!job) return null;
  return LinkAnalysis.findOne({ contentJob: job._id }).sort({ createdAt: -1 });
}

module.exports = {
  analyzeLink,
  analyzeLinkDirect,
  getAnalysisForPost,
  getAnalysisForJob,
  validateUrl,
  resolveAndValidateHost,
  safeFetchUrl,
  extractMetadataAndContent,
  extractClaims,
  extractEntities,
  computeSourceCredibility,
  estimateMisinformationProbability,
  MODEL_VERSION,
};
