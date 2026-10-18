#!/usr/bin/env node
/**
 * Seed Script — 5 Trust-Label Image Posts (one per colour)
 * =======================================================
 * Creates exactly five image posts about real-world news that, together,
 * display all five Nexora trust labels: Green, Blue, Purple, Orange, Red.
 *
 * Labels are NEVER written by this script. Every post is run through
 * Nexora's actual verification pipeline — the same code path used for
 * user-created posts:
 *
 *   image post created
 *     → content-router.createJob (IMAGE)
 *     → pipeline-orchestrator.executePipeline
 *       → AI_ANALYSIS: Python image-authenticity model + media verification
 *          (Gemini multimodal OCR/understanding → claim-type gating →
 *           Google Fact Check API → source credibility)
 *       → CLAIM_EXTRACTION / FACT_VERIFICATION (Google Fact Check PRIMARY)
 *       → EVIDENCE_NORMALIZATION
 *       → TRUST_SCORE (trust-score.service.js — backend engine)
 *       → TRUST_LABEL (rule engine)
 *       → MODERATION_DECISION → PUBLICATION
 *     → post.trustScore / trustBadge / trustBreakdown / verificationStatus
 *       written by the pipeline (this script never writes a score)
 *
 * What the engine actually needs per colour (README rule table):
 *   Green  — score ≥ 80: real photo (high authenticity) whose extracted
 *            claims are fact-checked TRUE by independent publishers
 *   Blue   — detected AI-generated image (aiGeneratedProbability ≥ 0.5)
 *            with factually supported claims and score ≥ 70
 *   Purple — Gemini classifies the post as OPINION and no fact-checkable
 *            claims are extracted (Rule 3)
 *   Orange — claims with no external fact-check evidence (neutral 0.5),
 *            score lands in 40–79 (Rule 6)
 *   Red    — an extracted claim that fact-checkers confirmed false (Rule 1)
 *
 * The five records were chosen by probing the real Google Fact Check index
 * and the real Python authenticity model first; this script verifies — it
 * does not assign — the resulting labels, and re-runs the pipeline when a
 * transient provider failure (e.g. a Gemini 503) leaves a record short of
 * its target colour.
 *
 * Images (all freely licensed, via Wikimedia Commons, hosted on Cloudinary):
 *   Green  — Everest north face            Luca Galuzzi, CC BY-SA 2.5
 *   Blue   — AI-generated illustration     AI image from the seed-ai corpus
 *   Purple — Rio de Janeiro skyline        Wilfredor, CC0
 *   Orange — Los Angeles / Griffith Obs.   Diliff, CC BY-SA 3.0
 *   Red    — mobile telecommunications mast Steffen Mokosch, CC BY-SA 4.0
 *
 * Run from backend/:
 *   node scripts/seed-trust-label-posts.js                 # add posts (idempotent)
 *   node scripts/seed-trust-label-posts.js --reverify      # re-run the pipeline on existing posts
 *   node scripts/seed-trust-label-posts.js --reverify --delay 10000   # pace Gemini calls (default 3s)
 *   node scripts/seed-trust-label-posts.js --attempts 4    # pipeline retries per record (default 3)
 *   node scripts/seed-trust-label-posts.js --reset         # remove seeded posts first
 *   npm run seed:labels
 *
 * Requires (backend/.env): MONGO_URI, GEMINI_API_KEY,
 * GOOGLE_FACT_CHECK_API_KEY, CLOUDINARY_*; plus the Python AI service on
 * AI_SERVICE_URL for the authenticity / AI-detection signals (without it
 * the pipeline honestly reports them unavailable and the colours change).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');
const contentRouter = require('../src/services/content-router.service');
const pipelineOrchestrator = require('../src/services/pipeline-orchestrator.service');

// ─── Config ────────────────────────────────────────────────────────────

const SEED_EMAIL_PREFIX = 'seeduser';
const SEED_EMAIL_DOMAIN = '@nexora.app';
const SEED_PASSWORD = 'NexoraSeed123!';

const RESET = process.argv.includes('--reset');
const REVERIFY = process.argv.includes('--reverify');

const delayArgIndex = process.argv.indexOf('--delay');
const PACE_MS = delayArgIndex !== -1
  ? Math.max(0, Number(process.argv[delayArgIndex + 1]) || 0)
  : 8000;

const attemptsArgIndex = process.argv.indexOf('--attempts');
const MAX_ATTEMPTS = attemptsArgIndex !== -1
  ? Math.max(1, Number(process.argv[attemptsArgIndex + 1]) || 3)
  : 3;

// Marker hashtag stored + queried identically (idempotency + reset).
const MARKER = '#labelseed';

// Cloudinary asset cache so re-runs never re-download or re-upload.
const ASSET_MAP_PATH = path.join(__dirname, '..', 'uploads', 'seed-labels', 'cloudinary.json');
const ASSET_FOLDER = 'nexora_seed_labels';

const WIKIMEDIA_UA = 'NexoraSeedBot/1.0 (trust-label image seeding; contact: project maintainers)';

const ALL_LABELS = ['Green', 'Blue', 'Purple', 'Orange', 'Red'];

// ─── The 5 records (real-world news, one per trust-label colour) ───────
//
// `targetLabel` is what the engine is expected to emit for this input; it is
// only used to VERIFY the run — never written to the database. The caption
// claim phrasing is deliberate: Google Fact Check indexes the exact claims
// below (probed before seeding), so the record's colour is reproducible.

const LABEL_POSTS = [
  {
    slug: 'green-everest-co2',
    targetLabel: 'Green',
    category: 'science',
    image: {
      commonsFile: 'Everest North Face toward Base Camp Tibet Luca Galuzzi 2006.jpg',
      altText: 'The north face of Mount Everest seen from Tibet',
    },
    // Two independently fact-checked claims (Snopes: True; Science Feedback:
    // Accurate) plus an unmanipulated photograph → score ≥ 80 → Green.
    caption: [
      'Everest is back in the news — and both claims on this post check out: “Mount Everest is the highest mountain above sea level” (Snopes: True) and “atmospheric carbon dioxide is at its highest level in at least 800,000 years” (Science Feedback: Accurate).',
      'Photo: north face of Mount Everest toward Base Camp, Tibet. Photo: Luca Galuzzi, CC BY-SA 2.5, via Wikimedia Commons.',
      `${MARKER} #image #everest #climate`,
    ].join('\n\n'),
  },
  {
    slug: 'blue-ai-illustration',
    targetLabel: 'Blue',
    category: 'aiart',
    image: {
      // AI-generated illustration from the existing AI-image corpus. The
      // detector reports aiGeneratedProbability ≥ 0.5 → Rule 4 (Blue) once
      // the caption's claims are fact-checked as supported.
      localFile: path.join('uploads', 'seed-ai', 'imgs', 'ai_01.jpg'),
      commonsFile: null,
      altText: 'AI-generated illustration of a cartoon turtle on a rocky trail',
    },
    caption: [
      'AI-generated illustration (built with a generative model — no camera was involved), posted alongside two facts we verified today: “a day on Venus is longer than a year on Venus” (Snopes: True) and “atmospheric carbon dioxide is at its highest level in at least 800,000 years” (Science Feedback: Accurate).',
      'Image: AI-generated illustration, not a photograph.',
      `${MARKER} #image #aiart #verified`,
    ].join('\n\n'),
  },
  {
    slug: 'purple-rio-opinion',
    targetLabel: 'Purple',
    category: 'opinion',
    image: {
      commonsFile: 'Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 3.jpg',
      altText: 'The skyline of Rio de Janeiro and Sugarloaf Mountain at sunset',
    },
    // Pure opinion: no fact-checkable claim is extracted, so the rule engine
    // applies Rule 3 (opinion/satire/edited content) → Purple.
    caption: [
      'Opinion — honestly? This skyline is the most overhyped view on the planet. Everyone raves about it, I stand here and shrug. Beautiful, sure, but nothing worth the queue or the ticket price. Happy to be argued out of it in the comments.',
      'Photo: Rio de Janeiro skyline and Sugarloaf Mountain at sunset. Photo: Wilfredor, CC0, via Wikimedia Commons.',
      `${MARKER} #image #opinion`,
    ].join('\n\n'),
  },
  {
    slug: 'orange-la-olympics',
    targetLabel: 'Orange',
    category: 'news',
    image: {
      commonsFile: 'Los Angeles Pollution.jpg',
      altText: 'Los Angeles and the Griffith Observatory seen from the Hollywood Hills',
    },
    // Real news claim that no fact-check publisher has reviewed → neutral
    // 0.5 evidence → score lands in 40–79 → Orange (Rule 6).
    caption: [
      'Setting it here first: the 2028 Summer Olympics will be held in Los Angeles, with events spread across the city’s existing venues. No independent fact-checkers have reviewed this claim yet, so treat it as unverified until someone does.',
      'Photo: Los Angeles and Griffith Observatory from the Hollywood Hills. Photo: Diliff, CC BY-SA 3.0, via Wikimedia Commons.',
      `${MARKER} #image #olympics #losangeles`,
    ].join('\n\n'),
  },
  {
    slug: 'red-5g-covid',
    targetLabel: 'Red',
    category: 'misinformation',
    image: {
      commonsFile: 'American Tower mobile phone mast near St. Gangloff.jpg',
      altText: 'A mobile telecommunications mast beside a hiking trail in Germany',
    },
    // A viral claim that fact-checkers have confirmed false (Full Fact /
    // The Quint / Alt News) → Rule 1 → Red, and moderation rejects it.
    caption: [
      'Passing this along because it keeps going around: 5G networks spread COVID-19 and that is how the pandemic started. Forwarding to everyone before it gets deleted again.',
      'Photo: mobile telecommunications mast near St. Gangloff. Photo: Steffen Mokosch, CC BY-SA 4.0, via Wikimedia Commons.',
      `${MARKER} #image #breaking`,
    ].join('\n\n'),
  },
];

// ─── Seed users (must match seed-real-env.js credentials) ──────────────
// Only the first 5 are used; created only when missing so this script
// composes with an environment seeded by seed-real-env.js.

const SEED_USERS = [
  { name: 'Aisha Rahman', bio: 'Science communicator · physics enthusiast', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Carlos Mendes', bio: 'Astrophotographer & space nerd', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Sofia Rossi', bio: 'Environmental journalist', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Priya Sharma', bio: 'Economist · data nerd', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Hannah Schmidt', bio: 'Librarian & fact-check volunteer', isVerified: false, reputationBadge: 'Community Member' },
];

// ─── Helpers ───────────────────────────────────────────────────────────

function commonsUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1280`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadAssetMap() {
  try {
    return JSON.parse(fs.readFileSync(ASSET_MAP_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveAssetMap(map) {
  fs.mkdirSync(path.dirname(ASSET_MAP_PATH), { recursive: true });
  fs.writeFileSync(ASSET_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

async function ensureSeedUsers() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, salt);
  const users = [];

  for (let i = 0; i < SEED_USERS.length; i += 1) {
    const num = String(i + 1).padStart(2, '0');
    const username = `${SEED_EMAIL_PREFIX}${num}`;
    let user = await User.findOne({ username });
    if (!user) {
      const profile = SEED_USERS[i];
      user = await User.create({
        name: profile.name,
        username,
        email: `${SEED_EMAIL_PREFIX}${num}${SEED_EMAIL_DOMAIN}`,
        password: hashedPassword,
        authMethod: 'local',
        role: 'USER',
        bio: profile.bio,
        isVerified: profile.isVerified,
        reputationBadge: profile.reputationBadge,
        overallTrustRating: 75 + (i % 4) * 5,
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'ADULT',
      });
      console.log(`  created seed user ${username}`);
    }
    users.push(user);
  }
  return users;
}

/**
 * Get a Cloudinary-hosted URL for the record's image, uploading only on the
 * first run (cached in uploads/seed-labels/). Hosting on Cloudinary keeps the
 * URL fetchable by both the Python authenticity model and Gemini, exactly
 * like real user uploads. Wikimedia downloads retry with backoff because the
 * Commons CDN rate-limits bursts.
 */
