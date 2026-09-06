/**
 * Seed Script — Realistic Nexora Environment
 * ============================================
 * Creates 20 real users (local auth, loginable) with 5 REAL-FACT posts
 * each (100 posts total). Every post goes through the ACTUAL trust-score
 * engine (trust-score.service.js) so labels are computed, not hardcoded,
 * and a matching TrustScore document is stored so the feed badge and the
 * "Why this label?" sheet render correctly.
 *
 * Run from backend/:
 *   node scripts/seed-real-env.js            # add users (skips existing usernames)
 *   node scripts/seed-real-env.js --reset    # delete seed users + their posts first
 *
 * Login credentials for every seeded user:
 *   email:    seeduserNN@nexora.app  (NN = 01..20)
 *   password: NexoraSeed123!
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');
const TrustScore = require('../src/models/trust-score.model');
const trustScoreService = require('../src/services/trust-score.service');

// ─── Config ────────────────────────────────────────────────────────────

const NUM_USERS = 20;
const POSTS_PER_USER = 5;
const SEED_PASSWORD = 'NexoraSeed123!';
const SEED_EMAIL_PREFIX = 'seeduser';
const SEED_EMAIL_DOMAIN = '@nexora.app';
const RESET = process.argv.includes('--reset');

// ─── Real facts (verified, current as of 2024-2026) ────────────────────
// Each fact: text, source, and component scores. High factual scores →
// GREEN/BLUE labels from the real engine. A few are "partially verified"
// claims → ORANGE, to look like a real mixed feed.

const REAL_FACTS = [
  // Science
  { text: 'Water freezes at 0 degrees Celsius (32 degrees Fahrenheit) at standard atmospheric pressure, which is one of the most widely confirmed facts in physics.', source: 'National Institute of Standards and Technology', factual: 0.98, authenticity: 0.97, credibility: 0.9, confidence: 0.96, tag: 'science' },
  { text: 'The Earth orbits the Sun at an average distance of about 149.6 million kilometers, a value measured precisely by radar ranging and spacecraft telemetry.', source: 'NASA', factual: 0.97, authenticity: 0.95, credibility: 0.92, confidence: 0.95, tag: 'science' },
  { text: 'The speed of light in a vacuum is exactly 299,792,458 meters per second, a defined constant adopted by the International System of Units.', source: 'BIPM / International System of Units', factual: 0.99, authenticity: 0.98, credibility: 0.93, confidence: 0.97, tag: 'science' },
  { text: 'DNA is the molecule that carries genetic information in almost all living organisms, and its double-helix structure was described by Watson and Crick in 1953.', source: 'National Human Genome Research Institute', factual: 0.96, authenticity: 0.94, credibility: 0.9, confidence: 0.93, tag: 'science' },
  { text: 'The human body contains roughly 37 trillion cells, a figure derived from standardized cell-count estimates published in the Annals of Human Biology.', source: 'Annals of Human Biology', factual: 0.9, authenticity: 0.88, credibility: 0.85, confidence: 0.85, tag: 'science' },
  // Space
  { text: 'Mars has two small moons, Phobos and Deimos, both discovered by American astronomer Asaph Hall in August 1877.', source: 'NASA Planetary Fact Sheet', factual: 0.95, authenticity: 0.93, credibility: 0.9, confidence: 0.92, tag: 'space' },
  { text: 'The Moon is about 384,400 kilometers from Earth on average, and its gravitational pull is the primary driver of ocean tides.', source: 'NASA', factual: 0.96, authenticity: 0.94, credibility: 0.91, confidence: 0.93, tag: 'space' },
  { text: 'Jupiter is the largest planet in our Solar System, with a diameter about 11 times that of Earth and a mass more than twice that of all other planets combined.', source: 'NASA/JPL', factual: 0.95, authenticity: 0.93, credibility: 0.9, confidence: 0.92, tag: 'space' },
  { text: 'The Voyager 1 spacecraft, launched in 1977, is the most distant human-made object and entered interstellar space in August 2012.', source: 'NASA Jet Propulsion Laboratory', factual: 0.94, authenticity: 0.92, credibility: 0.9, confidence: 0.91, tag: 'space' },
  { text: 'The Sun is a G-type main-sequence star about 4.6 billion years old, and it is expected to remain stable for roughly another 5 billion years.', source: 'NASA Solar System Exploration', factual: 0.93, authenticity: 0.91, credibility: 0.88, confidence: 0.9, tag: 'space' },
  // Health
  { text: 'Regular physical activity of at least 150 minutes of moderate exercise per week is recommended by the World Health Organization for adults aged 18-64.', source: 'World Health Organization', factual: 0.94, authenticity: 0.9, credibility: 0.92, confidence: 0.91, tag: 'health' },
  { text: 'Washing hands with soap and water for at least 20 seconds significantly reduces the transmission of infectious diseases such as influenza and norovirus.', source: 'U.S. Centers for Disease Control and Prevention', factual: 0.95, authenticity: 0.92, credibility: 0.93, confidence: 0.92, tag: 'health' },
  { text: 'Vitamin D is synthesized in human skin upon exposure to ultraviolet B radiation from sunlight, and severe deficiency can lead to rickets in children.', source: 'National Institutes of Health', factual: 0.93, authenticity: 0.9, credibility: 0.9, confidence: 0.9, tag: 'health' },
  { text: 'The human heart beats roughly 100,000 times per day and pumps about 7,500 liters of blood through the body every 24 hours.', source: 'American Heart Association', factual: 0.9, authenticity: 0.88, credibility: 0.87, confidence: 0.86, tag: 'health' },
  { text: 'Sleep is essential for memory consolidation; the brain replays and strengthens newly learned information during deep sleep stages.', source: 'National Institute of Neurological Disorders and Stroke', factual: 0.88, authenticity: 0.86, credibility: 0.85, confidence: 0.84, tag: 'health' },
  // Nature & Environment
  { text: 'The Amazon rainforest produces approximately 20 percent of the oxygen generated by land-based plants, though this figure is often misquoted as 20 percent of all Earth oxygen.', source: 'Encyclopaedia Britannica', factual: 0.85, authenticity: 0.84, credibility: 0.82, confidence: 0.8, tag: 'nature' },
  { text: 'Coral reefs cover less than 1 percent of the ocean floor but support roughly 25 percent of all marine species.', source: 'NOAA Ocean Service', factual: 0.93, authenticity: 0.9, credibility: 0.9, confidence: 0.89, tag: 'nature' },
  { text: 'Bamboo is one of the fastest-growing plants on Earth, with some species growing up to 91 centimeters (about 3 feet) in a single day.', source: 'Royal Botanic Gardens, Kew', factual: 0.9, authenticity: 0.88, credibility: 0.88, confidence: 0.86, tag: 'nature' },
  { text: 'Mount Everest is the highest mountain above sea level at 8,848.86 meters, a figure officially recognized by China and Nepal in December 2020.', source: 'Survey of Nepal / China', factual: 0.95, authenticity: 0.92, credibility: 0.9, confidence: 0.92, tag: 'nature' },
  { text: 'The Pacific Ocean is the largest ocean on Earth, covering about 165 million square kilometers — more than all of Earth\'s land area combined.', source: 'NOAA National Ocean Service', factual: 0.94, authenticity: 0.91, credibility: 0.9, confidence: 0.9, tag: 'nature' },
  // History
  { text: 'The Great Pyramid of Giza, completed around 2560 BCE, was the tallest man-made structure in the world for over 3,800 years.', source: 'Smithsonian Institution', factual: 0.92, authenticity: 0.9, credibility: 0.88, confidence: 0.88, tag: 'history' },
  { text: 'The first successful powered flight by the Wright brothers took place on December 17, 1903, at Kitty Hawk, North Carolina, covering 36.5 meters.', source: 'National Air and Space Museum', factual: 0.96, authenticity: 0.93, credibility: 0.9, confidence: 0.93, tag: 'history' },
  { text: 'World War II ended in 1945 following the unconditional surrender of Germany in May and Japan in September of that year.', source: 'United States Holocaust Memorial Museum', factual: 0.97, authenticity: 0.95, credibility: 0.91, confidence: 0.94, tag: 'history' },
  { text: 'The Apollo 11 mission landed the first humans on the Moon on July 20, 1969, with Neil Armstrong and Buzz Aldrin walking on the lunar surface.', source: 'NASA History Office', factual: 0.97, authenticity: 0.95, credibility: 0.92, confidence: 0.95, tag: 'history' },
  { text: 'The printing press, invented by Johannes Gutenberg around 1440, is widely credited with accelerating the spread of knowledge during the Renaissance.', source: 'British Library', factual: 0.9, authenticity: 0.88, credibility: 0.86, confidence: 0.86, tag: 'history' },
  // Technology
  { text: 'The World Wide Web was invented by Tim Berners-Lee at CERN in 1989, and the first website went live in 1991.', source: 'CERN', factual: 0.94, authenticity: 0.92, credibility: 0.9, confidence: 0.91, tag: 'technology' },
  { text: 'The first programmable electronic computer, ENIAC, was completed in 1945 and could perform about 5,000 additions per second.', source: 'Smithsonian National Museum of American History', factual: 0.9, authenticity: 0.88, credibility: 0.87, confidence: 0.87, tag: 'technology' },
  { text: 'Moore\'s law observes that the number of transistors on integrated circuits roughly doubles every two years, a trend first described by Gordon Moore in 1965.', source: 'Intel Corporation', factual: 0.87, authenticity: 0.85, credibility: 0.84, confidence: 0.83, tag: 'technology' },
  { text: 'The internet was originally developed as ARPANET by the U.S. Department of Defense, with the first message sent between UCLA and Stanford in October 1969.', source: 'Computer History Museum', factual: 0.92, authenticity: 0.9, credibility: 0.89, confidence: 0.89, tag: 'technology' },
  { text: 'The first email was sent by Ray Tomlinson in 1971, and the @ symbol was chosen to separate the user name from the machine name.', source: 'Smithsonian Institution', factual: 0.91, authenticity: 0.89, credibility: 0.88, confidence: 0.88, tag: 'technology' },
  // Economics (some partially-verified claims → ORANGE)
  { text: 'The U.S. national debt exceeded $35 trillion in 2024, a figure published by the U.S. Treasury Department\'s Fiscal Data portal.', source: 'U.S. Department of the Treasury', factual: 0.88, authenticity: 0.86, credibility: 0.84, confidence: 0.8, tag: 'economics' },
  { text: 'Inflation in the euro area peaked at 10.6 percent in October 2022 before declining through 2023, according to Eurostat data.', source: 'Eurostat', factual: 0.85, authenticity: 0.83, credibility: 0.82, confidence: 0.78, tag: 'economics' },
  { text: 'Bitcoin\'s total market value briefly exceeded $3 trillion in November 2021, based on CoinGecko and CoinMarketCap records.', source: 'CoinGecko / CoinMarketCap', factual: 0.75, authenticity: 0.7, credibility: 0.6, confidence: 0.6, tag: 'economics' },
  { text: 'The Federal Reserve\'s policy rate target reached 5.25-5.50 percent in July 2023, its highest level since 2001.', source: 'U.S. Federal Reserve', factual: 0.86, authenticity: 0.84, credibility: 0.85, confidence: 0.82, tag: 'economics' },
  { text: 'The minimum wage in the United States has remained at $7.25 per hour at the federal level since July 2009, the longest period without an increase since its introduction.', source: 'U.S. Department of Labor', factual: 0.9, authenticity: 0.87, credibility: 0.86, confidence: 0.85, tag: 'economics' },
  // Geography
  { text: 'The Sahara Desert is the largest hot desert in the world, covering about 9.2 million square kilometers across North Africa.', source: 'National Geographic Society', factual: 0.93, authenticity: 0.9, credibility: 0.88, confidence: 0.89, tag: 'geography' },
  { text: 'The Nile is traditionally considered the longest river in the world at about 6,650 kilometers, although the Amazon is a close competitor depending on measurement method.', source: 'Encyclopaedia Britannica', factual: 0.84, authenticity: 0.82, credibility: 0.8, confidence: 0.75, tag: 'geography' },
  { text: 'Russia is the largest country by land area at about 17.1 million square kilometers, spanning 11 time zones.', source: 'CIA World Factbook', factual: 0.95, authenticity: 0.92, credibility: 0.9, confidence: 0.92, tag: 'geography' },
  { text: 'Lake Baikal in Siberia is the deepest lake in the world, reaching about 1,642 meters, and holds roughly 20 percent of the world\'s unfrozen fresh water.', source: 'UNESCO World Heritage Centre', factual: 0.92, authenticity: 0.9, credibility: 0.89, confidence: 0.89, tag: 'geography' },
  { text: 'Antarctica is the coldest, driest, and windiest continent, holding about 60 percent of the world\'s fresh water in its ice sheet.', source: 'British Antarctic Survey', factual: 0.9, authenticity: 0.88, credibility: 0.87, confidence: 0.86, tag: 'geography' },
];

// ─── Seed users (realistic profiles) ───────────────────────────────────

const SEED_USERS = [
  { name: 'Aisha Rahman', bio: 'Science communicator · physics enthusiast', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Carlos Mendes', bio: 'Astrophotographer & space nerd', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Mei Lin Chen', bio: 'Public health researcher', isVerified: true, reputationBadge: 'Trusted Academic' },
  { name: 'Daniel Okafor', bio: 'History teacher, lifelong learner', isVerified: false, reputationBadge: 'Community Member' },
  { name: 'Sofia Rossi', bio: 'Environmental journalist', isVerified: true, reputationBadge: 'Verified Creator' },
  { name: 'Liam O\'Connor', bio: 'Software engineer, tech writer', isVerified: false, reputationBadge: 'Community Member' },
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

// ─── Helper: build a post document ─────────────────────────────────────

function buildFactVariations(fact, postIndex) {
  // Each user gets 5 posts; rotate through facts so every user has a
  // varied, realistic feed. Variations personalize the wording slightly.
  const openers = [
    'Here\'s a fact worth sharing:',
    'Quick fact drop:',
    'Something I verified recently —',
    'Did you know?',
    'Sharing some verified information:',
  ];
  const closers = [
    'Source: ' + fact.source + '.',
    'Verified via ' + fact.source + '.',
    '(' + fact.source + ')',
  ];
  const opener = openers[(postIndex + fact.tag.length) % openers.length];
  const closer = closers[(postIndex + fact.text.length) % closers.length];
  return `${opener} ${fact.text} ${closer}`;
}

function computeLabel(fact) {
  const result = trustScoreService.computeTrustScore({
    authenticityScore: fact.authenticity,
    factualVerificationScore: fact.factual,
    sourceCredibilityScore: fact.credibility,
    modelConfidenceScore: fact.confidence,
    contentType: 'text',
  });
  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Check backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB.');

  // ── Reset mode: remove previous seed users + their content ─────────
  if (RESET) {
    const seedUsers = await User.find({
      email: { $regex: `^${SEED_EMAIL_PREFIX}\\d{2}${SEED_EMAIL_DOMAIN.replace('.', '\\.')}$` },
    });
    const ids = seedUsers.map((u) => u._id);
    if (ids.length > 0) {
      const posts = await Post.find({ user: { $in: ids } });
      const postIds = posts.map((p) => p._id);
      if (postIds.length > 0) {
        await TrustScore.deleteMany({ post: { $in: postIds } });
        // Clean related pipeline artifacts so re-seeding starts fresh.
        try {
          const ContentJob = require('../src/models/content-job.model');
          const ImageAnalysis = require('../src/models/image-analysis.model');
          await ContentJob.deleteMany({ post: { $in: postIds } });
          await ImageAnalysis.deleteMany({ post: { $in: postIds } });
        } catch (e) { /* non-critical cleanup */ }
      }
      await Post.deleteMany({ user: { $in: ids } });
    }
    await User.deleteMany({
      email: { $regex: `^${SEED_EMAIL_PREFIX}\\d{2}${SEED_EMAIL_DOMAIN.replace('.', '\\.')}$` },
    });
    console.log(`Reset: removed ${seedUsers.length} seed users and their content.`);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, salt);

  const allLabelCounts = {};
  let createdUsers = 0;
  let createdPosts = 0;
  let skippedUsers = 0;

  for (let i = 0; i < NUM_USERS; i++) {
    const num = String(i + 1).padStart(2, '0');
    const profile = SEED_USERS[i % SEED_USERS.length];
    const username = `seeduser${num}`;
    const email = `${SEED_EMAIL_PREFIX}${num}${SEED_EMAIL_DOMAIN}`;

    let user = await User.findOne({ username });
    if (!user) {
      user = await User.create({
        name: profile.name,
        username,
        email,
        password: hashedPassword,
        authMethod: 'local',
        role: 'USER',
        bio: profile.bio,
        isVerified: profile.isVerified,
        reputationBadge: profile.reputationBadge,
        overallTrustRating: 75 + Math.floor(Math.random() * 20),
        followersCount: Math.floor(Math.random() * 1200),
        followingCount: Math.floor(Math.random() * 300),
        ageVerificationStatus: 'VERIFIED',
        ageCategory: 'ADULT',
      });
      createdUsers++;
    } else {
      skippedUsers++;
    }

    // 5 posts per user — rotate through the fact bank so the whole feed
    // covers many topics.
    for (let p = 0; p < POSTS_PER_USER; p++) {
      const factIndex = (i * POSTS_PER_USER + p) % REAL_FACTS.length;
      const fact = REAL_FACTS[factIndex];
      const labelResult = computeLabel(fact);
      const labelName = labelResult.label;
      allLabelCounts[labelName] = (allLabelCounts[labelName] || 0) + 1;

      const post = await Post.create({
        user: user._id,
        text: buildFactVariations(fact, p),
        contentType: 'text',
        postType: 'standard',
        hashtags: ['#' + fact.tag, '#facts', '#verified'],
        visibility: 'public',
        trustScore: labelResult.trustScore,
        trustBadge: labelName,
        trustBreakdown: {
          factualVerification: labelResult.componentScores.factualVerification,
          authenticity: labelResult.componentScores.authenticity,
          sourceCredibility: labelResult.componentScores.sourceCredibility,
          modelConfidence: labelResult.componentScores.modelConfidence,
        },
        verificationStatus: 'PUBLISHED',
        moderationStatus: 'approved',
        pipelineCompletedAt: new Date(),
        likesCount: Math.floor(Math.random() * 400),
        commentsCount: Math.floor(Math.random() * 40),
        sharesCount: Math.floor(Math.random() * 60),
        viewsCount: Math.floor(Math.random() * 5000),
        createdAt: new Date(Date.now() - (p * 36 + i) * 3600 * 1000),
      });

      // TrustScore document so the detail/explanation endpoints work.
      await TrustScore.create({
        post: post._id,
        score: labelResult.trustScore,
        authenticity: labelResult.componentScores.authenticity,
        factualVerification: labelResult.componentScores.factualVerification,
        sourceCredibility: labelResult.componentScores.sourceCredibility,
        modelConfidence: labelResult.componentScores.modelConfidence,
        label: labelName,
        explanation: labelResult.reasoning.join('\n'),
        modelVersion: labelResult.modelVersion,
        ruleVersion: labelResult.ruleVersion,
        isOverrideApplied: labelResult.isOverrideApplied,
      });

      createdPosts++;
    }
  }

  console.log('\n=== Seed complete ===');
  console.log(`Users created: ${createdUsers}  (skipped existing: ${skippedUsers})`);
  console.log(`Posts created: ${createdPosts}`);
  console.log('Label distribution:', allLabelCounts);
  console.log('\nLogin with any of:');
  for (let i = 0; i < Math.min(3, NUM_USERS); i++) {
    const num = String(i + 1).padStart(2, '0');
    console.log(`  ${SEED_EMAIL_PREFIX}${num}${SEED_EMAIL_DOMAIN} / ${SEED_PASSWORD}`);
  }
  console.log(`  ... through seeduser${String(NUM_USERS).padStart(2, '0')}${SEED_EMAIL_DOMAIN} / ${SEED_PASSWORD}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});