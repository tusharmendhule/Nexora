#!/usr/bin/env node
/**
 * Seed Script — Historical Public-Source Posts
 * ============================================
 * Imports REAL, dated, publicly available news posts into Nexora and runs
 * every one of them through Nexora's ACTUAL verification pipeline.
 *
 * Nothing in this pipeline invents content:
 *   - Sources come from archived public sources of record (see
 *     `historical-source.service.js`). Each record keeps the real article URL.
 *   - Publication dates are the dates the real sources reported the event, or
 *     the date the publisher encoded in its own URL.
 *   - Trust scores and labels are computed by `trust-score.service.js` inside
 *     `pipeline-orchestrator.service.js`. This script never writes them.
 *
 * Usage (from backend/):
 *   node scripts/seedHistoricalPosts.js --fetch          # discover real sources → data/historical/posts.json
 *   node scripts/seedHistoricalPosts.js                  # import them (fetches first if no dataset exists)
 *   node scripts/seedHistoricalPosts.js --dry-run        # validate + report, no writes
 *   node scripts/seedHistoricalPosts.js --limit 10       # import only the first 10 records
 *   node scripts/seedHistoricalPosts.js --as-text        # route via TEXT pipeline instead of LINK
 *   node scripts/seedHistoricalPosts.js --update         # re-verify already-imported posts
 *   node scripts/seedHistoricalPosts.js --no-engagement  # skip seeded likes/comments/saves/reshares
 *   node scripts/seedHistoricalPosts.js --reset          # remove everything this script created
 *
 * npm: npm run seed:historical -- --fetch
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const historicalSource = require('../src/services/historical-source.service');
const historicalImport = require('../src/services/historical-import.service');

// ─── Paths ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical');
const DATASET_PATH = path.join(DATA_DIR, 'posts.json');
const ERROR_LOG_PATH = path.join(DATA_DIR, 'import-errors.json');

// Per-day discovery cache: makes a rate-limited run resumable and guarantees
// a re-run never re-hits the source host for days it already fetched.
const CACHE_DIR = path.join(DATA_DIR, 'cache');

// ─── Window ────────────────────────────────────────────────────────────
// The six months preceding the import, per the import spec.
const DEFAULT_START = '2026-03-22';
const DEFAULT_END = '2026-09-22';

// ─── Argument parsing ──────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = {
    fetch: false,
    import: false,
    dryRun: false,
    reset: false,
    update: false,
    asText: false,
    skipPipeline: false,
    engagement: true,
    includeGdelt: false,
    reportOnly: false,
    limit: null,
    stride: 1,
    concurrency: null,
    delayMs: null,
    startDate: DEFAULT_START,
    endDate: DEFAULT_END,
    target: historicalSource.TARGET_TOTAL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--fetch': flags.fetch = true; break;
      case '--import': flags.import = true; break;
      case '--dry-run': case '--dryRun': flags.dryRun = true; break;
      case '--reset': flags.reset = true; break;
      case '--update': flags.update = true; break;
      case '--as-text': flags.asText = true; break;
      case '--skip-pipeline': flags.skipPipeline = true; break;
      case '--engagement': flags.engagement = true; break;
      case '--no-engagement': flags.engagement = false; break;
      case '--include-gdelt': flags.includeGdelt = true; break;
      case '--report-only': flags.reportOnly = true; break;
      case '--limit': flags.limit = Number(argv[++i]); break;
      case '--target': flags.target = Number(argv[++i]); break;
      case '--stride': flags.stride = Math.max(1, Number(argv[++i]) || 1); break;
      case '--concurrency': flags.concurrency = Math.max(1, Number(argv[++i]) || 1); break;
      case '--delay': flags.delayMs = Math.max(0, Number(argv[++i]) || 0); break;
      case '--from': flags.startDate = argv[++i]; break;
      case '--to': flags.endDate = argv[++i]; break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Unknown flag ignored: ${arg}`);
        }
    }
  }

  // `--limit` also caps discovery, so a small run stays fast.
  if (flags.limit && !Number.isFinite(flags.limit)) flags.limit = null;
  if (!Number.isFinite(flags.target)) flags.target = historicalSource.TARGET_TOTAL;

  return flags;
}

// ─── Dataset I/O ───────────────────────────────────────────────────────

/**
 * Read the dataset. Accepts the wrapper object this script writes as well as
 * a bare array, so a hand-edited file cannot silently break the import.
 */