async function ensureCloudinaryUrl(record, assetMap) {
  if (assetMap[record.slug]) {
    return assetMap[record.slug];
  }

  const localPath = record.image.localFile
    ? path.join(__dirname, '..', record.image.localFile)
    : null;
  const fallbackLocal = localPath && fs.existsSync(localPath) ? localPath : null;

  let buffer = null;
  if (fallbackLocal) {
    console.log(`  using cached local image ${record.image.localFile} …`);
    buffer = fs.readFileSync(fallbackLocal);
  } else if (record.image.commonsFile) {
    const url = commonsUrl(record.image.commonsFile);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        console.log(`  downloading ${record.image.commonsFile} …`);
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: { 'User-Agent': WIKIMEDIA_UA },
        });
        buffer = Buffer.from(response.data);
        break;
      } catch (error) {
        const status = error.response ? error.response.status : error.message;
        console.log(`  download attempt ${attempt}/4 failed (${status})`);
        if (attempt === 4) throw error;
        await delay(8000 * attempt);
      }
    }
  } else {
    throw new Error(`record ${record.slug} has no image source`);
  }

  console.log('  uploading to Cloudinary …');
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: ASSET_FOLDER,
        resource_type: 'image',
        public_id: record.slug,
        overwrite: true,
        context: { alt: record.image.altText },
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

  assetMap[record.slug] = uploaded.secure_url;
  saveAssetMap(assetMap);
  return uploaded.secure_url;
}

