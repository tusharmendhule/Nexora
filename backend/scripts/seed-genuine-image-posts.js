#!/usr/bin/env node
/**
 * Seed Script — 10 Genuine Image Posts (REAL verification)
 * =========================================================
 * Adds exactly 10 image posts whose subject matter is real: each post pairs a
 * freely-licensed photograph from Wikimedia Commons with a genuine, sourced
 * fact about that exact image (NASA, NOAA, Smithsonian, …).
 *
 * Every post is then run through Nexora's ACTUAL verification pipeline —
 * the same code path used for user-created posts:
 *
 *   image post created
 *     → content-router.createJob (IMAGE)
 *     → pipeline-orchestrator.executePipeline
 *       → AI_ANALYSIS: Python image-authenticity model + media verification
 *          (Gemini multimodal OCR/understanding → factual claims →
 *           Google Fact Check API → source credibility)
 *       → CLAIM_EXTRACTION / FACT_VERIFICATION (Google Fact Check PRIMARY)
 *       → EVIDENCE_NORMALIZATION
 *       → TRUST_SCORE (trust-score.service.js — backend engine)
 *       → TRUST_LABEL (rule engine)
 *       → MODERATION_DECISION → PUBLICATION
 *     → post.trustScore / trustBadge / trustBreakdown / verificationStatus
 *       written by the pipeline (this script never writes a score)
 *
 * Nothing is fabricated: scores and labels are engine output only. If a
 * provider is unavailable, its signal is honestly missing from the score.
 *
 * Images (all verified live, licenses verified via the Commons API):
 *   1. First flight, Kitty Hawk (1903)      — John T. Daniels, PD
 *   2. Aldrin on the Moon, Apollo 11        — Neil Armstrong, PD
 *   3. Blue Marble, Apollo 17               — NASA, PD
 *   4. Everest North Face                   — Luca Galuzzi, CC BY-SA 2.5
 *   5. Great Pyramid of Giza                — Nina Aldin Thune, CC BY 2.5
 *   6. Eiffel Tower (Champ-de-Mars)         — Guilhem Vellut, CC BY 2.0
 *   7. Coral outcrop, Flynn Reef            — Toby Hudson, CC BY-SA 3.0
 *   8. Jupiter (Hubble, June 2019)          — ESA, CC BY 2.0
 *   9. Erg Chebbi dunes, Sahara             — Thomas Fuhrmann, CC BY-SA 4.0
 *  10. Voyager spacecraft (artist concept)  — NASA/JPL, PD
 *
 * Run from backend/:
 *   node scripts/seed-genuine-image-posts.js             # add posts (idempotent)
 *   node scripts/seed-genuine-image-posts.js --reverify  # re-run the pipeline on existing posts
 *   node scripts/seed-genuine-image-posts.js --reverify --delay 20000   # pace Gemini calls (default 20s)
 *   node scripts/seed-genuine-image-posts.js --reset     # remove seeded posts first
 *   npm run seed:images -- --reverify
 *
 * `--reverify` paces runs (default 20s between posts) and retries when
 * Gemini rate-limits (HTTP 429) the image-understanding call, because a
 * rate-limited extraction leaves the media path with zero claims and the
 * FACT_VERIFICATION stage is then honestly SKIPPED — no fact-check happens.
 *
 * Requires:
 *   - MONGO_URI, GEMINI_API_KEY, GOOGLE_FACT_CHECK_API_KEY,
 *     CLOUDINARY_* in backend/.env
 *   - Python AI service on AI_SERVICE_URL (for the authenticity signal;
 *     when down the pipeline honestly reports it unavailable)
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
const TrustScore = require('../src/models/trust-score.model');
const contentRouter = require('../src/services/content-router.service');
const pipelineOrchestrator = require('../src/services/pipeline-orchestrator.service');

// ─── Config ────────────────────────────────────────────────────────────

const SEED_EMAIL_PREFIX = 'seeduser';
const SEED_EMAIL_DOMAIN = '@nexora.app';
const SEED_PASSWORD = 'NexoraSeed123!';
const RESET = process.argv.includes('--reset');
const REVERIFY = process.argv.includes('--reverify');

// Pacing + retry for the reverify mode (Gemini free-tier rate limits).
const delayArgIndex = process.argv.indexOf('--delay');
const REVERIFY_DELAY_MS = delayArgIndex !== -1
  ? Math.max(0, Number(process.argv[delayArgIndex + 1]) || 20000)
  : 20000;
const MAX_RATE_LIMIT_RETRIES = 3;

// Marker hashtag stored + queried identically (idempotency + reset).
const MARKER = '#genuineseed';

// Cloudinary asset cache so re-runs never re-download or re-upload.
const ASSET_MAP_PATH = path.join(__dirname, '..', 'uploads', 'seed-genuine', 'cloudinary.json');

const WIKIMEDIA_UA = 'NexoraSeedBot/1.0 (genuine image seeding; contact: project maintainers)';

// ─── The 10 genuine image posts ────────────────────────────────────────
// `fact` is the verifiable claim carried in the caption; `sourceName` is the
// real institution behind the fact; `credit`/`license` satisfy the Commons
// license terms for the photograph itself.

const IMAGE_POSTS = [
  {
    slug: 'wright-first-flight',
    file: 'First%20flight3.jpg',
    altText: 'The Wright Flyer lifting off at Kitty Hawk, first powered flight, 17 December 1903',
    fact: 'On 17 December 1903, near Kitty Hawk, the Wright brothers made the first sustained powered flight of a heavier-than-air aircraft — the first flight covered 36.5 metres in 12 seconds.',
    sourceName: 'Smithsonian National Air and Space Museum',
    credit: 'Photo: John T. Daniels (1903), public domain, via Wikimedia Commons',
    category: 'aviation',
  },
  {
    slug: 'apollo-11-aldrin',
    file: 'Aldrin%20Apollo%2011%20original.jpg',
    altText: 'Buzz Aldrin standing on the lunar surface during Apollo 11, July 1969',
    fact: 'Apollo 11 landed the first humans on the Moon on 20 July 1969; this photograph of Buzz Aldrin on the lunar surface was taken by Neil Armstrong.',
    sourceName: 'NASA',
    credit: 'Photo: Neil Armstrong / NASA, public domain, via Wikimedia Commons',
    category: 'space',
  },
  {
    slug: 'blue-marble',
    file: 'The%20Earth%20seen%20from%20Apollo%2017.jpg',
    altText: 'The Blue Marble photograph of Earth taken by the Apollo 17 crew in 1972',
    fact: 'The Blue Marble photograph of Earth was taken by the Apollo 17 crew in December 1972 from about 45,000 kilometres above Earth, and became one of the most widely reproduced images in history.',
    sourceName: 'NASA',
    credit: 'Photo: Apollo 17 crew / NASA, public domain, via Wikimedia Commons',
    category: 'space',
  },
  {
    slug: 'everest-north-face',
    file: 'Everest%20North%20Face%20toward%20Base%20Camp%20Tibet%20Luca%20Galuzzi%202006.jpg',
    altText: 'The north face of Mount Everest seen from Tibet',
    fact: 'Mount Everest is 8,848.86 metres above sea level, the height jointly announced by China and Nepal in December 2020 after surveying — the highest point on Earth.',
    sourceName: 'Survey of Nepal / China',
    credit: 'Photo: Luca Galuzzi, CC BY-SA 2.5, via Wikimedia Commons',
    category: 'geography',
  },
  {
    slug: 'giza-pyramid',
    file: 'Kheops-Pyramid.jpg',
    altText: 'The Great Pyramid of Giza in Egypt',
    fact: 'The Great Pyramid of Giza, completed around 2560 BCE, was the tallest man-made structure in the world for more than 3,800 years.',
    sourceName: 'Encyclopaedia Britannica',
    credit: 'Photo: Nina Aldin Thune, CC BY 2.5, via Wikimedia Commons',
    category: 'history',
  },
  {
    slug: 'eiffel-tower',
    file: 'Eiffel%20Tower%20from%20Champ-de-Mars,%20Paris%2021%20November%202015.jpg',
    altText: 'The Eiffel Tower seen from the Champ-de-Mars in Paris',
    fact: 'The Eiffel Tower was completed in 1889 for the Paris World Exposition and was the tallest man-made structure in the world until the Chrysler Building surpassed it in 1930.',
    sourceName: 'Encyclopaedia Britannica',
    credit: 'Photo: Guilhem Vellut, CC BY 2.0, via Wikimedia Commons',
    category: 'history',
  },
  {
    slug: 'coral-reef',
    file: 'Coral%20Outcrop%20Flynn%20Reef.jpg',
    altText: 'A coral outcrop on Flynn Reef in the Great Barrier Reef, Australia',
    fact: 'Coral reefs cover less than 1 percent of the ocean floor but support roughly 25 percent of all marine species, according to NOAA.',
    sourceName: 'NOAA Ocean Service',
    credit: 'Photo: Toby Hudson, CC BY-SA 3.0, via Wikimedia Commons',
    category: 'nature',
  },
  {
    slug: 'jupiter-hubble',
    file: 'Jupiter,%20image%20taken%20by%20NASA%27s%20Hubble%20Space%20Telescope,%20June%202019.jpg',
    altText: 'Jupiter photographed by the Hubble Space Telescope in June 2019',
    fact: 'Jupiter is the largest planet in our Solar System, with a diameter about 11 times that of Earth and a mass more than twice that of all other planets combined.',
    sourceName: 'NASA/JPL',
    credit: 'Photo: ESA/Hubble, CC BY 2.0, via Wikimedia Commons',
    category: 'space',
  },
  {
    slug: 'sahara-dunes',
    file: 'Erg%20Chebbi%20sunset.jpg',
    altText: 'Sand dunes of Erg Chebbi in the Sahara Desert, Morocco, at sunset',
    fact: 'The Sahara is the largest hot desert in the world, covering about 9.2 million square kilometres across North Africa.',
    sourceName: 'National Geographic Society',
    credit: 'Photo: Thomas Fuhrmann, CC BY-SA 4.0, via Wikimedia Commons',
    category: 'geography',
  },
  {
    slug: 'voyager-spacecraft',
    file: 'Voyager%20spacecraft.jpg',
    altText: "Artist's concept of the Voyager spacecraft in interstellar space",
    fact: 'Voyager 1, launched by NASA in 1977, is the most distant human-made object from Earth and entered interstellar space in August 2012.',
    sourceName: 'NASA Jet Propulsion Laboratory',
    credit: "Image: NASA/JPL, public domain (artist's concept), via Wikimedia Commons",
    category: 'space',
  },
];

// ─── Seed users (must match seed-real-env.js credentials) ──────────────
// Only the first 10 are used; created only when missing, so this script
// composes with an environment seeded by seed-real-env.js.

const SEED_USERS = [
  { name: 'Aisha Rahman', bio: 'Science communicator · physics enthusiast', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Carlos Mendes', bio: 'Astrophotographer & space nerd', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Mei Lin Chen', bio: 'Public health researcher', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Daniel Okafor', bio: 'History teacher, lifelong learner', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Sofia Rossi', bio: 'Environmental journalist', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: "Liam O'Connor", bio: 'Software engineer, tech writer', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Priya Sharma', bio: 'Economist · data nerd', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Jonas Weber', bio: 'Geography buff, amateur cartographer', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Elena Petrova', bio: 'Biologist & nature photographer', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Omar Haddad', bio: 'Space historian, museum volunteer', isVerified: false, reputationBadge: 'Community Member' },
];

// ─── Helpers ───────────────────────────────────────────────────────────

function wikimediaUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1280`;
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

function buildCaption(record) {
  return [
    record.fact,
    `Source: ${record.sourceName}.`,
    record.credit,
    `${MARKER} #image #verified`,
  ].join('\n\n');
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
 * Get a Cloudinary-hosted URL for a Wikimedia file, downloading and
 * uploading only on the first run (cached in uploads/seed-genuine/).
 * Hosting on Cloudinary keeps the URL fetchable by both the Python
 * authenticity model and Gemini, exactly like real user uploads.
 */
