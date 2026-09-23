/**
 * Historical Source Service Tests
 * ===============================
 * Covers the discovery half of the historical import: the rules that decide
 * whether a real public source may become a Nexora record.
 *
 * These tests are the guard against fabricated data. Every assertion here
 * exists to make sure an invented, malformed, out-of-window or placeholder
 * record cannot reach the importer.
 *
 * Covers:
 *   1. URL validation — real URLs pass, placeholders and non-http fail
 *   2. URL normalization — tracking parameters and fragments are stripped
 *   3. Publication date extraction from a publisher's own URL
 *   4. Wikitext parsing — sections, bullets, markup and citations
 *   5. Publisher/host agreement is recorded as provenance
 *   6. Record building uses real dates and never invents a fallback date
 *   7. Date-window validation, including the exact window boundaries
 *   8. Deduplication by normalized URL and by content fingerprint
 *   9. Category derivation from the source's own section headings
 *  10. Selection respects category targets, the per-day ceiling, and
 *      redistributes unused budget when a category has too little real
 *      material (instead of inventing records to fill it)
 *  11. Date enumeration/formatting for the requested window
 *
 * Run with: npm test -- --testPathPatterns=historical-source
 */

const historicalSource = require('../../src/services/historical-source.service');

// ─── 1/2/3. URLs and dates ────────────────────────────────────────────

