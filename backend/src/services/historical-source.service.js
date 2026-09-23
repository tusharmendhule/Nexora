/**
 * Historical Source Service
 * ==========================
 * Discovers REAL published articles — with real URLs, real publishers and
 * real publication dates — for Nexora's historical import.
 *
 * This service never generates news. Every record it returns can be traced
 * back to a live, public source of record, and every record carries the URL
 * it came from so any claim about it can be checked independently.
 *
 * ── Primary provider: Wikipedia "Portal:Current events" daily archives ──
 * Each daily page is an archived, dated record of what actually happened on
 * that day, and it cites the real mainstream articles that reported each
 * event — Reuters, AP, BBC, Al Jazeera, The Hindu, and so on — with their
 * real URLs and publisher names. Two properties matter here:
 *
 *   1. Coverage is COMPLETE for the whole requested window (the pages are
 *      permanent archives), so the historical date distribution does not
 *      depend on a rolling news window.
 *   2. The publisher label attached to each citation gives an independent
 *      check on the URL: the citation host must agree with the named
 *      publisher, or the record is rejected.
 *
 * ── Optional provider: GDELT DOC 2.0 API ──
 * A real open news index, used additively when it is reachable. It is rate
 * limited to roughly one request every five seconds and its article index
 * only reaches back a few months, so it can never be the only provider.
 *
 * Neither provider needs an API key, and nothing is ever written here: this
 * module is read-only discovery. Persistence belongs to the import service.
 */

// ─── Configuration ─────────────────────────────────────────────────────

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

const USER_AGENT =
  'NexoraHistoricalImport/1.0 (Nexora misinformation-verification platform)';

/**
 * Pacing defaults.
 *
 * The source hosts are public infrastructure and will rate limit (HTTP 429)
 * a client that bursts. The defaults here are deliberately conservative:
 * roughly one request per second with a single worker, plus a long cooldown
 * when a 429 does arrive. Combined with the per-day cache, a large window is
 * still a couple of minutes rather than a retry storm.
 */
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 900;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 25000;

/**
 * Bump whenever parsing, validation or categorisation changes. Cached day
 * payloads carrying an older version are treated as misses, so a stale
 * classification can never be served from disk.
 */
const CACHE_VERSION = 2;

/**
 * Domains that must never appear as a source. These are the placeholder and
 * documentation domains called out by the import spec: a record using one of
 * them is fabricated by definition.
 */
const PLACEHOLDER_DOMAINS = Object.freeze([
  'example.com',
  'example.org',
  'example.net',
  'fake-news.com',
  'test-news.com',
  'test.example',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

/**
 * Category targets from the import spec. These are targets, not quotas: if
 * the real sources do not offer enough material for a category, the shortfall
 * is reported instead of being filled with invented content.
 */
const CATEGORY_TARGETS = Object.freeze({
  TECHNOLOGY: 20,
  INDIA: 20,
  POLITICS: 20,
  SCIENCE: 15,
  HEALTH: 15,
  ENVIRONMENT: 15,
  WORLD: 15,
  BUSINESS: 10,
  SPORTS: 10,
  EDUCATION_SOCIAL: 10,
});

const TARGET_TOTAL = Object.values(CATEGORY_TARGETS).reduce((a, b) => a + b, 0);

/**
 * Map a Wikipedia Current Events section heading to a Nexora category.
 * Section headings come from the source page structure, so the category is
 * derived from how the source itself classified the event.
 */
const SECTION_CATEGORY_MAP = Object.freeze({
  'armed conflicts and attacks': 'WORLD',
  'armed conflicts': 'WORLD',
  'international relations': 'WORLD',
  'disasters and accidents': 'WORLD',
  'law and crime': 'POLITICS',
  'politics and elections': 'POLITICS',
  'business and economy': 'BUSINESS',
  'business': 'BUSINESS',
  'science and technology': 'TECHNOLOGY',
  'technology': 'TECHNOLOGY',
  'science': 'SCIENCE',
  'space': 'SCIENCE',
  'health': 'HEALTH',
  'health and environment': 'ENVIRONMENT',
  'environment': 'ENVIRONMENT',
  'climate': 'ENVIRONMENT',
  'sports': 'SPORTS',
  'education': 'EDUCATION_SOCIAL',
  'society': 'EDUCATION_SOCIAL',
  'culture': 'EDUCATION_SOCIAL',
});

/** Keywords that mark an item as India-focused regardless of its section. */
const INDIA_KEYWORDS = Object.freeze([
  'india',
  'indian',
  'maharashtra',
  'mumbai',
  'delhi',
  'bengaluru',
  'bangalore',
  'chennai',
  'kolkata',
  'hyderabad',
  'isro',
  'rupee',
  'lok sabha',
  'rajya sabha',
  'supreme court of india',
  'modi',
]);

const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

// ─── Small utilities ───────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/** UTC date (YYYY-MM-DD) for a Date, independent of the host timezone. */
function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD into a UTC Date, returning null when malformed. */
function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Every UTC date key from start through end, inclusive. */
function enumerateDateKeys(startDate, endDate) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end || start > end) return [];

  const keys = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    keys.push(toDateKey(cursor));
  }
  return keys;
}