async function ensureCloudinaryUrl(record, assetMap) {
  if (assetMap[record.slug]) {
    return assetMap[record.slug];
  }

  const url = wikimediaUrl(record.file);
  console.log(`  downloading ${decodeURIComponent(record.file)} …`);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': WIKIMEDIA_UA },
  });

  const contentType = String(response.headers['content-type'] || 'image/jpeg').split(';')[0];
  console.log('  uploading to Cloudinary …');

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'nexora_seed_genuine',
        resource_type: 'image',
        public_id: record.slug,
        overwrite: true,
        context: { alt: decodeURIComponent(record.file) },
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(Buffer.from(response.data));
    void contentType;
  });

  assetMap[record.slug] = uploaded.secure_url;
  saveAssetMap(assetMap);
  return uploaded.secure_url;
}

/**
 * Inspect the pipeline's own record to learn whether Google Fact Check
 * really ran, and whether Gemini was rate-limited out of the media path.
 */
async function inspectFactStage(postId) {
  const Post2 = require('../src/models/post.model');
  const PipelineStage = require('../src/models/pipeline-stage.model');
  const fresh = await Post2.findById(postId).select('pipelineStageRef').lean();
  if (!fresh?.pipelineStageRef) return null;

  const pipeline = await PipelineStage.findById(fresh.pipelineStageRef).lean();
  if (!pipeline?.stages) return null;

  const factStage = pipeline.stages.find((s) => s.stage === 'FACT_VERIFICATION') || null;
  const aiStage = pipeline.stages.find((s) => s.stage === 'AI_ANALYSIS') || null;
  const mediaSignals = aiStage?.result?.mediaVerification?.signals || [];
  const geminiSignal = mediaSignals.find((s) => s.name === 'gemini_image_understanding');

  return {
    factStage,
    factRan: factStage?.status === 'COMPLETED' &&
      (factStage.serviceId === 'google-fact-check-api' ||
        factStage.result?.providerUsed === 'GOOGLE_FACT_CHECK'),
    geminiRateLimited: !!geminiSignal &&
      !geminiSignal.available &&
      String(geminiSignal.reason || '').toLowerCase().includes('rate'),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one post through the real pipeline, mirroring processing-queue.
 * In reverify mode, Gemini 429s are retried with backoff so the image's
 * claims actually reach Google Fact Check instead of being skipped.
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

  // Reverify: if Gemini was rate-limited, the media path had no claims and
  // FACT_VERIFICATION was skipped — retry with backoff so fact-checking runs.
  if (REVERIFY && result.status === 'COMPLETED') {
    for (let attempt = 1; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      const inspect = await inspectFactStage(post._id);
      if (!inspect) break;
      const factSkippedNoClaims = inspect.factStage?.status === 'SKIPPED';
      if (!factSkippedNoClaims || !inspect.geminiRateLimited) break;

      const waitMs = REVERIFY_DELAY_MS * attempt;
      console.log(
        `  Gemini rate-limited (429) — fact-check skipped. ` +
        `Retry ${attempt}/${MAX_RATE_LIMIT_RETRIES} in ${Math.round(waitMs / 1000)}s …`
      );
      await sleep(waitMs);

      const retryJob = await contentRouter.createJob(post);
      await contentRouter.markProcessing(retryJob.jobId);
      try {
        result = await pipelineOrchestrator.executePipeline(post, retryJob);
        await contentRouter.markCompleted(retryJob.jobId, {
          pipelineId: result.pipelineId,
          finalVerificationStatus: result.finalVerificationStatus,
          trustScore: result.trustScoreResult?.score,
          trustLabel: result.trustScoreResult?.label,
          moderationDecision: result.moderationDecision?.action,
        }, result.trustScoreResult?.label ? 'nexora-pipeline-v1.0.0' : null);
      } catch (error) {
        await contentRouter.markFailed(retryJob.jobId, error);
        throw error;
      }
    }
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
 * Read the pipeline's own record for the report — the source of truth for
 * what fact-checking actually happened, not a recollection.
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
    factCheckProvider: null,
    factCheckAggregateStatus: null,
    claimCount: 0,
  };

  if (!fresh?.pipelineStageRef) return summary;

  const PipelineStage = require('../src/models/pipeline-stage.model');
  const pipeline = await PipelineStage.findById(fresh.pipelineStageRef).lean();
  if (!pipeline?.stages) return summary;

  const factStage = pipeline.stages.find((s) => s.stage === 'FACT_VERIFICATION');
  if (factStage) {
    summary.factCheckStage = factStage.status;
    summary.factCheckProvider = factStage.serviceId || factStage.result?.providerUsed || null;
    summary.factCheckAggregateStatus = factStage.result?.aggregateStatus || null;
    summary.claimCount = factStage.result?.claimCount || 0;
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
  console.log(`Reset: removed ${deleted.deletedCount} seeded genuine image posts.`);
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
  const labelCounts = {};
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < IMAGE_POSTS.length; i += 1) {
    const record = IMAGE_POSTS[i];
    const markerHashtag = `#genuine-${record.slug}`;
    const user = users[i % users.length];

    console.log(`\n[${i + 1}/10] ${record.slug}`);

    // Idempotency: one post per record.
    const existing = await Post.findOne({ hashtags: markerHashtag });
    if (existing && !REVERIFY) {
      console.log('  already seeded — skipping');
      const existingSummary = await summarizePipelineRun(existing);
      report.push({ slug: record.slug, ...existingSummary, created: false });
      if (existingSummary.trustBadge) {
        labelCounts[existingSummary.trustBadge] = (labelCounts[existingSummary.trustBadge] || 0) + 1;
      }
      skipped += 1;
      continue;
    }

    if (existing && REVERIFY) {
      // Pace Gemini calls; the first post runs immediately.
      if (i > 0 && REVERIFY_DELAY_MS > 0) {
        console.log(`  pacing: waiting ${Math.round(REVERIFY_DELAY_MS / 1000)}s before next verification …`);
        await sleep(REVERIFY_DELAY_MS);
      }
      console.log(`  re-verifying existing post ${existing._id} through the real pipeline …`);
      try {
        const result = await verifyWithRealPipeline(existing);
        if (result.status !== 'COMPLETED') {
          console.error(`  ✗ pipeline failed: ${result.error}`);
          failed += 1;
          report.push({ slug: record.slug, error: `pipeline: ${result.error}` });
          continue;
        }
      } catch (error) {
        console.error(`  ✗ pipeline threw: ${error.message}`);
        failed += 1;
        report.push({ slug: record.slug, error: `pipeline: ${error.message}` });
        continue;
      }

      const summary = await summarizePipelineRun(existing);
      report.push({ slug: record.slug, ...summary, created: false });
      if (summary.trustBadge) {
        labelCounts[summary.trustBadge] = (labelCounts[summary.trustBadge] || 0) + 1;
      }
      skipped += 1;
      console.log(
        `  → score ${summary.trustScore}/100 | label ${summary.trustBadge} | ` +
        `${summary.verificationStatus} | claims ${summary.claimCount} | ` +
        `fact-check ${summary.factCheckStage} (${summary.factCheckAggregateStatus || 'n/a'})`
      );
      continue;
    }

    // 1. Host the real photo (cached after first run).
    let imageUrl;
    try {
      imageUrl = await ensureCloudinaryUrl(record, assetMap);
    } catch (error) {
      console.error(`  ✗ image fetch/upload failed: ${error.message}`);
      failed += 1;
      report.push({ slug: record.slug, error: `image: ${error.message}` });
      continue;
    }

    // 2. Create the post. Deliberately NO trustScore / trustBadge here —
    //    those belong to the pipeline.
    const post = await Post.create({
      user: user._id,
      text: buildCaption(record),
      contentType: 'image',
      postType: 'standard',
      hashtags: [MARKER, markerHashtag, '#image', `#${record.category}`],
      tags: ['genuine-image', record.slug],
      media: [{ url: imageUrl, type: 'image', altText: record.altText }],
      visibility: 'public',
      moderationStatus: 'pending',
      verificationStatus: 'PENDING_VERIFICATION',
      likesCount: (i * 17) % 120,
      commentsCount: (i * 3) % 12,
      sharesCount: (i * 5) % 20,
      viewsCount: 350 + i * 217,
      createdAt: new Date(Date.now() - (i * 7 + 3) * 3600 * 1000),
    });

    // Mongoose timestamps may own createdAt — enforce the back-dated value.
    const intended = new Date(Date.now() - (i * 7 + 3) * 3600 * 1000);
    if (Math.abs(new Date(post.createdAt).getTime() - intended.getTime()) > 1000) {
      await Post.collection.updateOne({ _id: post._id }, { $set: { createdAt: intended } });
      post.createdAt = intended;
    }

    console.log(`  post created: ${post._id}`);

    // 3. REAL verification pipeline — scores/labels come from here only.
    try {
      const result = await verifyWithRealPipeline(post);
      if (result.status !== 'COMPLETED') {
        console.error(`  ✗ pipeline failed: ${result.error}`);
        failed += 1;
        report.push({ slug: record.slug, error: `pipeline: ${result.error}` });
        continue;
      }
    } catch (error) {
      console.error(`  ✗ pipeline threw: ${error.message}`);
      failed += 1;
      report.push({ slug: record.slug, error: `pipeline: ${error.message}` });
      continue;
    }

    // 4. Read back what the pipeline actually decided.
    const summary = await summarizePipelineRun(post);
    report.push({ slug: record.slug, ...summary, created: true });
    if (summary.trustBadge) {
      labelCounts[summary.trustBadge] = (labelCounts[summary.trustBadge] || 0) + 1;
    }
    created += 1;

    console.log(
      `  → score ${summary.trustScore}/100 | label ${summary.trustBadge} | ` +
      `${summary.verificationStatus} | claims ${summary.claimCount} | ` +
      `fact-check ${summary.factCheckStage} (${summary.factCheckAggregateStatus || 'n/a'})`
    );
  }

  // ── Report ────────────────────────────────────────────────────────
  const bar = '='.repeat(78);
  console.log(`\n${bar}`);
  console.log(' 10 GENUINE IMAGE POSTS — RESULTS FROM THE REAL PIPELINE');
  console.log(bar);
  console.log(
    ' #  post                     score  label    status          claims  fact-check'
  );
  console.log('-'.repeat(78));
  report.forEach((entry, index) => {
    if (entry.error) {
      console.log(
        `${String(index + 1).padStart(2)}  ${entry.slug.padEnd(24)}  ERROR: ${entry.error}`
      );
      return;
    }
    console.log(
      `${String(index + 1).padStart(2)}  ${entry.slug.padEnd(24)}  ` +
      `${String(entry.trustScore ?? '-').padStart(5)}  ` +
      `${String(entry.trustBadge ?? '-').padEnd(8)}  ` +
      `${String(entry.verificationStatus ?? '-').padEnd(15)}  ` +
      `${String(entry.claimCount).padStart(6)}  ` +
      `${String(entry.factCheckStage || '-')}/${entry.factCheckAggregateStatus || '-'}`
    );
  });
  console.log('-'.repeat(78));
  console.log(`Created: ${created}  (already seeded: ${skipped})  failed: ${failed}`);
  console.log('Label distribution (engine output):', labelCounts);
  console.log(bar);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