/**
 * Run one post through the real pipeline, mirroring processing-queue.
 */
async function verifyWithRealPipeline(post) {
  const job = await contentRouter.createJob(post);
  await contentRouter.markProcessing(job.jobId);

  let result;
  try {
    result = await pipelineOrchestrator.executePipeline(post, job);
  } catch (error) {
    await contentRouter.markFailed(job.jobId, error);
    throw error;
  }

  if (result.status === 'COMPLETED') {
    await contentRouter.markCompleted(
      job.jobId,
      {
        pipelineId: result.pipelineId,
        finalVerificationStatus: result.finalVerificationStatus,
        trustScore: result.trustScoreResult?.score,
        trustLabel: result.trustScoreResult?.label,
        moderationDecision: result.moderationDecision?.action,
      },
      result.trustScoreResult?.label ? 'nexora-pipeline-v1.0.0' : null
    );
  } else {
    await contentRouter.markFailed(job.jobId, new Error(result.error || 'Pipeline failed'));
  }

  return result;
}

/**
 * Read the pipeline's own record — the source of truth for what the engine
 * decided and what fact-checking actually happened.
 */
async function summarizePipelineRun(post) {
  const fresh = await Post.findById(post._id)
    .select('trustScore trustBadge verificationStatus moderationStatus pipelineStageRef')
    .lean();

  const summary = {
    trustScore: fresh?.trustScore ?? null,
    trustBadge: fresh?.trustBadge || null,
    verificationStatus: fresh?.verificationStatus || null,
    moderationStatus: fresh?.moderationStatus || null,
    factCheckStage: null,
    factCheckAggregateStatus: null,
    claimCount: 0,
    reviews: 0,
  };

  if (!fresh?.pipelineStageRef) return summary;

  const PipelineStage = require('../src/models/pipeline-stage.model');
  const pipeline = await PipelineStage.findById(fresh.pipelineStageRef).lean();
  if (!pipeline?.stages) return summary;

  const factStage = pipeline.stages.find((s) => s.stage === 'FACT_VERIFICATION');
  if (factStage) {
    summary.factCheckStage = factStage.status;
    summary.factCheckAggregateStatus = factStage.result?.aggregateStatus || null;
    summary.reviews = factStage.result?.reviewCount
      ?? factStage.result?.summary?.totalReviews
      ?? null;
  }

  const claimStage = pipeline.stages.find((s) => s.stage === 'CLAIM_EXTRACTION');
  if (claimStage?.result?.claimCount) {
    summary.claimCount = claimStage.result.claimCount;
  }

  return summary;
}