function loadDataset(filePath = DATASET_PATH) {
  if (!fs.existsSync(filePath)) return null;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`could not read ${filePath}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`dataset at ${filePath} is not valid JSON: ${error.message}`);
  }

  if (Array.isArray(parsed)) {
    return { records: parsed, meta: {} };
  }
  if (parsed && Array.isArray(parsed.records)) {
    return { records: parsed.records, meta: parsed };
  }

  throw new Error(`dataset at ${filePath} has an unrecognized shape (expected an array or { records: [] })`);
}

/** Persist the discovered dataset with its provenance metadata. */
function writeDataset(records, meta, filePath = DATASET_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    window: { start: meta.windowStart, end: meta.windowEnd },
    target: meta.target,
    providerBreakdown: meta.providerBreakdown || {},
    discoveryStats: meta.discoveryStats || null,
    records,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

/** Persist per-record errors so a failed run is auditable, not silent. */
function writeErrorLog(errors, meta = {}) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG_PATH), { recursive: true });
    fs.writeFileSync(
      ERROR_LOG_PATH,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), ...meta, errors }, null, 2)}\n`,
      'utf8'
    );
  } catch (_) {
    // Error-log persistence is non-critical: the report already printed them.
  }
}

// ─── MongoDB ───────────────────────────────────────────────────────────

