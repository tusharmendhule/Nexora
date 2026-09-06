/**
 * Seed Script — AI-Generated Image Posts with REAL Verification
 * ==============================================================
 * Adds AI-generated image posts to the 20 seed users created by
 * seed-real-env.js. Every image post goes through the ACTUAL image
 * authenticity pipeline:
 *
 *   image post created
 *     → ContentJob (image_authenticity)
 *     → Python AI service /analyze/image (real manipulation detection)
 *     → ImageAnalysis document stored in MongoDB
 *     → TrustScore computed by the real rule engine + stored
 *     → post.trustScore / trustBadge / trustBreakdown updated
 *
 * The images are AI-generated images (Wikimedia Commons) uploaded to
 * Cloudinary so the Python service can download and analyze them.
 * Labels are REAL engine output — never hardcoded.
 *
 * Run from backend/:
 *   node scripts/seed-ai-images.js            # add image posts (idempotent)
 *   node scripts/seed-ai-images.js --reset    # remove seeded image posts first
 *
 * Requires:
 *   - seed users from seed-real-env.js (created automatically if missing)
 *   - the Python AI service running on AI_SERVICE_URL (default :8000)
 *   - Cloudinary credentials in backend/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');
const ContentJob = require('../src/models/content-job.model');
const TrustScore = require('../src/models/trust-score.model');
const imageAnalysisService = require('../src/services/image-analysis.service');

// ─── Config ────────────────────────────────────────────────────────────

const SEED_EMAIL_PREFIX = 'seeduser';
const SEED_EMAIL_DOMAIN = '@nexora.app';
const SEED_PASSWORD = 'NexoraSeed123!';
const RESET = process.argv.includes('--reset');

// Hashtag used to mark seeded image posts (for idempotent re-runs + reset).
const SEED_TAG = 'aiseedimage';

// Cloudinary mapping produced by the upload helper (file → secure_url).
const CLOUDINARY_MAP_PATH = path.join(__dirname, '..', 'uploads', 'seed-ai', 'cloudinary.json');

// Order of images: matches files in backend/uploads/seed-ai/imgs
const IMAGE_FILES = ['ai_00.png', 'ai_01.jpg', 'ai_02.png', 'ai_03.jpg', 'ai_07.jpg'];

// ─── Real seed users (must match seed-real-env.js) ────────────────────
// Used only to auto-create missing seed users so image posts always have
// an owner, even if seed-real-env.js has not been run yet.

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
  { name: 'Grace Kim', bio: 'Medical writer, health literacy advocate', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Mateo Alvarez', bio: 'Physics grad student', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Fatima Zahra', bio: 'Climate researcher', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Noah Bergström', bio: 'Open-source maintainer', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Amara Diallo', bio: 'Marine biologist', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Ravi Patel', bio: 'Economist, policy analyst', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Hannah Schmidt', bio: 'Librarian & fact-check volunteer', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Tomás Silva', bio: 'Museum educator', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Leila Karimi', bio: 'Engineering professor', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Ethan Brooks', bio: 'STEM teacher & curriculum designer', isVerified: false, reputationBadge: 'Community Member' },
];

// Captions are deliberately neutral descriptions — they do NOT assert
// factual claims (image verification only measures authenticity, and
// captions that make claims would need text claim-verification too).
const CAPTIONS = [
  "Sharing this image that's been going around — what do you think of it?",
  'Interesting image I came across today. Curious how it was made.',
  'Found this online and wanted to get thoughts on its authenticity.',
  'Came across this striking image — posting so it can be properly verified.',
  'This one looked a bit too perfect. Posting for the community to check.',
];

// ─── Helpers ───────────────────────────────────────────────────────────

function cloudinaryMap() {
  if (!fs.existsSync(CLOUDINARY_MAP_PATH)) {
    throw new Error(
      `Cloudinary mapping not found at ${CLOUDINARY_MAP_PATH}. ` +
      'Upload the AI images to Cloudinary first (see seed-ai-images.js header).'
    );
  }
  return JSON.parse(fs.readFileSync(CLOUDINARY_MAP_PATH, 'utf8'));
}

async function ensureSeedUsers() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, salt);
  const users = [];
  for (let i = 0; i < 20; i++) {
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
        overallTrustRating: 75 + Math.floor(Math.random() * 20),
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'ADULT',
      });
    }
    users.push(user);
  }
  return users;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Check backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB.');

  const urls = cloudinaryMap();
  const availableImages = IMAGE_FILES.filter((f) => urls[f]);
  if (availableImages.length === 0) {
    console.error('No Cloudinary URLs found in uploads/seed-ai/cloudinary.json');
    process.exit(1);
  }
  console.log(`AI images available for seeding: ${availableImages.length}`);

  // ── Reset mode: remove previously seeded image posts ──────────────
  if (RESET) {
    const removed = await Post.find({ hashtags: SEED_TAG });
    const removedIds = removed.map((p) => p._id);
    if (removedIds.length > 0) {
      await TrustScore.deleteMany({ post: { $in: removedIds } });
      await ContentJob.deleteMany({ post: { $in: removedIds } });
    }
    // ImageAnalysis docs reference posts; drop those too (model may not be
    // imported above — load on demand).
    const ImageAnalysis = require('../src/models/image-analysis.model');
    await ImageAnalysis.deleteMany({ post: { $in: removedIds } });
    await Post.deleteMany({ hashtags: SEED_TAG });
    console.log(`Reset: removed ${removed.length} seeded AI-image posts.`);
  }

  // Ensure seed users exist
  const users = await ensureSeedUsers();
  console.log(`Seed users ready: ${users.length}`);

  const salt = await bcrypt.genSalt(10); // no-op, retained for symmetry
  void salt;

  let createdPosts = 0;
  let skippedPosts = 0;
  const labelCounts = {};

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    // Assign one image per user, rotating so all 5 images are used.
    const imageFile = availableImages[i % availableImages.length];
    const url = urls[imageFile];

    // Idempotency: skip if this user already has a seeded AI-image post.
    const existing = await Post.findOne({ user: user._id, hashtags: SEED_TAG });
    if (existing) {
      skippedPosts++;
      continue;
    }

    const caption = CAPTIONS[i % CAPTIONS.length];

    const post = await Post.create({
      user: user._id,
      text: caption,
      contentType: 'image',
      postType: 'standard',
      hashtags: ['#' + SEED_TAG, '#image', '#verify'],
      media: [{ url, type: 'image', altText: 'AI-generated image being verified' }],
      visibility: 'public',
      moderationStatus: 'pending',
      verificationStatus: 'PENDING_VERIFICATION',
      createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000),
    });
    console.log(`\n[user ${String(i + 1).padStart(2, '0')}] image post created: ${post._id}`);

    // ── Run the REAL image verification pipeline ──────────────────
    // Mirrors content-router + pipeline-orchestrator for IMAGE content:
    //   1. ContentJob (image_authenticity)
    //   2. image-analysis.service.analyzeImage(job) → Python AI service
    //   3. ImageAnalysis + TrustScore persisted
    //   4. post fields updated from the stored TrustScore
    let result;
    try {
      const job = await ContentJob.create({
        jobId: `${Date.now()}-${post._id}`,
        post: post._id,
        contentType: 'IMAGE',
        contentReference: { url, mimeType: imageFile.endsWith('.png') ? 'image/png' : 'image/jpeg' },
        status: 'PROCESSING',
        pipeline: 'image_authenticity',
        startedAt: new Date(),
      });

      result = await imageAnalysisService.analyzeImage(job);
      console.log(`  image analysis status: ${result.status}`);
      console.log('  signals:', JSON.stringify(result.results));

      await ContentJob.findByIdAndUpdate(job._id, {
        status: result.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'COMPLETED',
        completedAt: new Date(),
        results: result.results,
        modelVersion: result.modelVersion,
      });
    } catch (err) {
      console.error(`  ✗ image analysis FAILED: ${err.message}`);
      console.error('    Leaving post unlabeled (honest pending state).');
      await ContentJob.updateOne(
        { post: post._id },
        { status: 'FAILED', error: { message: err.message, code: 'SEED_ANALYSIS_FAILED' } }
      );
      skippedPosts++;
      continue;
    }

    // Load the persisted TrustScore (computed by the real engine inside
    // analyzeImage) and reflect it on the post + publish state.
    const ts = await TrustScore.findOne({ post: post._id });
    if (ts) {
      await Post.findByIdAndUpdate(post._id, {
        trustScore: ts.score,
        trustBadge: ts.label,
        trustBreakdown: {
          factualVerification: ts.factualVerification,
          authenticity: ts.authenticity,
          sourceCredibility: ts.sourceCredibility,
          modelConfidence: ts.modelConfidence,
        },
        verificationStatus: 'PUBLISHED',
        moderationStatus: 'approved',
        pipelineCompletedAt: new Date(),
      });
      labelCounts[ts.label] = (labelCounts[ts.label] || 0) + 1;
      console.log(`  → trust score ${ts.score} | label ${ts.label}`);
    } else {
      console.log('  ! No TrustScore persisted for this post');
    }

    createdPosts++;
  }

  console.log('\n=== Seed complete ===');
  console.log(`Image posts created: ${createdPosts}  (skipped existing: ${skippedPosts})`);
  console.log('Label distribution:', labelCounts);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