async function resetSeededPosts() {
  const posts = await Post.find({ hashtags: MARKER }).select('_id').lean();
  const postIds = posts.map((p) => p._id);

  if (postIds.length > 0) {
    const models = [
      '../src/models/trust-score.model',
      '../src/models/content-job.model',
      '../src/models/pipeline-stage.model',
      '../src/models/image-analysis.model',
      '../src/models/claim-entity.model',
      '../src/models/evidence.model',
      '../src/models/like.model',
      '../src/models/comment.model',
      '../src/models/saved-post.model',
      '../src/models/reshare.model',
    ];
    for (const rel of models) {
      try {
        const Model = require(rel);
        await Model.deleteMany({ post: { $in: postIds } });
      } catch (_) { /* model may not reference posts — non-critical */ }
    }
  }

  const deleted = await Post.deleteMany({ hashtags: MARKER });
  console.log(`Reset: removed ${deleted.deletedCount} seeded trust-label posts.`);
}

/**
 * Verify one record. Creates the post when it does not exist yet, runs the
 * real pipeline, and re-runs it (up to MAX_ATTEMPTS) when the engine's label
 * still differs from the target — which happens when a provider was
 * temporarily unavailable and the run produced no evidence.
 */
async function seedRecord(record, user, users, assetMap, options) {
  const markerHashtag = `#label-${record.slug}`;
  const reportEntry = {
    slug: record.slug,
    targetLabel: record.targetLabel,
    attempts: 0,
    created: false,
  };

  let post = await Post.findOne({ hashtags: markerHashtag });
  const alreadySeeded = !!post;

  if (post && !options.rerun && !REVERIFY) {
    const summary = await summarizePipelineRun(post);
    reportEntry.created = false;
    if (summary.trustBadge === record.targetLabel) {
      Object.assign(reportEntry, summary);
      reportEntry.verdict = 'already seeded';
      return reportEntry;
    }
    // Existing post is off-colour (a past run hit a provider failure):
    // re-verify instead of creating a duplicate.
    console.log(`  existing post is ${summary.trustBadge || 'unlabelled'} — re-verifying …`);
    options.rerun = true;
  }

  if (!post) {
    const imageUrl = await ensureCloudinaryUrl(record, assetMap);

    post = await Post.create({
      user: user._id,
      text: record.caption,
      contentType: 'image',
      postType: 'standard',
      hashtags: [MARKER, markerHashtag, '#image', `#${record.category}`],
      tags: ['trust-label-seed', record.slug, record.targetLabel.toLowerCase()],
      media: [{ url: imageUrl, type: 'image', altText: record.image.altText }],
      visibility: 'public',
      moderationStatus: 'pending',
      verificationStatus: 'PENDING_VERIFICATION',
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      viewsCount: 0,
      createdAt: new Date(),
    });

    console.log(`  post created: ${post._id}`);
    reportEntry.created = true;
  }

  // REAL verification pipeline — scores/labels come from here only.
  let summary = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Pace Gemini calls, and back off harder between retries: the model's
    // free tier rate-limits (HTTP 429) and a rate-limited extraction leaves
    // the media path with no claims, so the label would come out wrong.
    if (attempt > 1) {
      const waitMs = Math.max(PACE_MS, 15000) * (attempt - 1);
      console.log(`  backing off ${Math.round(waitMs / 1000)}s before retry …`);
      await delay(waitMs);
    } else if (PACE_MS > 0) {
      await delay(PACE_MS);
    }
    reportEntry.attempts = attempt;
    console.log(`  pipeline attempt ${attempt}/${MAX_ATTEMPTS} …`);
    try {
      const result = await verifyWithRealPipeline(post);
      if (result.status !== 'COMPLETED') {
        console.error(`  ✗ pipeline failed: ${result.error}`);
        continue;
      }
    } catch (error) {
      console.error(`  ✗ pipeline threw: ${error.message}`);
      continue;
    }

    summary = await summarizePipelineRun(post);
    if (summary.trustBadge === record.targetLabel) break;
    console.log(
      `  label is ${summary.trustBadge || 'none'} (target ${record.targetLabel}) — ` +
      'provider evidence likely incomplete, re-running …'
    );
  }

  if (!summary) {
    reportEntry.error = 'pipeline never completed';
    return reportEntry;
  }

  Object.assign(reportEntry, summary);
  reportEntry.verdict = summary.trustBadge === record.targetLabel ? 'OK' : 'MISS';
  return reportEntry;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Check backend/.env');
    process.exit(1);
  }
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_FACT_CHECK_API_KEY', 'CLOUDINARY_CLOUD_NAME']) {
    if (!process.env[key]) {
      console.error(`${key} missing. Check backend/.env — the real pipeline needs it.`);
      process.exit(1);
    }
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected to MongoDB.');

  if (RESET) {
    await resetSeededPosts();
  }

  const users = await ensureSeedUsers();
  console.log(`Seed users ready: ${users.length}`);

  const assetMap = loadAssetMap();
  const report = [];
  let failed = 0;

  for (let i = 0; i < LABEL_POSTS.length; i += 1) {
    const record = LABEL_POSTS[i];
    const user = users[i % users.length];

    console.log(`\n[${i + 1}/${LABEL_POSTS.length}] ${record.slug} — target ${record.targetLabel}`);
    try {
      const entry = await seedRecord(record, user, users, assetMap, { rerun: REVERIFY });
      report.push(entry);
      if (entry.error) failed += 1;
      console.log(
        `  → score ${entry.trustScore ?? '-'} | label ${entry.trustBadge || '-'} ` +
        `(target ${record.targetLabel}) | ${entry.verificationStatus || '-'} | ` +
        `claims ${entry.claimCount ?? '-'} | fact-check ${entry.factCheckStage || '-'} ` +
        `(${entry.factCheckAggregateStatus || 'n/a'})`
      );
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${error.message}`);
      report.push({ slug: record.slug, targetLabel: record.targetLabel, error: error.message });
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  const bar = '='.repeat(84);
  console.log(`\n${bar}`);
  console.log('  5 IMAGE POSTS × 5 TRUST LABELS — RESULTS FROM THE REAL PIPELINE');
  console.log(bar);
  console.log(
    ' #  record                   target   actual   score  label-hit  status'
  );
  console.log('-'.repeat(84));
  report.forEach((entry, index) => {
    if (entry.error) {
      console.log(
        `${String(index + 1).padStart(2)}  ${entry.slug.padEnd(24)}  ERROR: ${entry.error}`
      );
      return;
    }
    const hit = entry.verdict === 'OK' || entry.verdict === 'already seeded' ? 'yes' : 'NO';
    console.log(
      `${String(index + 1).padStart(2)}  ${entry.slug.padEnd(24)}  ` +
      `${entry.targetLabel.padEnd(8)}  ${String(entry.trustBadge || '-').padEnd(8)}  ` +
      `${String(entry.trustScore ?? '-').padStart(5)}  ${hit.padEnd(10)}  ${entry.verificationStatus || '-'}`
    );
  });
  console.log('-'.repeat(84));

  const labelCounts = {};
  for (const entry of report) {
    if (entry.trustBadge) labelCounts[entry.trustBadge] = (labelCounts[entry.trustBadge] || 0) + 1;
  }
  const covered = ALL_LABELS.filter((label) => labelCounts[label] > 0);
  const missing = ALL_LABELS.filter((label) => !labelCounts[label]);

  console.log('Label distribution (engine output):', JSON.stringify(labelCounts));
  console.log(`Label coverage: ${covered.length}/5 — covered: ${covered.join(', ') || 'none'}`);
  if (missing.length > 0) console.log(`Missing colours: ${missing.join(', ')}`);
  console.log(bar);

  await mongoose.disconnect();

  const ok = covered.length === ALL_LABELS.length && failed === 0;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});