async function connect(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set. Add it to backend/.env');
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new Error('MONGO_URI is not a valid MongoDB connection string');
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  return mongoose.connection.name || 'connected';
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const log = (message) => console.log(message);

  log('');
  log('Nexora historical import');
  log(`  window: ${flags.startDate} → ${flags.endDate}`);
  log(`  mode:   ${flags.dryRun ? 'dry run (no writes)' : 'live'}${flags.fetch ? ' + fetch' : ''}`);
  log('');

  // ── 1. Reset (explicit and destructive) ──────────────────────────
  if (flags.reset) {
    await connect(process.env.MONGO_URI);
    await historicalImport.resetHistoricalImport({ log });
    await mongoose.disconnect();
    return 0;
  }

  let datasetMeta = {};
  let records = null;

  // ── 2. Discover real records when asked, or when nothing is cached ──
  const shouldFetch = flags.fetch || !flags.reportOnly && !fs.existsSync(DATASET_PATH);
  if (shouldFetch) {
    log('Discovering real historical sources (no content is generated here)…');

    const discovery = await historicalSource.discoverHistoricalRecords({
      startDate: flags.startDate,
      endDate: flags.endDate,
      target: flags.limit ? Math.min(flags.limit, flags.target) : flags.target,
      includeGdelt: flags.includeGdelt,
      gdeltQueries: ['india', 'world news', 'technology', 'health'],
      cacheDir: CACHE_DIR,
      stride: flags.stride,
      ...(flags.concurrency ? { concurrency: flags.concurrency } : {}),
      ...(flags.delayMs !== null ? { delayMs: flags.delayMs } : {}),
      onProgress: ({ completed, total, records: count, daysFromCache }) => {
        if (completed % 25 === 0) {
          log(`  … ${completed}/${total} days processed (${daysFromCache} from cache) — ${count} records so far`);
        }
      },
    });

    records = discovery.records;
    datasetMeta = {
      windowStart: flags.startDate,
      windowEnd: flags.endDate,
      target: flags.target,
      providerBreakdown: discovery.providerBreakdown,
      discoveryStats: discovery.stats,
    };

    if (!flags.dryRun) {
      writeDataset(records, datasetMeta);
      log(`  wrote ${records.length} records → ${path.relative(process.cwd(), DATASET_PATH)}`);
    }

    log('');
    log(historicalImport.formatDiscoveryReport({
      stats: discovery.stats,
      errors: discovery.errors,
      meta: datasetMeta,
    }));

    // A pure `--fetch` run stops here; the import is a separate, deliberate
    // step so the dataset can be reviewed first.
    if (flags.fetch && !flags.import) {
      writeErrorLog(discovery.errors, { stage: 'DISCOVERY' });
      return 0;
    }
  }

  // ── 3. Load the dataset ──────────────────────────────────────────
  if (!records) {
    const loaded = loadDataset();
    if (!loaded) {
      throw new Error(
        `no dataset at ${DATASET_PATH}. Run: node scripts/seedHistoricalPosts.js --fetch`
      );
    }
    records = loaded.records;
    datasetMeta = {
      windowStart: loaded.meta.window?.start || flags.startDate,
      windowEnd: loaded.meta.window?.end || flags.endDate,
      target: loaded.meta.target || flags.target,
      providerBreakdown: loaded.meta.providerBreakdown || {},
      discoveryStats: loaded.meta.discoveryStats || null,
    };
    log(`Loaded ${records.length} records from ${path.relative(process.cwd(), DATASET_PATH)}`);
  }

  if (flags.limit) records = records.slice(0, flags.limit);

  // ── 4. Validate + de-duplicate before touching the database ──────
  const prepared = historicalImport.prepareRecords(records, {
    startDate: flags.startDate,
    endDate: flags.endDate,
  });

  log(
    `Validated: ${prepared.records.length} importable, ` +
    `${prepared.duplicates.length} duplicate(s), ${prepared.rejected.length} rejected`
  );
  if (prepared.rejected.length > 0) {
    for (const entry of prepared.rejected.slice(0, 5)) {
      log(`  ✗ ${entry.sourceUrl || '(no url)'}: ${entry.errors.join('; ')}`);
    }
  }
  log('');

  if (flags.reportOnly) {
    writeErrorLog(prepared.rejected, { stage: 'VALIDATION' });
    log('Report-only mode: no posts were written.');
    return 0;
  }

  // ── 5. Import through the real pipeline ──────────────────────────
  let database = null;
  if (!flags.dryRun) {
    database = await connect(process.env.MONGO_URI);
    log(`Connected to MongoDB database "${database}"`);
  }

  const users = await historicalImport.ensureSeedUsers(historicalImport.SEED_USER_COUNT, {
    dryRun: flags.dryRun,
  });
  if (!flags.dryRun) {
    log(`Seed accounts ready: ${users.length}`);
  }
  log('');

  const { stats, errors, posts } = await historicalImport.importHistoricalPosts({
    records: prepared.records,
    users,
    log,
    options: {
      dryRun: flags.dryRun,
      asText: flags.asText,
      update: flags.update,
      skipPipeline: flags.skipPipeline,
      target: datasetMeta.target || flags.target,
    },
  });

  // ── 6. Seeded engagement ─────────────────────────────────────────
  if (flags.engagement && !flags.dryRun && posts.length > 0) {
    log('');
    stats.engagement = await historicalImport.createSeededEngagement({ posts, users, log });
  }

  // ── 7. Report ────────────────────────────────────────────────────
  const allErrors = [
    ...prepared.rejected.map((entry) => ({
      stage: 'VALIDATION',
      sourceUrl: entry.sourceUrl,
      error: entry.errors.join('; '),
    })),
    ...errors,
  ];

  log('');
  log(historicalImport.formatReport({
    stats,
    providerBreakdown: datasetMeta.providerBreakdown,
    errors: allErrors,
    meta: datasetMeta,
  }));

  if (!flags.dryRun) {
    writeErrorLog(allErrors, { stage: 'IMPORT', stats });
  }

  // ── 8. Shortfall accounting ──────────────────────────────────────
  const target = datasetMeta.target || flags.target;
  if (stats.inserted < target) {
    log('');
    log(
      `NOTE: ${stats.inserted} post(s) imported against a target of ${target}. ` +
      'No records were invented to reach the target; the shortfall reflects what the ' +
      'real sources actually provided.'
    );
  }

  if (!flags.dryRun) await mongoose.disconnect();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch(async (error) => {
    console.error('');
    console.error(`Historical import failed: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    try {
      await mongoose.disconnect();
    } catch (_) { /* already disconnected */ }
    process.exit(1);
  });