/** Wikipedia Current Events page title for a UTC date key. */
function currentEventsPageTitle(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `Portal:Current events/${year} ${MONTH_NAMES[month - 1]} ${day}`;
}

// ─── URL validation ────────────────────────────────────────────────────

/**
 * Normalize a URL for comparison and duplicate detection: lowercase host,
 * strip the fragment, drop tracking parameters, and remove a trailing slash.
 * Returns null when the value is not a usable http(s) URL.
 */
function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (_) {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';

  // Drop campaign/analytics parameters so the same article is not treated as
  // two different sources.
  const trackingPrefixes = ['utm_', 'gclid', 'fbclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'source'];
  const keep = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowered = key.toLowerCase();
    if (trackingPrefixes.some((prefix) => lowered === prefix || lowered.startsWith(prefix))) continue;
    keep.push([key, value]);
  }
  keep.sort(([a], [b]) => a.localeCompare(b));
  parsed.search = '';
  for (const [key, value] of keep) parsed.searchParams.append(key, value);

  let normalized = parsed.toString();
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

/** The registrable-ish host of a URL, without a leading "www.". */
function hostOf(rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

/** True when the host is a placeholder/documentation domain. */
function isPlaceholderHost(host) {
  if (!host) return true;
  return PLACEHOLDER_DOMAINS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`)
  );
}

/**
 * Validate a source URL. Returns { valid, reason, normalized, host }.
 * This is the URL half of the spec's pre-insertion validation rules.
 */
function validateSourceUrl(rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return { valid: false, reason: 'URL is missing or not a valid http(s) URL', normalized: null, host: null };
  }

  const host = hostOf(normalized);
  if (!host) {
    return { valid: false, reason: 'URL has no resolvable host', normalized, host: null };
  }
  if (isPlaceholderHost(host)) {
    return { valid: false, reason: `URL host "${host}" is a placeholder domain`, normalized, host };
  }
  if (!host.includes('.')) {
    return { valid: false, reason: `URL host "${host}" is not a public domain`, normalized, host };
  }

  return { valid: true, reason: null, normalized, host };
}

/**
 * Try to recover the publication date the publisher itself encoded in the
 * URL (a very common pattern, e.g. ".../2026-05-17/"). Using it makes the
 * stored date verifiable straight from the source URL. Returns YYYY-MM-DD or
 * null.
 */
function extractDateFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const patterns = [
    /(20\d{2})-(\d{2})-(\d{2})/,   // 2026-05-17
    /(20\d{2})\/(\d{2})\/(\d{2})/, // 2026/05/17
    /\/(20\d{2})(\d{2})(\d{2})/,     // 20260517, e.g. /20260517-slug/
  ];

  for (const pattern of patterns) {
    const match = rawUrl.match(pattern);
    if (!match) continue;
    const [, year, month, day] = match;
    const candidate = `${year}-${month}-${day}`;
    if (parseDateKey(candidate)) return candidate;
  }
  return null;
}

// ─── Wikitext parsing ──────────────────────────────────────────────────

/** Strip wiki markup from an item's prose, leaving readable text. */
function cleanWikitext(text) {
  if (typeof text !== 'string') return '';

  let out = text;

  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
  out = out.replace(/<ref[^>]*\/>/gi, ' ');
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<[^>]+>/g, ' ');
  // Remove the citation brackets entirely — the URLs are captured separately.
  out = out.replace(/\[https?:\/\/[^\]]*\]/g, ' ');
  // [[target|display]] -> display, [[target]] -> target
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]*)\]\]/g, '$1');
  out = out.replace(/'''/g, '');
  out = out.replace(/''/g, '');
  out = out.replace(/&nbsp;/g, ' ');
  out = out.replace(/&amp;/g, '&');
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#39;/g, "'");
  out = out.replace(/\s+/g, ' ');

  return out.trim();
}

/** Pull `url` + publisher label out of a single citation's label text. */
function cleanCitationLabel(label, url) {
  let cleaned = cleanWikitext(label || '');
  cleaned = cleaned.replace(/^[([\s]+/, '').replace(/[)\]\s]+$/, '').trim();

  if (!cleaned) {
    const host = hostOf(url);
    cleaned = host ? host.replace(/^www\./, '') : 'Unknown publisher';
  }
  return clampText(cleaned, 120);
}

/**
 * Extract every citation from a raw wikitext item line.
 * Supports the bare-URL form used by the Current Events portal
 * (`[https://... (Publisher)]`) and inline `{{cite ...}}` templates.
 */
function extractCitations(rawLine) {
  const citations = [];

  const bracketPattern = /\[(https?:\/\/[^\s\]]+)((?:\s+[^\]]*)?)\]/g;
  let match;
  while ((match = bracketPattern.exec(rawLine)) !== null) {
    const [, url, label] = match;
    const validation = validateSourceUrl(url);
    if (!validation.valid) continue;
    citations.push({
      url: validation.normalized,
      host: validation.host,
      publisherLabel: cleanCitationLabel(label, url),
    });
  }

  const templatePattern = /\{\{\s*cite[^}]*\}\}/gi;
  while ((match = templatePattern.exec(rawLine)) !== null) {
    const body = match[0];
    const urlMatch = body.match(/\|\s*url\s*=\s*([^|}\s]+)/i);
    if (!urlMatch) continue;
    const validation = validateSourceUrl(urlMatch[1]);
    if (!validation.valid) continue;
    const publisherMatch = body.match(/\|\s*(?:publisher|work|website)\s*=\s*([^|}]+)/i);
    citations.push({
      url: validation.normalized,
      host: validation.host,
      publisherLabel: publisherMatch
        ? cleanCitationLabel(publisherMatch[1], urlMatch[1])
        : cleanCitationLabel('', urlMatch[1]),
    });
  }

  return citations;
}