describe('Historical source — URL and date validation', () => {
  test('accepts real publisher URLs', () => {
    const result = historicalSource.validateSourceUrl(
      'https://www.reuters.com/world/middle-east/some-story-2026-05-17/'
    );
    expect(result.valid).toBe(true);
    expect(result.host).toBe('reuters.com');
  });

  test.each([
    'https://example.com/fake-story',
    'https://www.fake-news.com/article',
    'https://test-news.com/2026/01/01/story',
    'http://localhost:3000/post',
    'not-a-url',
    '',
    'ftp://reuters.com/story',
  ])('rejects placeholder or malformed source URL: %s', (url) => {
    const result = historicalSource.validateSourceUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test('normalizes tracking parameters, fragments and trailing slashes', () => {
    const normalized = historicalSource.normalizeUrl(
      'https://www.bbc.com/news/story-12345/?utm_source=twitter&utm_medium=social#section'
    );
    expect(normalized).toBe('https://www.bbc.com/news/story-12345');
  });

  test('treats the same article with different tracking params as one source', () => {
    const a = historicalSource.normalizeUrl('https://thehindu.com/news/story-1?utm_source=a');
    const b = historicalSource.normalizeUrl('https://thehindu.com/news/story-1?fbclid=b');
    expect(a).toBe(b);
  });

  test('recovers the publication date the publisher encoded in its URL', () => {
    expect(historicalSource.extractDateFromUrl(
      'https://www.reuters.com/world/story-2026-05-17/'
    )).toBe('2026-05-17');
    expect(historicalSource.extractDateFromUrl(
      'https://www.middleeastmonitor.com/20260517-slug-here'
    )).toBe('2026-05-17');
    expect(historicalSource.extractDateFromUrl('https://bbc.com/news/story-12345')).toBeNull();
  });
});

// ─── 4/5/6. Parsing and record building ───────────────────────────────

describe('Historical source — wikitext parsing', () => {
  const wikitext = [
    "'''Armed conflicts and attacks'''",
    '*[[Some crisis]]',
    '**The [[United Arab Emirates]] reports a drone strike targeted a nuclear plant.'
      + ' [https://www.reuters.com/world/middle-east/story-2026-05-17/ (Reuters)]',
    '',
    "'''Science and technology'''",
    '*[[ISRO]] launches a navigation satellite from Sriharikota.'
      + ' [https://www.thehindu.com/sci-tech/isro-launch/article1.ece (The Hindu)]',
  ].join('\n');

  test('extracts dated items with their section and citations', () => {
    const items = historicalSource.parseCurrentEventsPage(wikitext);
    expect(items).toHaveLength(2);
    expect(items[0].section).toBe('Armed conflicts and attacks');
    expect(items[0].citations[0].url).toContain('reuters.com');
    expect(items[0].citations[0].publisherLabel).toBe('Reuters');
    expect(items[1].section).toBe('Science and technology');
  });

  test('strips wiki markup and bullet markers from the prose', () => {
    const items = historicalSource.parseCurrentEventsPage(wikitext);
    expect(items[0].text.startsWith('*')).toBe(false);
    expect(items[0].text).not.toContain('[[');
    expect(items[0].text).not.toContain('https://');
    expect(items[0].text).toContain('United Arab Emirates');
  });

  test('ignores bullets that carry no citation', () => {
    const items = historicalSource.parseCurrentEventsPage(
      "'''Health'''\n*Some unreferenced claim that is long enough to pass the length gate."
    );
    expect(items).toHaveLength(0);
  });

  test('records publisher/host agreement as provenance', () => {
    expect(historicalSource.publisherMatchesHost('Reuters', 'reuters.com')).toBe(true);
    expect(historicalSource.publisherMatchesHost('Al Jazeera', 'aje.news')).toBe(true);
    // An abbreviation no string comparison can resolve: recorded, not dropped.
    expect(historicalSource.publisherMatchesHost('La Jornada', 'jornada.com.mx')).toBe(false);
  });

  test('builds a record from a real citation, keeping the real URL', () => {
    const items = historicalSource.parseCurrentEventsPage(wikitext);
    const { record } = historicalSource.buildRecordFromItem(items[0], '2026-05-17', 'Portal:Current events/2026 May 17');

    expect(record.sourceUrl).toBe('https://www.reuters.com/world/middle-east/story-2026-05-17');
    expect(record.sourceName).toBe('Reuters');
    expect(record.title).toBeTruthy();
    expect(record.content).toBeTruthy();
    expect(record.language).toBe('en');
    // The publisher's own URL date wins because it is within 3 days of the page.
    expect(record.publishedAt).toBe('2026-05-17T00:00:00.000Z');
    expect(record.publishedAtSource).toBe('publisher-url');
  });

  test('falls back to the source page date when the URL carries no date', () => {
    const items = historicalSource.parseCurrentEventsPage(
      "'''Sports'''\n*A national team wins a championship final in extra time."
      + ' [https://www.bbc.com/sport/football/12345 (BBC)]'
    );
    const { record } = historicalSource.buildRecordFromItem(items[0], '2026-07-04', 'page');
    expect(record.publishedAt).toBe('2026-07-04T00:00:00.000Z');
    expect(record.publishedAtSource).toBe('source-page-date');
  });

  test('ignores a URL date far from the source page date', () => {
    const items = historicalSource.parseCurrentEventsPage(
      "'''Sports'''\n*A national team wins a championship final in extra time."
      + ' [https://www.bbc.com/sport/2020-01-01/old-story (BBC)]'
    );
    const { record } = historicalSource.buildRecordFromItem(items[0], '2026-07-04', 'page');
    expect(record.publishedAt).toBe('2026-07-04T00:00:00.000Z');
  });

  test('derives categories from the source section headings', () => {
    expect(historicalSource.categorize('Armed conflicts and attacks', 'A strike occurred.')).toBe('WORLD');
    expect(historicalSource.categorize('Business and economy', 'Markets rose.')).toBe('BUSINESS');
    expect(historicalSource.categorize('Science and technology', 'A chip was announced.')).toBe('TECHNOLOGY');
    expect(historicalSource.categorize('Sports', 'A final was played.')).toBe('SPORTS');
    expect(historicalSource.categorize('Health', 'A vaccine was approved.')).toBe('HEALTH');
  });

  test('classifies India-focused reporting as its own bucket', () => {
    const category = historicalSource.categorize(
      'Politics and elections',
      'The Maharashtra government announced new measures in Mumbai.'
    );
    expect(category).toBe('INDIA');
  });
});

// ─── 7/8. Validation and dedupe ───────────────────────────────────────

describe('Historical source — record validation', () => {
  const validRecord = {
    sourceUrl: 'https://www.reuters.com/world/story-2026-05-17/',
    sourceName: 'Reuters',
    title: 'A real headline',
    content: 'A real summary of a real event.',
    publishedAt: '2026-05-17T00:00:00.000Z',
    category: 'WORLD',
    language: 'en',
  };

  test('accepts a well-formed in-window record', () => {
    const result = historicalSource.validateRecord(validRecord, {
      startDate: '2026-03-22',
      endDate: '2026-09-22',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('accepts records exactly on the window boundaries', () => {
    expect(historicalSource.validateRecord(
      { ...validRecord, publishedAt: '2026-03-22T00:00:00.000Z' },
      { startDate: '2026-03-22', endDate: '2026-09-22' }
    ).valid).toBe(true);
    expect(historicalSource.validateRecord(
      { ...validRecord, publishedAt: '2026-09-22T00:00:00.000Z' },
      { startDate: '2026-03-22', endDate: '2026-09-22' }
    ).valid).toBe(true);
  });

  test('rejects a record dated before the window', () => {
    const result = historicalSource.validateRecord(
      { ...validRecord, publishedAt: '2026-03-21T00:00:00.000Z' },
      { startDate: '2026-03-22', endDate: '2026-09-22' }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/before the window start/);
  });

  test('rejects a record dated after the window', () => {
    const result = historicalSource.validateRecord(
      { ...validRecord, publishedAt: '2026-09-23T00:00:00.000Z' },
      { startDate: '2026-03-22', endDate: '2026-09-22' }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/after the window end/);
  });

  test.each([
    ['sourceUrl', { sourceUrl: 'https://example.com/fake' }],
    ['sourceName', { sourceName: '' }],
    ['title', { title: '' }],
    ['content', { content: '' }],
    ['category', { category: '' }],
    ['language', { language: '' }],
    ['publishedAt', { publishedAt: 'not-a-date' }],
  ])('rejects a record missing a valid %s', (_field, override) => {
    const result = historicalSource.validateRecord(
      { ...validRecord, ...override },
      { startDate: '2026-03-22', endDate: '2026-09-22' }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Historical source — deduplication', () => {
  test('removes records sharing a normalized URL', () => {
    const base = {
      sourceUrl: 'https://www.bbc.com/news/story-1',
      sourceName: 'BBC',
      title: 'T',
      content: 'C',
      publishedAt: '2026-05-01T00:00:00.000Z',
      category: 'WORLD',
      language: 'en',
    };
    const { records, duplicates } = historicalSource.dedupeRecords([
      base,
      { ...base, sourceUrl: 'https://www.bbc.com/news/story-1/?utm_source=x' },
      { ...base, sourceUrl: 'https://www.bbc.com/news/story-2', content: 'Different' },
    ]);

    expect(records).toHaveLength(2);
    expect(duplicates).toBe(1);
  });

  test('is deterministic — fingerprints are stable across calls', () => {
    const record = {
      sourceUrl: 'https://www.bbc.com/news/story-1',
      content: 'Some content here',
    };
    expect(historicalSource.recordFingerprint(record))
      .toBe(historicalSource.recordFingerprint({ ...record, sourceUrl: 'https://www.bbc.com/news/story-1/' }));
  });

  test('dedupe is idempotent — re-running changes nothing', () => {
    const records = [
      { sourceUrl: 'https://a.com/1', content: 'one' },
      { sourceUrl: 'https://b.com/2', content: 'two' },
    ];
    const first = historicalSource.dedupeRecords(records);
    const second = historicalSource.dedupeRecords(first.records);
    expect(second.records).toHaveLength(2);
    expect(second.duplicates).toBe(0);
  });
});

// ─── 9/10/11. Selection, dates and targets ────────────────────────────

describe('Historical source — selection and window handling', () => {
  const makeRecords = (category, count, dayOffset = 0) =>
    Array.from({ length: count }, (_, i) => ({
      sourceUrl: `https://www.reuters.com/${category.toLowerCase()}/${i}`,
      sourceName: 'Reuters',
      title: `${category} story ${i}`,
      content: `${category} content ${i}`,
      publishedAt: new Date(Date.UTC(2026, 4, 1 + dayOffset + i, 0, 0, 0)).toISOString(),
      category,
      language: 'en',
    }));

  test('honours category targets when the overall target can be met from them', () => {
    const { selected } = historicalSource.selectRecords(
      [...makeRecords('WORLD', 40, 0), ...makeRecords('SPORTS', 40, 60)],
      { target: 30, categoryTargets: { WORLD: 15, SPORTS: 15 }, perDayMax: 100 }
    );

    expect(selected).toHaveLength(30);
    expect(selected.filter((r) => r.category === 'WORLD')).toHaveLength(15);
    expect(selected.filter((r) => r.category === 'SPORTS')).toHaveLength(15);
  });

  test('redistributes unused category budget instead of leaving the dataset short', () => {
    // SPORTS only has 2 real records available against a target of 10, so the
    // remaining budget goes to a category that does have material rather than
    // being silently dropped (and never filled with invented records).
    const { selected } = historicalSource.selectRecords(
      [...makeRecords('WORLD', 40, 0), ...makeRecords('SPORTS', 2, 60)],
      { target: 20, categoryTargets: { WORLD: 15, SPORTS: 10 }, perDayMax: 100 }
    );

    expect(selected).toHaveLength(20);
    expect(selected.filter((r) => r.category === 'SPORTS')).toHaveLength(2);
    expect(selected.filter((r) => r.category === 'WORLD')).toHaveLength(18);
  });

  test('respects the per-day ceiling to keep the feed spread out', () => {
    const sameDay = Array.from({ length: 10 }, (_, i) => ({
      sourceUrl: `https://reuters.com/x/${i}`,
      sourceName: 'Reuters',
      title: `t${i}`,
      content: `c${i}`,
      publishedAt: '2026-05-01T00:00:00.000Z',
      category: 'WORLD',
      language: 'en',
    }));
    const { selected } = historicalSource.selectRecords(sameDay, {
      target: 150,
      categoryTargets: { WORLD: 15 },
      perDayMax: 3,
    });
    expect(selected).toHaveLength(3);
  });

  test('spreads selection across categories rather than draining the first', () => {
    const records = [
      ...makeRecords('WORLD', 30, 0),
      ...makeRecords('SPORTS', 10, 40),
    ];
    const { selected } = historicalSource.selectRecords(records, {
      target: 20,
      categoryTargets: { WORLD: 15, SPORTS: 10 },
      perDayMax: 5,
    });
    const categories = new Set(selected.map((r) => r.category));
    expect(categories.has('WORLD')).toBe(true);
    expect(categories.has('SPORTS')).toBe(true);
  });

  test('reports a shortfall instead of inventing records when material is thin', () => {
    const { selected } = historicalSource.selectRecords(makeRecords('WORLD', 4), {
      target: 150,
      categoryTargets: { WORLD: 15 },
      perDayMax: 10,
    });
    expect(selected).toHaveLength(4);
    expect(selected.length).toBeLessThan(150);
  });

  test('enumerates every day of the requested window inclusively', () => {
    const keys = historicalSource.enumerateDateKeys('2026-03-22', '2026-09-22');
    expect(keys).toHaveLength(185);
    expect(keys[0]).toBe('2026-03-22');
    expect(keys[keys.length - 1]).toBe('2026-09-22');
  });

  test('builds the source page title for a date', () => {
    expect(historicalSource.currentEventsPageTitle('2026-05-17'))
      .toBe('Portal:Current events/2026 May 17');
  });

  test('inverted or malformed windows produce no dates rather than throwing', () => {
    expect(historicalSource.enumerateDateKeys('2026-09-22', '2026-03-22')).toEqual([]);
    expect(historicalSource.enumerateDateKeys('nonsense', '2026-03-22')).toEqual([]);
  });
});

// ─── Cache ────────────────────────────────────────────────────────────

describe('Historical source — day cache', () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  let cacheDir;
  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-hist-cache-'));
  });
  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  test('round-trips a day payload', () => {
    historicalSource.writeDayCache(cacheDir, '2026-05-17', {
      missing: false,
      records: [{ sourceUrl: 'https://reuters.com/a' }],
    });
    const cached = historicalSource.readDayCache(cacheDir, '2026-05-17');
    expect(cached.records).toHaveLength(1);
    expect(cached.missing).toBe(false);
  });

  test('a missing entry reports a miss so the day is fetched', () => {
    expect(historicalSource.readDayCache(cacheDir, '2026-01-01')).toBeNull();
  });

  test('a corrupt entry is treated as a miss rather than crashing the fetch', () => {
    const filePath = historicalSource.dayCachePath(cacheDir, '2026-05-18');
    fs.writeFileSync(filePath, '{ not json', 'utf8');
    expect(historicalSource.readDayCache(cacheDir, '2026-05-18')).toBeNull();
  });

  test('caching is disabled when no cache directory is configured', () => {
    expect(historicalSource.dayCachePath(null, '2026-05-19')).toBeNull();
    expect(historicalSource.readDayCache(null, '2026-05-19')).toBeNull();
  });
});
