/**
 * Historical Import Service
 * ==========================
 * Imports real, dated, public-source records into Nexora and runs them
 * through Nexora's OWN verification pipeline.
 *
 * Design constraints this service exists to honour:
 *   - No fabricated posts, no invented URLs, no invented dates. A record that
 *     cannot be validated is rejected and reported, never patched up.
 *   - No fabricated verification. Trust scores and labels are written only by
 *     `trust-score.service.js` inside `pipeline-orchestrator.service.js`.
 *     This service never sets `trustScore`, `trustBadge` or a verification
 *     status by hand.
 *   - No duplicate models or services. Posts use `post.model.js`, jobs use
 *     `content-router.service.js`, verification uses
 *     `pipeline-orchestrator.service.js`.
 *   - Idempotent. Re-running the import must not create a second copy of the
 *     same source: posts are keyed by normalized source URL plus a marker
 *     hashtag, and a deterministic fingerprint guards the dataset too.
 *
 * Provenance storage (no schema change): the real article URL is stored in
 * the Post model's existing `linkUrl` field, the real headline in
 * `linkTitle`, the source summary in `linkDescription`, and the real
 * publication date in `createdAt` — the same convention the existing
 * `scripts/seed-real-env.js` and `scripts/seed-ai-images.js` already use.
 */

const bcrypt = require('bcryptjs');

const User = require('../models/user.model');
const Post = require('../models/post.model');
const ContentJob = require('../models/content-job.model');
const PipelineStage = require('../models/pipeline-stage.model');
const TrustScore = require('../models/trust-score.model');
const Like = require('../models/like.model');
const Comment = require('../models/comment.model');
const Reshare = require('../models/reshare.model');
const SavedPost = require('../models/saved-post.model');

const contentRouter = require('./content-router.service');
const pipelineOrchestrator = require('./pipeline-orchestrator.service');
const historicalSource = require('./historical-source.service');

// ─── Configuration ─────────────────────────────────────────────────────

/** Marker hashtag identifying every post created by this importer. */
const MARKER_HASHTAG = '#nexora_historical_seed';

/**
 * Dedicated, unmistakably-machine accounts own the imported posts. They are
 * named so that no reader could mistake them for real people, which is what
 * the spec requires of seeded accounts.
 */
const SEED_USER_COUNT = 8;
const SEED_USERNAME_PREFIX = 'nexora_seed_';
const SEED_EMAIL_DOMAIN = '@nexora.app';
const SEED_PASSWORD = 'NexoraSeed123!';
const SEED_BIO =
  'Automated test account for Nexora historical import. Not a real person.';

/** The five trust labels the engine can emit. */
const TRUST_LABELS = Object.freeze(['Green', 'Blue', 'Purple', 'Orange', 'Red']);

/** The spec's category buckets, in report order. */
const REPORT_CATEGORIES = Object.freeze([
  'TECHNOLOGY',
  'INDIA',
  'POLITICS',
  'SCIENCE',
  'HEALTH',
  'ENVIRONMENT',
  'WORLD',
  'BUSINESS',
  'SPORTS',
  'EDUCATION_SOCIAL',
]);

/** Comments used for seeded engagement. Questions, never assertions. */
const SEEDED_COMMENTS = Object.freeze([
  'Do you have an official source for this?',
  'Is this confirmed by the government?',
  'This claim appears to have been fact-checked.',
  'Can someone provide the original report?',
  'Which outlet published this first?',
  'Worth checking the primary source before sharing.',
  'Any follow-up reporting on this since it broke?',
  'Interesting — thanks for linking the original.',
]);

// ─── Seed users ────────────────────────────────────────────────────────

/** Deterministic profile for seed user `index` (1-based). */
function seedUserProfile(index) {
  const num = String(index).padStart(3, '0');
  return {
    username: `${SEED_USERNAME_PREFIX}${num}`,
    email: `${SEED_USERNAME_PREFIX}${num}${SEED_EMAIL_DOMAIN}`,
    name: `Nexora Seed User ${num}`,
    bio: SEED_BIO,
  };
}

/**
 * Create any missing seed users and return all of them.
 * Idempotent: existing users are reused, never duplicated.
 */