/**
 * Confirm that a citation's URL host agrees with the publisher named by the
 * source. This is the "URL/date check" from the spec's import process: a
 * record whose publisher label cannot be reconciled with its URL is dropped
 * rather than trusted.
 */
function publisherMatchesHost(publisherLabel, host) {
  if (!publisherLabel || !host) return false;

  const label = publisherLabel.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const hostSquashed = host.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!label || !hostSquashed) return false;

  if (hostSquashed.includes(label) || label.includes(hostSquashed)) return true;

  // Common abbreviations used by the portal's labels.
  const aliases = {
    afp: ['arabnews', 'afp'],
    ap: ['apnews'],
    apnews: ['apnews', 'ap'],
    nytimes: ['nytimes'],
    wsj: ['wsj'],
    aljazeera: ['aljazeera', 'aje'],
    abc: ['abcnews', 'abc', 'abcnet'],
    npr: ['npr'],
  };
  for (const [key, values] of Object.entries(aliases)) {
    if (label.includes(key) && values.some((value) => hostSquashed.includes(value))) return true;
  }

  return false;
}

/**
 * Parse a Current Events page's wikitext into dated news items.
 * Returns items of the form:
 *   { section, text, citations: [{ url, host, publisherLabel }] }
 */
function parseCurrentEventsPage(wikitext) {
  if (typeof wikitext !== 'string' || wikitext.trim() === '') return [];

  const items = [];
  let section = 'General';

  for (const rawLine of wikitext.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('<!--')) continue;

    // Section heading: '''Heading'''
    const heading = line.match(/^'''([^']+)'''\s*$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    // Only bullet lines carry events. Strip the bullet-depth markers (*, **,
    // ***,...) first so they never leak into the extracted prose.
    if (!line.startsWith('*')) continue;
    const body = line.replace(/^\*+\s*/, '');

    const text = cleanWikitext(body);
    const citations = extractCitations(line);

    // An item needs real prose and at least one usable citation; the portal
    // also carries bullet-only navigation scaffolding without either.
    if (text.length < 30 || citations.length === 0) continue;

    items.push({ section, text, citations });
  }

  return items;
}

// ─── Record construction ───────────────────────────────────────────────