async function ensureSeedUsers(count = SEED_USER_COUNT, options = {}) {
  const { dryRun = false } = options;
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, salt);
  const users = [];

  for (let i = 1; i <= count; i += 1) {
    const profile = seedUserProfile(i);
    let user = await User.findOne({ username: profile.username });

    if (!user && !dryRun) {
      user = await User.create({
        name: profile.name,
        username: profile.username,
        email: profile.email,
        password: hashedPassword,
        authMethod: 'local',
        role: 'USER',
        bio: profile.bio,
        reputationBadge: 'Community Member',
        isVerified: false,
        accountStatus: 'active',
      });
    }

    users.push(user || { _id: null, ...profile });
  }

  return users;
}

// ─── Record preparation ────────────────────────────────────────────────

/**
 * Build the composable post text. It quotes the real headline and attributes
 * the real publisher and URL — it never asserts anything the source does not
 * say.
 */
function buildPostText(record) {
  const parts = [`${record.title}`];
  if (record.content && record.content !== record.title) {
    parts.push(record.content);
  }
  parts.push(`Source: ${record.sourceName} — ${record.sourceUrl}`);
  return parts.join('\n\n').slice(0, 4000);
}

/**
 * Turn a validated record into the document payload for `Post.create`.
 * Deliberately omits trustScore / trustBadge / verification outcome: those
 * belong to the pipeline.
 */
function buildPostDocument(record, userId, options = {}) {
  const { asText = false } = options;
  const normalizedUrl = historicalSource.normalizeUrl(record.sourceUrl);

  return {
    user: userId,
    text: buildPostText(record),
    // 'link' routes the post through the existing LINK analysis pipeline
    // (which fetches and reads the real article). `asText` routes the real
    // headline through the TEXT pipeline instead, for sources that block
    // automated fetching — provenance (linkUrl) is stored either way.
    contentType: asText ? 'text' : 'link',
    postType: 'standard',
    linkUrl: normalizedUrl,
    linkTitle: record.title,
    linkDescription: record.content,
    hashtags: [MARKER_HASHTAG, `#${record.category.toLowerCase()}`, '#historical'],
    tags: ['historical-import', record.category.toLowerCase()],
    visibility: 'public',
    moderationStatus: 'pending',
    verificationStatus: 'PENDING_VERIFICATION',
    createdAt: new Date(record.publishedAt),
  };
}

/** Find an already-imported post for this record (idempotency guard). */
async function findExistingPost(record) {
  const normalizedUrl = historicalSource.normalizeUrl(record.sourceUrl);
  if (!normalizedUrl) return null;
  return Post.findOne({ linkUrl: normalizedUrl, hashtags: MARKER_HASHTAG });
}

/**
 * Create the post and guarantee the historical publication date is stored.
 * Mongoose's timestamps plugin owns `createdAt`, so the value is confirmed
 * and corrected with a direct update when it did not stick.
 */
async function createHistoricalPost(record, userId, options = {}) {
  const post = await Post.create(buildPostDocument(record, userId, options));

  const intended = new Date(record.publishedAt);
  const actual = post.createdAt ? new Date(post.createdAt) : null;
  if (!actual || Math.abs(actual.getTime() - intended.getTime()) > 1000) {
    await Post.collection.updateOne(
      { _id: post._id },
      { $set: { createdAt: intended } }
    );
    post.createdAt = intended;
  }

  return post;
}

// ─── Pipeline ──────────────────────────────────────────────────────────

/**
 * Run a post through Nexora's real verification pipeline.
 * Creates the ContentJob with the existing content router (so content type
 * routing stays in one place) and executes the real orchestrator.
 */
async function runVerificationPipeline(post) {
  const job = await contentRouter.createJob(post);
  const result = await pipelineOrchestrator.executePipeline(post, job);

  // The orchestrator writes the outcome onto the post; read it back rather
  // than assuming what the decision was.
  const fresh = await Post.findById(post._id)
    .select('trustScore trustBadge trustBreakdown verificationStatus moderationStatus pipelineStageRef')
    .lean();

  return { job, result, post: fresh };
}

/**
 * Summarize what the pipeline actually did for this post, read from the
 * PipelineStage document it wrote. This is the source of truth for the
 * import report — it is the pipeline's own record, not our recollection.
 */
async function summarizePipelineRun(post) {
  const fresh = await Post.findById(post._id)
    .select('verificationStatus trustBadge trustScore pipelineStageRef')
    .lean();

  const summary = {
    verificationStatus: fresh?.verificationStatus || null,
    trustBadge: fresh?.trustBadge || null,
    trustScore: fresh?.trustScore ?? null,
    factCheckProvider: null,
    factCheckStage: null,
    factCheckAggregateStatus: null,
    claimCount: 0,
  };

  if (!fresh?.pipelineStageRef) return summary;

  const pipeline = await PipelineStage.findById(fresh.pipelineStageRef).lean();
  if (!pipeline?.stages) return summary;

  const factStage = pipeline.stages.find((s) => s.stage === 'FACT_VERIFICATION');
  if (factStage) {
    summary.factCheckStage = factStage.status;
    summary.factCheckProvider =
      factStage.serviceId || factStage.result?.providerUsed || null;
    summary.factCheckAggregateStatus = factStage.result?.aggregateStatus || null;
    summary.claimCount = factStage.result?.claimCount || 0;
  }

  const claimStage = pipeline.stages.find((s) => s.stage === 'CLAIM_EXTRACTION');
  if (claimStage?.result?.claimCount) {
    summary.claimCount = claimStage.result.claimCount;
  }

  return summary;
}

/** Fetch the stored TrustScore document for a post, if the engine wrote one. */
async function loadTrustScore(postId) {
  try {
    return await TrustScore.findOne({ post: postId }).lean();
  } catch (_) {
    return null;
  }
}

// ─── Import ────────────────────────────────────────────────────────────

/**
 * Prepare records for import: validate against the window, de-duplicate
 * against each other, and drop malformed JSON entries.
 * Returns { records, rejected, duplicates }.
 */
function prepareRecords(records, { startDate, endDate } = {}) {
  const rejected = [];
  const duplicates = [];
  const valid = [];
  const seenUrls = new Set();
  const seenFingerprints = new Set();

  if (!Array.isArray(records)) {
    return { records: [], rejected: [{ error: 'dataset is not an array' }], duplicates: [] };
  }

  for (const record of records) {
    const { valid: ok, errors } = historicalSource.validateRecord(record, { startDate, endDate });
    if (!ok) {
      rejected.push({ sourceUrl: record?.sourceUrl || null, errors });
      continue;
    }

    const normalizedUrl = historicalSource.normalizeUrl(record.sourceUrl);
    const fingerprint = historicalSource.recordFingerprint(record);
    if (seenUrls.has(normalizedUrl) || seenFingerprints.has(fingerprint)) {
      duplicates.push({ sourceUrl: normalizedUrl, fingerprint });
      continue;
    }

    seenUrls.add(normalizedUrl);
    seenFingerprints.add(fingerprint);
    valid.push({ ...record, sourceUrl: normalizedUrl, fingerprint });
  }

  return { records: valid, rejected, duplicates };
}

/**
 * Import records one at a time, running each through the real pipeline.
 *
 * A failure on one record is recorded and the loop continues: one bad source
 * must never abort the whole import.
 */