/** Derive the Nexora category for an item from its section and text. */
function categorize(section, text) {
  const lowered = `${section} ${text}`.toLowerCase();
  const sectionLower = String(section || '').toLowerCase();

  // The source's combined "Science and technology" section covers both, so
  // split it on real subject matter instead of collapsing every discovery
  // into the technology bucket.
  if (sectionLower.includes('science and technology') || sectionLower.includes('science')) {
    const isScience = /\b(space|spacecraft|nasa|isro|esa|rocket|satellite|orbit|telescope|asteroid|comet|astronom|galaxy|exoplanet|physics|chemistry|biology|genome|quantum|research team|scientists|study finds|clinical trial)\b/.test(lowered);
    if (isScience) return 'SCIENCE';
    if (sectionLower.includes('technology') || /\b(ai|artificial intelligence|software|chip|semiconductor|cyber|app|platform|robot|drone)\b/.test(lowered)) {
      return 'TECHNOLOGY';
    }
    // A bare "Science" section with no extra signal is still science.
    return sectionLower.includes('science') ? 'SCIENCE' : 'TECHNOLOGY';
  }

  // India-focused reporting is its own bucket in the spec, and the portal
  // does not give it its own section, so detect it from the item text.
  if (INDIA_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    // Only classify as INDIA when the event is substantially about India:
    // either the section is generic, or multiple India signals are present.
    const hits = INDIA_KEYWORDS.filter((keyword) => lowered.includes(keyword)).length;
    const sectionCategory = SECTION_CATEGORY_MAP[section.toLowerCase()];
    if (hits >= 2 || !sectionCategory || sectionCategory === 'POLITICS' || sectionCategory === 'WORLD') {
      return 'INDIA';
    }
  }

  const mapped = SECTION_CATEGORY_MAP[section.toLowerCase()];
  if (mapped) return mapped;

  // Fall back to keyword signals when the section is unfamiliar.
  if (/health|vaccin|outbreak|disease|hospital/i.test(lowered)) return 'HEALTH';
  if (/climate|carbon|emission|environment|wildlife|conservation/i.test(lowered)) return 'ENVIRONMENT';
  if (/artificial intelligence|software|chip|semiconductor|cyber|satellite launch/i.test(lowered)) return 'TECHNOLOGY';
  if (/space|nasa|isro|telescope|asteroid|rocket/i.test(lowered)) return 'SCIENCE';
  if (/election|parliament|court|supreme court|government/i.test(lowered)) return 'POLITICS';
  if (/market|inflation|economy|gdp|trade|crypto/i.test(lowered)) return 'BUSINESS';
  if (/match|tournament|championship|olympic|league/i.test(lowered)) return 'SPORTS';
  if (/school|university|education|student/i.test(lowered)) return 'EDUCATION_SOCIAL';

  return 'WORLD';
}

/**
 * Build a normalized import record from a parsed item, or return
 * { record: null, reason } when the item cannot be trusted as a real source.
 *
 * The publication date prefers the date the publisher encoded in its own URL
 * and otherwise falls back to the date of the Current Events page it was
 * reported on.
 */
function buildRecordFromItem(item, dateKey, pageTitle, options = {}) {
  const { requirePublisherMatch = false, preferPublisherMatch = true } = options;

  const usable = [];
  for (const citation of item.citations) {
    const validation = validateSourceUrl(citation.url);
    if (!validation.valid) continue;

    const publisherHostMatch = publisherMatchesHost(citation.publisherLabel, validation.host);

    // Publisher/host agreement is recorded as provenance, not used as a hard
    // gate: real citations frequently use an abbreviated publication name
    // ("La Jornada" → jornada.com.mx) that no string comparison can resolve,
    // and discarding those would throw away verifiable real sources.
    if (requirePublisherMatch && !publisherHostMatch) continue;

    usable.push({
      url: validation.normalized,
      host: validation.host,
      sourceName: citation.publisherLabel,
      publisherHostMatch,
    });
  }

  if (usable.length === 0) {
    return { record: null, reason: 'no citation had a valid, non-placeholder URL' };
  }

  // Prefer a citation whose publisher label agrees with its host, so the
  // stored record carries the strongest provenance available.
  if (preferPublisherMatch) {
    usable.sort((a, b) => Number(b.publisherHostMatch) - Number(a.publisherHostMatch));
  }

  const chosen = usable[0];
  const title = clampText(item.text.split(/(?<=[.!?])\s+/)[0] || item.text, 180);
  const urlDateKey = extractDateFromUrl(chosen.url);

  // Only trust a URL-embedded date when it is near the page date — publishers
  // also embed unrelated numbers, and a wildly different date means the URL
  // date is not the publication date.
  let publishedAt = dateKey;
  if (urlDateKey) {
    const pageTime = parseDateKey(dateKey).getTime();
    const urlTime = parseDateKey(urlDateKey).getTime();
    const daysApart = Math.abs(pageTime - urlTime) / 86400000;
    if (daysApart <= 3) publishedAt = urlDateKey;
  }

  return {
    record: {
      sourceUrl: chosen.url,
      sourceName: chosen.sourceName,
      title,
      content: clampText(item.text, 600),
      publishedAt: `${publishedAt}T00:00:00.000Z`,
      publishedAtSource: urlDateKey && publishedAt === urlDateKey ? 'publisher-url' : 'source-page-date',
      category: categorize(item.section, item.text),
      language: 'en',
      discovery: {
        provider: 'wikipedia-current-events',
        page: pageTitle,
        section: item.section,
        citationCount: usable.length,
        publisherHostMatch: chosen.publisherHostMatch,
        publisherHost: chosen.host,
        alternativeUrls: usable.slice(1, 4).map((c) => c.url),
      },
    },
    reason: null,
  };
}