async function importHistoricalPosts({
  records,
  users,
  options = {},
  log = () => {},
  onProgress = null,
} = {}) {
  const {
    dryRun = false,
    asText = false,
    update = false,
    skipPipeline = false,
    target = historicalSource.TARGET_TOTAL,
  } = options;

  const stats = {
    target,
    processed: 0,
    inserted: 0,
    updated: 0,
    skippedDuplicates: 0,
    rejected: 0,
    failedPipeline: 0,
    labels: Object.fromEntries(TRUST_LABELS.map((label) => [label, 0])),
    categories: Object.fromEntries(REPORT_CATEGORIES.map((category) => [category, 0])),
    sources: {},
    providers: {},
    factCheck: {
      googleUsed: 0,
      matches: 0,
      noEvidence: 0,
      fallbackUsed: 0,
      skipped: 0,
      errors: 0,
    },
    dates: { oldest: null, newest: null },
    engagement: { likes: 0, comments: 0, saves: 0, reshares: 0 },
    durationMs: 0,
  };

  const errors = [];
  const importedPosts = [];
  const startedAt = Date.now();

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    stats.processed += 1;

    try {
      const existing = await findExistingPost(record);

      if (existing && !update) {
        stats.skippedDuplicates += 1;
        log(`  [${i + 1}/${records.length}] duplicate — skipped (${record.sourceUrl})`);
        continue;
      }

      if (existing && update) {
        if (dryRun) {
          stats.updated += 1;
          log(`  [${i + 1}/${records.length}] would re-verify existing post`);
          continue;
        }
        const { result } = await runVerificationPipeline(existing);
        const summary = await summarizePipelineRun(existing);
        stats.updated += 1;
        tallyOutcome(stats, record, summary, result);
        importedPosts.push(existing);
        log(`  [${i + 1}/${records.length}] re-verified → ${summary.trustBadge || summary.verificationStatus}`);
        continue;
      }

      if (dryRun) {
        stats.inserted += 1;
        tallyOutcome(stats, record, null, null);
        log(`  [${i + 1}/${records.length}] would insert ${record.category} ${record.publishedAt.slice(0, 10)} ${record.sourceName}`);
        continue;
      }

      const user = users[i % users.length];
      if (!user || !user._id) {
        throw new Error('no seed user available to own the post');
      }

      const post = await createHistoricalPost(record, user._id, { asText });
      importedPosts.push(post);

      let pipelineResult = null;
      let summary = null;

      if (!skipPipeline) {
        const { result } = await runVerificationPipeline(post);
        pipelineResult = result;
        summary = await summarizePipelineRun(post);

        if (result?.status === 'FAILED') {
          stats.failedPipeline += 1;
          errors.push({
            postId: post._id.toString(),
            sourceUrl: record.sourceUrl,
            stage: 'PIPELINE',
            error: result.error || 'pipeline failed',
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        summary = await summarizePipelineRun(post);
      }

      stats.inserted += 1;
      tallyOutcome(stats, record, summary, pipelineResult);
      log(
        `  [${i + 1}/${records.length}] inserted ${record.category} ${record.publishedAt.slice(0, 10)} ` +
        `${record.sourceName} → ${summary?.trustBadge || summary?.verificationStatus || 'pending'}`
      );
    } catch (error) {
      stats.rejected += 1;
      errors.push({
        sourceUrl: record?.sourceUrl || null,
        stage: 'IMPORT',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      log(`  [${i + 1}/${records.length}] ERROR ${error.message}`);
    }

    if (onProgress) onProgress({ index: i + 1, total: records.length, stats });
  }

  stats.durationMs = Date.now() - startedAt;

  return { stats, errors, posts: importedPosts };
}

/** Fold one post's outcome into the running report totals. */
function tallyOutcome(stats, record, summary, pipelineResult) {
  const category = record.category;
  if (stats.categories[category] === undefined) stats.categories[category] = 0;
  stats.categories[category] += 1;

  stats.sources[record.sourceName] = (stats.sources[record.sourceName] || 0) + 1;

  const provider = record.discovery?.provider || 'unknown';
  stats.providers[provider] = (stats.providers[provider] || 0) + 1;

  const day = String(record.publishedAt).slice(0, 10);
  if (!stats.dates.oldest || day < stats.dates.oldest) stats.dates.oldest = day;
  if (!stats.dates.newest || day > stats.dates.newest) stats.dates.newest = day;

  // Trust labels are counted from what the engine produced — never assigned.
  if (summary?.trustBadge && stats.labels[summary.trustBadge] !== undefined) {
    stats.labels[summary.trustBadge] += 1;
  }

  if (!summary) return;

  // Fact-check accounting from the pipeline's own stage record.
  if (summary.factCheckStage === 'SKIPPED') {
    stats.factCheck.skipped += 1;
  } else if (summary.factCheckStage === 'FAILED') {
    stats.factCheck.errors += 1;
  } else if (summary.factCheckStage === 'COMPLETED') {
    const provider = String(summary.factCheckProvider || '');
    if (provider.includes('google') || provider === 'GOOGLE_FACT_CHECK') {
      stats.factCheck.googleUsed += 1;
    } else if (provider) {
      stats.factCheck.fallbackUsed += 1;
    }

    const status = summary.factCheckAggregateStatus;
    if (status === 'VERIFIED_TRUE' || status === 'VERIFIED_FALSE' || status === 'MIXED') {
      stats.factCheck.matches += 1;
    } else if (status === 'NO_EVIDENCE' || status === 'UNKNOWN') {
      stats.factCheck.noEvidence += 1;
    }
  }

  if (pipelineResult?.status === 'FAILED') return;
}

// ─── Seeded engagement ────────────────────────────────────────────────

/**
 * Create clearly-seeded social interactions between seed accounts and the
 * imported posts, so the social features have data to exercise.
 *
 * Every actor is a labelled machine account, and every write is idempotent
 * (the interaction models carry unique indexes, and existence is checked
 * first), so re-running cannot double-count.
 */
async function createSeededEngagement({ posts, users, options = {}, log = () => {} } = {}) {
  const {
    likesPerPost = 4,
    commentsPerPost = 2,
    savesPerPost = 2,
    resharesPerPost = 1,
  } = options;

  const totals = { likes: 0, comments: 0, saves: 0, reshares: 0 };
  const actors = users.filter((user) => user && user._id);
  if (actors.length === 0 || posts.length === 0) return totals;

  for (let p = 0; p < posts.length; p += 1) {
    const post = posts[p];
    const postId = post._id;

    // Rotate the actor list per post so interactions are spread across the
    // seed accounts instead of clustering on one.
    const rotated = actors.map((_, index) => actors[(index + p) % actors.length]);

    // Likes
    for (let i = 0; i < Math.min(likesPerPost, rotated.length); i += 1) {
      const user = rotated[i];
      const existing = await Like.findOne({ post: postId, user: user._id });
      if (!existing) {
        await Like.create({ post: postId, user: user._id });
        totals.likes += 1;
      }
    }

    // Comments
    for (let i = 0; i < Math.min(commentsPerPost, rotated.length); i += 1) {
      const user = rotated[(i + 1) % rotated.length];
      const text = SEEDED_COMMENTS[(p + i) % SEEDED_COMMENTS.length];
      const existing = await Comment.findOne({ post: postId, user: user._id, text });
      if (!existing) {
        await Comment.create({ post: postId, user: user._id, text });
        totals.comments += 1;
      }
    }

    // Saves
    for (let i = 0; i < Math.min(savesPerPost, rotated.length); i += 1) {
      const user = rotated[(i + 2) % rotated.length];
      const existing = await SavedPost.findOne({ post: postId, user: user._id });
      if (!existing) {
        await SavedPost.create({ post: postId, user: user._id });
        totals.saves += 1;
      }
    }

    // Reshares
    for (let i = 0; i < Math.min(resharesPerPost, rotated.length); i += 1) {
      const user = rotated[(i + 3) % rotated.length];
      const existing = await Reshare.findOne({ originalPost: postId, user: user._id });
      if (!existing) {
        await Reshare.create({ originalPost: postId, user: user._id });
        totals.reshares += 1;
      }
    }

    // Keep the counters on the post consistent with the rows just created.
    const [likeCount, commentCount, reshareCount] = await Promise.all([
      Like.countDocuments({ post: postId }),
      Comment.countDocuments({ post: postId }),
      Reshare.countDocuments({ originalPost: postId }),
    ]);
    await Post.updateOne(
      { _id: postId },
      { $set: { likesCount: likeCount, commentsCount: commentCount, sharesCount: reshareCount } }
    );
  }

  log(
    `Seeded engagement: ${totals.likes} likes, ${totals.comments} comments, ` +
    `${totals.saves} saves, ${totals.reshares} reshares`
  );

  return totals;
}

// ─── Reporting ─────────────────────────────────────────────────────────

/** Render the dynamic import report. Every number comes from the run. */
function formatReport({ stats, providerBreakdown = {}, errors = [], meta = {} } = {}) {
  const line = '─'.repeat(40);
  const bar = '='.repeat(40);
  const pad = (label, value) => `${label.padEnd(24)}${String(value)}`;

  const out = [];
  out.push(bar);
  out.push('NEXORA HISTORICAL DATA IMPORT');
  out.push(bar);
  out.push('');
  if (meta.windowStart) out.push(pad('Window:', `${meta.windowStart} → ${meta.windowEnd}`));
  out.push(pad('Target:', stats.target));
  out.push('');
  out.push(pad('Processed:', stats.processed));
  out.push(pad('Inserted:', stats.inserted));
  out.push(pad('Updated:', stats.updated));
  out.push(pad('Skipped duplicates:', stats.skippedDuplicates));
  out.push(pad('Rejected:', stats.rejected));
  out.push(pad('Pipeline failures:', stats.failedPipeline));

  out.push('');
  out.push(line);
  out.push('VERIFICATION');
  out.push(line);
  out.push(pad('Google Fact Check used:', stats.factCheck.googleUsed));
  out.push(pad('Fact-check matches:', stats.factCheck.matches));
  out.push(pad('No evidence:', stats.factCheck.noEvidence));
  out.push(pad('Fallback used:', stats.factCheck.fallbackUsed));
  out.push(pad('No fact-checkable claim:', stats.factCheck.skipped));
  out.push(pad('Verification errors:', stats.factCheck.errors));

  out.push('');
  out.push(line);
  out.push('TRUST LABELS');
  out.push(line);
  for (const label of TRUST_LABELS) {
    out.push(pad(`${label}:`, stats.labels[label] || 0));
  }

  out.push('');
  out.push(line);
  out.push('CATEGORIES');
  out.push(line);
  const categoryNames = {
    TECHNOLOGY: 'Technology',
    INDIA: 'India / Maharashtra',
    POLITICS: 'Government / Politics',
    SCIENCE: 'Science / Space',
    HEALTH: 'Health',
    ENVIRONMENT: 'Environment',
    WORLD: 'World',
    BUSINESS: 'Business / Economy',
    SPORTS: 'Sports',
    EDUCATION_SOCIAL: 'Education / Social',
  };
  for (const category of REPORT_CATEGORIES) {
    const target = historicalSource.CATEGORY_TARGETS[category];
    out.push(pad(`${categoryNames[category] || category}:`, `${stats.categories[category] || 0}  (target ${target})`));
  }

  out.push('');
  out.push(line);
  out.push('SOURCES');
  out.push(line);
  const topSources = Object.entries(stats.sources).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topSources.length === 0) out.push('(none)');
  for (const [name, count] of topSources) out.push(pad(`${name}:`, count));

  // Prefer what this run actually imported; fall back to dataset metadata for
  // discovery-only reporting.
  const providers = Object.keys(stats.providers || {}).length > 0
    ? stats.providers
    : providerBreakdown;
  if (Object.keys(providers).length > 0) {
    out.push('');
    out.push(line);
    out.push('DISCOVERY PROVIDERS');
    out.push(line);
    for (const [provider, count] of Object.entries(providers)) {
      out.push(pad(`${provider}:`, count));
    }
  }

  out.push('');
  out.push(line);
  out.push('DATES');
  out.push(line);
  out.push(pad('Oldest post:', stats.dates.oldest || '—'));
  out.push(pad('Newest post:', stats.dates.newest || '—'));

  out.push('');
  out.push(line);
  out.push('ENGAGEMENT (seeded test accounts)');
  out.push(line);
  out.push(pad('Likes:', stats.engagement.likes));
  out.push(pad('Comments:', stats.engagement.comments));
  out.push(pad('Saves:', stats.engagement.saves));
  out.push(pad('Reshares:', stats.engagement.reshares));

  if (errors.length > 0) {
    out.push('');
    out.push(line);
    out.push(`ERRORS (${errors.length})`);
    out.push(line);
    for (const error of errors.slice(0, 20)) {
      out.push(`- [${error.stage}] ${error.sourceUrl || error.postId || 'unknown'}: ${error.error}`);
    }
    if (errors.length > 20) out.push(`… and ${errors.length - 20} more`);
  }

  out.push('');
  out.push(pad('Duration:', `${(stats.durationMs / 1000).toFixed(1)}s`));
  out.push('');
  out.push(bar);
  out.push('IMPORT COMPLETE');
  out.push(bar);

  return out.join('\n');
}

/**
 * Produce the spec's import report for a dry run, where only discovery and
 * validation numbers exist.
 */
function formatDiscoveryReport({ stats, errors = [], meta = {} } = {}) {
  const bar = '='.repeat(40);
  const line = '─'.repeat(40);
  const pad = (label, value) => `${label.padEnd(24)}${String(value)}`;

  const out = [];
  out.push(bar);
  out.push('NEXORA HISTORICAL SOURCE DISCOVERY');
  out.push(bar);
  out.push('');
  if (meta.windowStart) out.push(pad('Window:', `${meta.windowStart} → ${meta.windowEnd}`));
  out.push(pad('Target:', stats.target));
  out.push(pad('Selected:', stats.selected));
  out.push('');
  out.push(line);
  out.push('DISCOVERY');
  out.push(line);
  out.push(pad('Days in window:', stats.daysInRange));
  out.push(pad('Days scheduled:', stats.daysScheduled));
  out.push(pad('Days fetched:', stats.daysFetched));
  out.push(pad('Days from cache:', stats.daysFromCache));
  out.push(pad('Days missing:', stats.daysMissing));
  out.push(pad('Days failed:', stats.daysFailed));
  out.push(pad('Records discovered:', stats.discovered));
  out.push(pad('Duplicates removed:', stats.duplicatesRemoved));
  out.push(pad('Rejected by validation:', stats.rejectedByValidation));
  out.push(pad('Valid candidates:', stats.validCandidates));
  out.push('');
  out.push(line);
  out.push('AVAILABLE VS TARGET');
  out.push(line);
  const available = Object.fromEntries(stats.availablePerCategory || []);
  for (const category of REPORT_CATEGORIES) {
    const target = historicalSource.CATEGORY_TARGETS[category];
    const have = available[category] || 0;
    out.push(pad(`${category}:`, `have ${have} / target ${target}`));
  }
  if (stats.aborted) {
    out.push('');
    out.push(`SOURCE ABORT: ${stats.aborted}. Unfetched days are cached-resumable — ` +
      're-run to continue where this stopped.');
  }
  if (stats.selected < stats.target) {
    out.push('');
    out.push(`SHORTFALL: ${stats.target - stats.selected} record(s) below target — ` +
      'real sources did not provide enough verifiable material. No filler was invented.');
  }
  if (errors.length > 0) {
    out.push('');
    out.push(`Rejected/failed entries: ${errors.length} (first 5 below)`);
    for (const error of errors.slice(0, 5)) {
      out.push(`- [${error.stage || 'SOURCE'}] ${error.date || error.url || ''}: ${error.error}`);
    }
  }
  out.push('');
  out.push(bar);

  return out.join('\n');
}

// ─── Maintenance helpers ───────────────────────────────────────────────

/** Remove every post, job, analysis artefact and interaction created here. */
async function resetHistoricalImport({ log = () => {} } = {}) {
  const posts = await Post.find({ hashtags: MARKER_HASHTAG }).select('_id').lean();
  const postIds = posts.map((p) => p._id);

  if (postIds.length > 0) {
    await Promise.all([
      TrustScore.deleteMany({ post: { $in: postIds } }),
      ContentJob.deleteMany({ post: { $in: postIds } }),
      PipelineStage.deleteMany({ post: { $in: postIds } }),
      Like.deleteMany({ post: { $in: postIds } }),
      Comment.deleteMany({ post: { $in: postIds } }),
      SavedPost.deleteMany({ post: { $in: postIds } }),
      Reshare.deleteMany({ originalPost: { $in: postIds } }),
    ]);
  }

  await Post.deleteMany({ hashtags: MARKER_HASHTAG });

  const seedUsers = await User.find({
    username: new RegExp(`^${SEED_USERNAME_PREFIX}`),
  }).select('_id').lean();

  let removedUsers = 0;
  if (seedUsers.length > 0) {
    const ids = seedUsers.map((u) => u._id);
    const remaining = await Post.countDocuments({ user: { $in: ids } });
    if (remaining === 0) {
      const result = await User.deleteMany({ _id: { $in: ids } });
      removedUsers = result.deletedCount || 0;
    }
  }

  log(`Reset: removed ${postIds.length} historical posts and ${removedUsers} seed users.`);
  return { postsRemoved: postIds.length, usersRemoved: removedUsers };
}

/**
 * Count how many historical posts a re-run would consider already imported.
 * Used by the idempotency check and by the tests.
 */
async function countImportedPosts() {
  return Post.countDocuments({ hashtags: MARKER_HASHTAG });
}

module.exports = {
  // Configuration
  MARKER_HASHTAG,
  SEED_USER_COUNT,
  SEED_PASSWORD,
  SEEDED_COMMENTS,
  TRUST_LABELS,
  REPORT_CATEGORIES,

  // Seed users
  seedUserProfile,
  ensureSeedUsers,

  // Record preparation
  buildPostText,
  buildPostDocument,
  findExistingPost,
  createHistoricalPost,
  prepareRecords,

  // Pipeline
  runVerificationPipeline,
  summarizePipelineRun,
  loadTrustScore,

  // Import
  importHistoricalPosts,
  tallyOutcome,

  // Engagement
  createSeededEngagement,

  // Reporting
  formatReport,
  formatDiscoveryReport,

  // Maintenance
  resetHistoricalImport,
  countImportedPosts,
};