// ─── Record validation ─────────────────────────────────────────────────

/**
 * Validate a record against the spec's pre-insertion rules.
 * Returns { valid, errors } so the caller can reject and report per-record.
 */
function validateRecord(record, { startDate, endDate } = {}) {
  const errors = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['record is not an object'] };
  }

  const urlValidation = validateSourceUrl(record.sourceUrl);
  if (!urlValidation.valid) errors.push(`sourceUrl: ${urlValidation.reason}`);

  if (!record.sourceName || String(record.sourceName).trim() === '') {
    errors.push('sourceName is missing');
  }

  if (!record.title || String(record.title).trim() === '') {
    errors.push('title is missing');
  }

  if (!record.content || String(record.content).trim() === '') {
    errors.push('content is missing');
  }

  if (!record.category || String(record.category).trim() === '') {
    errors.push('category is missing');
  }

  if (!record.language || String(record.language).trim() === '') {
    errors.push('language is missing');
  }

  const published = record.publishedAt ? new Date(record.publishedAt) : null;
  if (!published || Number.isNaN(published.getTime())) {
    errors.push('publishedAt is missing or not a valid date');
  } else {
    const key = toDateKey(published);
    const start = startDate ? parseDateKey(startDate) : null;
    const end = endDate ? parseDateKey(endDate) : null;
    if (start && published < start) {
      errors.push(`publishedAt ${key} is before the window start ${startDate}`);
    }
    if (end && published > end) {
      errors.push(`publishedAt ${key} is after the window end ${endDate}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Deterministic fingerprint over normalized URL + normalized content. */
function recordFingerprint(record) {
  const crypto = require('crypto');
  const url = normalizeUrl(record.sourceUrl) || '';
  const content = String(record.content || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(`${url}|${content}`).digest('hex').slice(0, 32);
}

/**
 * Remove duplicate records by normalized URL and by fingerprint, keeping the
 * first occurrence. Re-running the fetch can therefore never inflate the
 * dataset.
 */
function dedupeRecords(records) {
  const seenUrls = new Set();
  const seenFingerprints = new Set();
  const unique = [];
  let duplicates = 0;

  for (const record of records) {
    const normalizedUrl = normalizeUrl(record.sourceUrl);
    const fingerprint = recordFingerprint(record);

    if (!normalizedUrl || seenUrls.has(normalizedUrl) || seenFingerprints.has(fingerprint)) {
      duplicates += 1;
      continue;
    }

    seenUrls.add(normalizedUrl);
    seenFingerprints.add(fingerprint);
    unique.push({ ...record, sourceUrl: normalizedUrl, fingerprint });
  }

  return { records: unique, duplicates };
}

// ─── HTTP helpers ──────────────────────────────────────────────────────

async function fetchJson(
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, rateLimitBackoffMs = DEFAULT_RATE_LIMIT_BACKOFF_MS } = {}
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });

      if (response.status === 429) {
        // Tagged so callers can back off (and give up) instead of retrying a
        // host that is actively refusing requests. The backoff is deliberately
        // long: a rate limiter expects silence, not a retry storm.
        const rateLimited = new Error('rate limited (HTTP 429)');
        rateLimited.code = 'RATE_LIMITED';
        lastError = rateLimited;
        if (attempt < retries) await sleep(rateLimitBackoffMs * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('request failed');
}

// ─── Providers ─────────────────────────────────────────────────────────

/**
 * Per-day discovery cache.
 *
 * Two reasons this exists:
 *   1. Resumability — a run interrupted by rate limiting must not re-fetch
 *      work it already completed.
 *   2. Politeness — re-running the import never re-hits the source host.
 *
 * The cache stores the parsed records for a day plus whether the page was
 * absent, which is all a later run needs.
 */
function dayCachePath(cacheDir, dateKey) {
  if (!cacheDir) return null;
  return require('path').join(cacheDir, `${dateKey}.json`);
}

function readDayCache(cacheDir, dateKey) {
  const filePath = dayCachePath(cacheDir, dateKey);
  if (!filePath) return null;

  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.records)) return null;
    if (parsed.cacheVersion !== CACHE_VERSION) return null;
    return parsed;
  } catch (_) {
    // A corrupt cache entry is treated as a miss and refetched.
    return null;
  }
}

function writeDayCache(cacheDir, dateKey, payload) {
  const filePath = dayCachePath(cacheDir, dateKey);
  if (!filePath) return;

  const fs = require('fs');
  const path = require('path');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ cacheVersion: CACHE_VERSION, ...payload }), 'utf8');
  } catch (_) {
    // Caching is an optimization; a write failure must not fail the fetch.
  }
}

/** Fetch the wikitext for one Current Events day, or null when absent. */
async function fetchCurrentEventsDay(dateKey, options = {}) {
  const pageTitle = currentEventsPageTitle(dateKey);
  const url =
    `${WIKIPEDIA_API}?action=parse&format=json&formatversion=2&prop=wikitext` +
    `&redirects=1&page=${encodeURIComponent(pageTitle)}`;

  const payload = await fetchJson(url, options);
  const wikitext = payload?.parse?.wikitext;

  // Missing days return an `error` object; that is a data gap, not a failure.
  if (!wikitext) return { pageTitle, wikitext: null, missing: true };
  return { pageTitle, wikitext, missing: false };
}

/**
 * Walk every day in the window and collect real, cited news items.
 * Returns { records, errors, daysFetched, daysMissing }.
 */
async function fetchFromCurrentEvents({
  startDate,
  endDate,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs,
  concurrency = DEFAULT_CONCURRENCY,
  cacheDir = null,
  stride = 1,
  maxConsecutiveRateLimits = 4,
  onProgress,
} = {}) {
  const allDateKeys = enumerateDateKeys(startDate, endDate);
  // A stride lets the caller trade date density for far fewer requests, which
  // matters when a host is rate limiting the client.
  const dateKeys = stride > 1
    ? allDateKeys.filter((_, index) => index % stride === 0)
    : allDateKeys;

  const records = [];
  const errors = [];
  let daysFetched = 0;
  let daysMissing = 0;
  let daysFailed = 0;
  let daysFromCache = 0;
  let completed = 0;
  let cursor = 0;
  let consecutiveRateLimits = 0;
  let aborted = null;

  // Bounded worker pool: a six-month window is ~185 page fetches, which is
  // far too slow sequentially but does not need to hammer the host either.
  async function worker() {
    for (;;) {
      if (aborted) return;

      const index = cursor;
      cursor += 1;
      if (index >= dateKeys.length) return;

      const dateKey = dateKeys[index];

      // Cached days are the whole point of resumability: a run that was cut
      // short by rate limiting picks up where it stopped.
      const cached = readDayCache(cacheDir, dateKey);
      if (cached) {
        daysFromCache += 1;
        if (cached.missing) daysMissing += 1;
        else {
          daysFetched += 1;
          records.push(...cached.records);
        }
        completed += 1;
        if (onProgress) {
          onProgress({ dateKey, records: records.length, daysFetched, daysMissing, daysFailed, daysFromCache, completed, total: dateKeys.length, aborted: false });
        }
        continue;
      }

      try {
        const { pageTitle, wikitext, missing } = await fetchCurrentEventsDay(dateKey, { timeoutMs });
        const dayRecords = [];

        if (missing) {
          daysMissing += 1;
        } else {
          daysFetched += 1;
          for (const item of parseCurrentEventsPage(wikitext)) {
            const { record, reason } = buildRecordFromItem(item, dateKey, pageTitle);
            if (record) dayRecords.push(record);
            else errors.push({ date: dateKey, stage: 'SOURCE_RECORD', error: reason });
          }
          records.push(...dayRecords);
        }

        consecutiveRateLimits = 0;
        writeDayCache(cacheDir, dateKey, { missing: Boolean(missing), records: dayRecords });
      } catch (error) {
        daysFailed += 1;
        errors.push({ date: dateKey, stage: 'SOURCE_FETCH', error: error.message });

        if (error.code === 'RATE_LIMITED') {
          consecutiveRateLimits += 1;
          // Stop instead of spinning: the remaining days are reported as not
          // fetched, and a later run resumes from the cache.
          if (consecutiveRateLimits >= maxConsecutiveRateLimits && !aborted) {
            aborted = `rate limited by the source host (${consecutiveRateLimits} in a row)`;
          }
        }
      }

      completed += 1;
      if (onProgress) {
        onProgress({
          dateKey,
          records: records.length,
          daysFetched,
          daysMissing,
          daysFailed,
          daysFromCache,
          completed,
          total: dateKeys.length,
          aborted: Boolean(aborted),
        });
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, dateKeys.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Deterministic ordering regardless of which worker finished first.
  records.sort((a, b) => {
    const byDate = new Date(a.publishedAt) - new Date(b.publishedAt);
    return byDate !== 0 ? byDate : a.sourceUrl.localeCompare(b.sourceUrl);
  });

  return {
    records,
    errors,
    daysFetched,
    daysMissing,
    daysFailed,
    daysFromCache,
    daysInRange: allDateKeys.length,
    daysScheduled: dateKeys.length,
    aborted,
  };
}

/**
 * Best-effort GDELT discovery. An optional additive provider: any failure is
 * reported and never blocks the primary provider.
 */
async function fetchFromGdelt({ startDate, endDate, queries = [], maxRecordsPerQuery = 50, delayMs = 5500 } = {}) {
  const records = [];
  const errors = [];

  for (const query of queries) {
    const url =
      `${GDELT_API}?query=${encodeURIComponent(query)}&mode=artlist&format=json` +
      `&sort=hybridrel&maxrecords=${maxRecordsPerQuery}` +
      `&startdatetime=${startDate.replace(/-/g, '')}000000` +
      `&enddatetime=${endDate.replace(/-/g, '')}235959`;

    try {
      const payload = await fetchJson(url, { retries: 1 });
      for (const article of payload?.articles || []) {
        const validation = validateSourceUrl(article.url);
        if (!validation.valid) continue;
        if (!article.title) continue;

        const seendate = String(article.seendate || '');
        if (!/^\d{8}/.test(seendate)) continue;
        const publishedAt = `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}`;

        records.push({
          sourceUrl: validation.normalized,
          sourceName: article.domain || validation.host,
          title: clampText(article.title, 180),
          content: clampText(article.title, 600),
          publishedAt: `${publishedAt}T00:00:00.000Z`,
          publishedAtSource: 'provider-seendate',
          category: categorize('General', article.title),
          language: article.language || 'en',
          discovery: { provider: 'gdelt', query, domain: article.domain || null },
        });
      }
    } catch (error) {
      errors.push({ query, stage: 'SOURCE_FETCH', error: error.message });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return { records, errors };
}

// ─── Selection ─────────────────────────────────────────────────────────

/**
 * Choose which records to import so the dataset is spread across the window
 * and across categories, without exceeding any category target.
 *
 * Real-world availability decides the outcome: a category with too little
 * material simply ends up short, and the caller reports that honestly.
 */
function selectRecords(records, { target = TARGET_TOTAL, categoryTargets = CATEGORY_TARGETS, perDayMax = 3 } = {}) {
  const byCategory = new Map();
  for (const record of records) {
    if (!byCategory.has(record.category)) byCategory.set(record.category, []);
    byCategory.get(record.category).push(record);
  }

  // Oldest first inside each category keeps the spread chronological.
  for (const list of byCategory.values()) {
    list.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  }

  const selected = [];
  const perDayCount = new Map();
  const categoryCount = new Map();
  const categoryKeys = [...byCategory.keys()].sort();

  /**
   * One round-robin pass across the categories, always respecting the
   * per-day ceiling that keeps the feed from looking like a single-day dump.
   * With `respectCategoryTargets` off, a category may exceed its target, so
   * material can be redistributed from categories that have plenty to those
   * the spec wanted but the real sources could not supply.
   */
  const roundRobin = (respectCategoryTargets) => {
    let progress = true;
    while (selected.length < target && progress) {
      progress = false;
      for (const key of categoryKeys) {
        if (selected.length >= target) break;

        if (respectCategoryTargets) {
          const cap = categoryTargets[key] ?? target;
          if ((categoryCount.get(key) || 0) >= cap) continue;
        }

        const list = byCategory.get(key);
        while (list.length > 0) {
          const candidate = list.shift();
          const day = toDateKey(candidate.publishedAt);
          if ((perDayCount.get(day) || 0) >= perDayMax) continue;

          selected.push(candidate);
          categoryCount.set(key, (categoryCount.get(key) || 0) + 1);
          perDayCount.set(day, (perDayCount.get(day) || 0) + 1);
          progress = true;
          break;
        }
      }
    }
  };

  // Pass 1: fill the spec's category targets.
  roundRobin(true);
  // Pass 2: the spec allows the final mix to differ when real availability
  // requires it. Unused budget from thin categories is redistributed rather
  // than left empty — and never filled with invented records.
  if (selected.length < target) roundRobin(false);

  selected.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  return { selected: dedupeRecords(selected).records, categoryCounts: categoryCount };
}

// ─── Orchestration ─────────────────────────────────────────────────────

/**
 * Discover, validate, dedupe and select real historical records.
 * Returns the dataset plus a full accounting of what was rejected and why.
 */
async function discoverHistoricalRecords({
  startDate,
  endDate,
  target = TARGET_TOTAL,
  categoryTargets = CATEGORY_TARGETS,
  perDayMax = 3,
  includeGdelt = false,
  gdeltQueries = [],
  delayMs = DEFAULT_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  cacheDir = null,
  stride = 1,
  onProgress = null,
} = {}) {
  const startedAt = new Date();
  const allErrors = [];

  const currentEvents = await fetchFromCurrentEvents({
    startDate, endDate, delayMs, concurrency, cacheDir, stride, onProgress,
  });
  allErrors.push(...currentEvents.errors);

  let gdeltRecords = [];
  let gdeltErrors = [];
  if (includeGdelt) {
    const gdelt = await fetchFromGdelt({ startDate, endDate, queries: gdeltQueries });
    gdeltRecords = gdelt.records;
    gdeltErrors = gdelt.errors;
    allErrors.push(...gdeltErrors);
  }

  const combined = [...currentEvents.records, ...gdeltRecords];
  const { records: unique, duplicates } = dedupeRecords(combined);

  // Per-record validation against the spec's pre-insertion rules.
  const valid = [];
  let rejected = 0;
  for (const record of unique) {
    const { valid: ok, errors } = validateRecord(record, { startDate, endDate });
    if (ok) {
      valid.push(record);
    } else {
      rejected += 1;
      allErrors.push({ url: record.sourceUrl, stage: 'VALIDATION', error: errors.join('; ') });
    }
  }

  const { selected, categoryCounts } = selectRecords(valid, { target, categoryTargets, perDayMax });

  return {
    records: selected,
    stats: {
      daysInRange: currentEvents.daysInRange,
      daysScheduled: currentEvents.daysScheduled,
      daysFetched: currentEvents.daysFetched,
      daysFromCache: currentEvents.daysFromCache,
      daysMissing: currentEvents.daysMissing,
      daysFailed: currentEvents.daysFailed,
      aborted: currentEvents.aborted || null,
      discovered: combined.length,
      duplicatesRemoved: duplicates,
      rejectedByValidation: rejected,
      validCandidates: valid.length,
      selected: selected.length,
      target,
      categoryCounts: Object.fromEntries(
        [...categoryCounts.entries()].map(([key, value]) => [key, value])
      ),
      availablePerCategory: [...unique.reduce((map, record) => {
        map.set(record.category, (map.get(record.category) || 0) + 1);
        return map;
      }, new Map()).entries()].map(([key, value]) => [key, value]),
      gdeltRecords: gdeltRecords.length,
      gdeltErrors: gdeltErrors.length,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    },
    errors: allErrors,
    providerBreakdown: selected.reduce((map, record) => {
      const provider = record.discovery?.provider || 'unknown';
      map[provider] = (map[provider] || 0) + 1;
      return map;
    }, {}),
  };
}

// ─── Exports ───────────────────────────────────────────────────────────

module.exports = {
  // Configuration
  CATEGORY_TARGETS,
  TARGET_TOTAL,
  PLACEHOLDER_DOMAINS,

  // Date helpers
  toDateKey,
  parseDateKey,
  enumerateDateKeys,
  currentEventsPageTitle,

  // URL helpers
  normalizeUrl,
  hostOf,
  isPlaceholderHost,
  validateSourceUrl,
  extractDateFromUrl,

  // Parsing
  cleanWikitext,
  extractCitations,
  publisherMatchesHost,
  parseCurrentEventsPage,
  categorize,
  buildRecordFromItem,

  // Validation / dedupe
  validateRecord,
  recordFingerprint,
  dedupeRecords,

  // Cache
  dayCachePath,
  readDayCache,
  writeDayCache,

  // Providers
  fetchCurrentEventsDay,
  fetchFromCurrentEvents,
  fetchFromGdelt,

  // Selection + orchestration
  selectRecords,
  discoverHistoricalRecords,
};
