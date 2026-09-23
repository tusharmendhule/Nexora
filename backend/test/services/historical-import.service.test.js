/**
 * Historical Import Service Tests
 * ===============================
 * Covers the import half of the historical import.
 *
 * The most important assertions in this file are negative ones: the importer
 * must NOT write a trust score, must NOT write a trust label, and must NOT
 * skip the existing verification pipeline. Trust values exist only because
 * `pipeline-orchestrator.service.js` produced them.
 *
 * Covers:
 *   1. Record validation and rejection before any database write
 *   2. Post document mapping onto the EXISTING schema fields
 *   3. No fabricated trust score / label / verification status on create
 *   4. The historical publication date is preserved on the post
 *   5. The real verification pipeline is actually invoked
 *   6. Duplicate prevention by source URL (idempotent re-runs)
 *   7. Exactly-150 counting, and 0 new posts on a second run
 *   8. Fact-check accounting read from the pipeline's own stage record
 *   9. "No match" is never counted as a verified match
 *  10. Trust labels are counted from engine output, never assigned
 *  11. A single failing record does not abort the remaining import
 *  12. Dry run writes nothing
 *  13. Seed accounts are created once, clearly labelled as test accounts
 *  14. Seeded engagement is idempotent and keeps post counters consistent
 *  15. The report is computed dynamically from the run
 *
 * Run with: npm test -- --testPathPatterns=historical-import
 */

// ─── Mocks ────────────────────────────────────────────────────────────

/**
 * In-memory stand-in for the Post model. It implements just enough real
 * behaviour (linkUrl + hashtag matching, createdAt round-trip) that the
 * idempotency and duplicate-prevention tests exercise the actual code path
 * rather than a stub that always agrees.
 */
jest.mock('../../src/models/post.model', () => {
  const docs = [];
  let sequence = 0;

  const matches = (doc, query) => {
    if (query.linkUrl && doc.linkUrl !== query.linkUrl) return false;
    if (query.hashtags && !(doc.hashtags || []).includes(query.hashtags)) return false;
    return true;
  };

  const chainable = (doc) => ({
    select: () => ({
      lean: async () => (doc ? { ...doc } : null),
    }),
    lean: async () => (doc ? { ...doc } : null),
  });

  const Post = {
    create: jest.fn(async (payload) => {
      sequence += 1;
      const doc = {
        ...payload,
        _id: `post_${sequence}`,
        // Mongoose's timestamps plugin owns createdAt; the mock mirrors the
        // "it may be overwritten" behaviour the importer must defend against.
        createdAt: payload.createdAt || new Date(),
      };
      docs.push(doc);
      return doc;
    }),
    findOne: jest.fn(async (query) => docs.find((doc) => matches(doc, query)) || null),
    findById: jest.fn((id) => chainable(docs.find((doc) => doc._id === id))),
    find: jest.fn(() => ({
      select: () => ({ lean: async () => docs.filter((d) => (d.hashtags || []).includes('#nexora_historical_seed')) }),
    })),
    countDocuments: jest.fn(async (query) => {
      if (!query || !query.hashtags) return docs.length;
      return docs.filter((doc) => (doc.hashtags || []).includes(query.hashtags)).length;
    }),
    updateOne: jest.fn(async () => ({ acknowledged: true })),
    deleteMany: jest.fn(async (query) => {
      const before = docs.length;
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (matches(docs[i], query)) docs.splice(i, 1);
      }
      return { deletedCount: before - docs.length };
    }),
    collection: { updateOne: jest.fn(async () => ({ acknowledged: true })) },
    __docs: docs,
    __reset: () => { docs.length = 0; sequence = 0; },
  };

  return Post;
});

jest.mock('../../src/models/user.model', () => {
  const users = [];
  return {
    findOne: jest.fn(async (query) => users.find((u) => u.username === query.username) || null),
    create: jest.fn(async (payload) => {
      const user = { ...payload, _id: `user_${users.length + 1}` };
      users.push(user);
      return user;
    }),
    find: jest.fn(() => ({ select: () => ({ lean: async () => users }) })),
    deleteMany: jest.fn(async () => {
      const count = users.length;
      users.length = 0;
      return { deletedCount: count };
    }),
    __reset: () => { users.length = 0; },
  };
});

jest.mock('../../src/models/pipeline-stage.model', () => ({
  findById: jest.fn(() => ({ lean: async () => global.__pipelineStageDoc || null })),
  deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
}));

jest.mock('../../src/models/trust-score.model', () => ({
  findOne: jest.fn(() => ({ lean: async () => null })),
  deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
}));

jest.mock('../../src/models/content-job.model', () => ({
  deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
}));

jest.mock('../../src/models/like.model', () => {
  const rows = [];
  return {
    findOne: jest.fn(async (q) => rows.find((r) => r.post === q.post && r.user === q.user) || null),
    create: jest.fn(async (payload) => { rows.push(payload); return payload; }),
    countDocuments: jest.fn(async (q) => rows.filter((r) => r.post === q.post).length),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    __reset: () => { rows.length = 0; },
  };
});

jest.mock('../../src/models/comment.model', () => {
  const rows = [];
  return {
    findOne: jest.fn(async (q) => rows.find((r) => r.post === q.post && r.user === q.user && r.text === q.text) || null),
    create: jest.fn(async (payload) => { rows.push(payload); return payload; }),
    countDocuments: jest.fn(async (q) => rows.filter((r) => r.post === q.post).length),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    __reset: () => { rows.length = 0; },
  };
});

jest.mock('../../src/models/reshare.model', () => {
  const rows = [];
  return {
    findOne: jest.fn(async (q) => rows.find((r) => r.originalPost === q.originalPost && r.user === q.user) || null),
    create: jest.fn(async (payload) => { rows.push(payload); return payload; }),
    countDocuments: jest.fn(async (q) => rows.filter((r) => r.originalPost === q.originalPost).length),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    __reset: () => { rows.length = 0; },
  };
});

jest.mock('../../src/models/saved-post.model', () => {
  const rows = [];
  return {
    findOne: jest.fn(async (q) => rows.find((r) => r.post === q.post && r.user === q.user) || null),
    create: jest.fn(async (payload) => { rows.push(payload); return payload; }),
    countDocuments: jest.fn(async () => rows.length),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    __reset: () => { rows.length = 0; },
  };
});

// Job creation and verification are mocked only as boundaries: the tests
// assert they are CALLED (verification must not be bypassed), and the values
// we feed back stand in for what the real engine computed.
jest.mock('../../src/services/content-router.service', () => ({
  createJob: jest.fn(async (post) => ({
    jobId: `job_${post._id}`,
    post: post._id,
    contentType: post.contentType === 'text' ? 'TEXT' : 'LINK',
    pipeline: post.contentType === 'text' ? 'nlp' : 'link_extraction',
    contentReference: { url: post.linkUrl },
  })),
}));

// The mock mirrors what the REAL orchestrator persists onto the post
// (pipelineStageRef, verification status and the engine's trust values), so
// the importer's read-back path is genuinely exercised.
jest.mock('../../src/services/pipeline-orchestrator.service', () => ({
  executePipeline: jest.fn(async (post) => {
    const behaviour = global.__pipelineBehaviour || {};

    if (behaviour.failFor && behaviour.failFor.includes(post._id)) {
      post.verificationStatus = 'FAILED';
      return { pipelineId: `pipe_${post._id}`, status: 'FAILED', error: 'simulated pipeline failure' };
    }

    const engine = behaviour.engine || { score: 88, label: 'Green' };
    post.pipelineStageRef = `stage_${post._id}`;
    post.verificationStatus = 'PUBLISHED';
    post.trustScore = engine.score;
    post.trustBadge = engine.label;
    post.trustBreakdown = {
      authenticity: 0.9,
      factualVerification: 0.5,
      sourceCredibility: 0.5,
      modelConfidence: 0.8,
    };

    return {
      pipelineId: `pipe_${post._id}`,
      status: 'COMPLETED',
      finalVerificationStatus: 'PUBLISHED',
      trustScoreResult: engine,
    };
  }),
}));

const Post = require('../../src/models/post.model');
const User = require('../../src/models/user.model');
const Like = require('../../src/models/like.model');
const Comment = require('../../src/models/comment.model');
const contentRouter = require('../../src/services/content-router.service');
const pipelineOrchestrator = require('../../src/services/pipeline-orchestrator.service');

const historicalImport = require('../../src/services/historical-import.service');

// ─── Fixtures ─────────────────────────────────────────────────────────

const WINDOW = { startDate: '2026-03-22', endDate: '2026-09-22' };

function makeRecord(overrides = {}) {
  return {
    sourceUrl: 'https://www.reuters.com/world/story-2026-05-17/',
    sourceName: 'Reuters',
    title: 'A real headline about a real event',
    content: 'A real summary of a real event as reported by the publisher.',
    publishedAt: '2026-05-17T00:00:00.000Z',
    category: 'WORLD',
    language: 'en',
    ...overrides,
  };
}

function makeRecords(count, category = 'WORLD') {
  return Array.from({ length: count }, (_, i) => makeRecord({
    sourceUrl: `https://www.reuters.com/world/story-${i}-2026-05-17/`,
    title: `Real headline number ${i}`,
    content: `Real summary number ${i}`,
    category,
    publishedAt: new Date(Date.UTC(2026, 3, 1 + (i % 150), 0, 0, 0)).toISOString(),
  }));
}

function stageDoc({ provider, status, label, claimCount = 2 }) {
  return {
    stages: [
      { stage: 'CLAIM_EXTRACTION', status: 'COMPLETED', result: { claimCount } },
      {
        stage: 'FACT_VERIFICATION',
        status: status === 'FAILED' ? 'FAILED' : status === 'SKIPPED' ? 'SKIPPED' : 'COMPLETED',
        serviceId: provider,
        result: { aggregateStatus: label, claimCount, providerUsed: provider },
      },
    ],
  };
}

beforeEach(() => {
  Post.__reset();
  User.__reset();
  Like.__reset();
  Comment.__reset();
  global.__pipelineBehaviour = {};
  global.__pipelineStageDoc = stageDoc({ provider: 'google-fact-check-api', status: 'COMPLETED', label: 'NO_EVIDENCE' });
  jest.clearAllMocks();
});

// ─── 1. Validation before writes ──────────────────────────────────────

describe('Historical import — record preparation', () => {
  test('keeps valid in-window records', () => {
    const result = historicalImport.prepareRecords([makeRecord()], WINDOW);
    expect(result.records).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  test('rejects out-of-window and placeholder records', () => {
    const result = historicalImport.prepareRecords([
      makeRecord({ publishedAt: '2026-01-05T00:00:00.000Z' }),
      makeRecord({ sourceUrl: 'https://example.com/fake', publishedAt: '2026-06-01T00:00:00.000Z' }),
    ], WINDOW);

    expect(result.records).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  test('de-duplicates repeated sources inside one dataset', () => {
    const result = historicalImport.prepareRecords([
      makeRecord(),
      makeRecord({ sourceUrl: 'https://www.reuters.com/world/story-2026-05-17/?utm_source=x' }),
    ], WINDOW);

    expect(result.records).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  test('survives a malformed dataset without throwing', () => {
    expect(historicalImport.prepareRecords(null, WINDOW).records).toEqual([]);
    expect(historicalImport.prepareRecords([null, 42], WINDOW).rejected).toHaveLength(2);
  });
});

// ─── 2/3/4. Post mapping and no fabricated trust data ────────────────

describe('Historical import — post construction', () => {
  test('maps provenance onto the existing Post schema fields', () => {
    const doc = historicalImport.buildPostDocument(makeRecord(), 'user_1');

    expect(doc.user).toBe('user_1');
    expect(doc.linkUrl).toBe('https://www.reuters.com/world/story-2026-05-17');
    expect(doc.linkTitle).toBe('A real headline about a real event');
    expect(doc.linkDescription).toBe('A real summary of a real event as reported by the publisher.');
    expect(doc.contentType).toBe('link');
    expect(doc.hashtags).toContain(historicalImport.MARKER_HASHTAG);
    expect(doc.visibility).toBe('public');
  });

  test('never fabricates a trust score, label or verification outcome', () => {
    const doc = historicalImport.buildPostDocument(makeRecord(), 'user_1');

    expect(doc.trustScore).toBeUndefined();
    expect(doc.trustBadge).toBeUndefined();
    expect(doc.trustBreakdown).toBeUndefined();
    // The pipeline decides the status; the importer only marks it as pending.
    expect(doc.verificationStatus).toBe('PENDING_VERIFICATION');
    expect(doc.moderationStatus).toBe('pending');
  });

  test('stores the real publication date, not the import time', () => {
    const doc = historicalImport.buildPostDocument(makeRecord(), 'user_1');
    expect(new Date(doc.createdAt).toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  test('quotes the real source and keeps its URL in the post text', () => {
    const text = historicalImport.buildPostText(makeRecord());
    expect(text).toContain('A real headline about a real event');
    expect(text).toContain('Reuters');
    expect(text).toContain('https://www.reuters.com/world/story-2026-05-17');
  });

  test('routes real content through the TEXT pipeline when asked', () => {
    const doc = historicalImport.buildPostDocument(makeRecord(), 'user_1', { asText: true });
    expect(doc.contentType).toBe('text');
    // Provenance is kept even when the article body is not fetched.
    expect(doc.linkUrl).toBe('https://www.reuters.com/world/story-2026-05-17');
  });

  test('forces the historical date onto the document when timestamps overwrite it', async () => {
    Post.create.mockImplementationOnce(async (payload) => {
      const doc = { ...payload, _id: 'post_forced', createdAt: new Date() };
      Post.__docs.push(doc);
      return doc;
    });

    await historicalImport.createHistoricalPost(makeRecord(), 'user_1');

    expect(Post.collection.updateOne).toHaveBeenCalledTimes(1);
    const update = Post.collection.updateOne.mock.calls[0][1];
    expect(update.$set.createdAt.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });
});

// ─── 5/7/8/9/10. Import behaviour ────────────────────────────────────

describe('Historical import — import and verification', () => {
  test('runs the real verification pipeline for each inserted post', async () => {
    const users = [{ _id: 'user_1' }];
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(3),
      users,
      options: { target: 3 },
    });

    expect(stats.inserted).toBe(3);
    expect(contentRouter.createJob).toHaveBeenCalledTimes(3);
    expect(pipelineOrchestrator.executePipeline).toHaveBeenCalledTimes(3);
    // The stored trust values must come from the pipeline, not the importer.
    expect(pipelineOrchestrator.executePipeline).toHaveBeenCalled();
  });

  test('counts trust labels from engine output, never assigns them itself', async () => {
    global.__pipelineBehaviour = { engine: { score: 91, label: 'Blue' } };

    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(2),
      users: [{ _id: 'user_1' }],
      options: { target: 2 },
    });

    // The blue label is counted because the engine produced it...
    expect(stats.labels.Blue).toBe(2);
    expect(stats.labels.Green).toBe(0);

    // ...and the payload the importer itself created carried no trust values.
    const createdPayloads = Post.create.mock.calls.map(([payload]) => payload);
    expect(createdPayloads).toHaveLength(2);
    expect(createdPayloads.every((p) => p.trustScore === undefined)).toBe(true);
    expect(createdPayloads.every((p) => p.trustBadge === undefined)).toBe(true);
  });

  test('counts a Google Fact Check verdict as a match', async () => {
    global.__pipelineStageDoc = stageDoc({ provider: 'google-fact-check-api', status: 'COMPLETED', label: 'VERIFIED_FALSE' });
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(1),
      users: [{ _id: 'user_1' }],
      options: { target: 1 },
    });

    expect(stats.factCheck.googleUsed).toBe(1);
    expect(stats.factCheck.matches).toBe(1);
    expect(stats.factCheck.noEvidence).toBe(0);
  });

  test('treats "no match" as no evidence, never as verified', async () => {
    global.__pipelineStageDoc = stageDoc({ provider: 'google-fact-check-api', status: 'COMPLETED', label: 'NO_EVIDENCE' });
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(1),
      users: [{ _id: 'user_1' }],
      options: { target: 1 },
    });

    expect(stats.factCheck.googleUsed).toBe(1);
    expect(stats.factCheck.noEvidence).toBe(1);
    expect(stats.factCheck.matches).toBe(0);
  });

  test('records a fallback provider separately from Google', async () => {
    global.__pipelineStageDoc = stageDoc({ provider: 'gemini', status: 'COMPLETED', label: 'UNKNOWN' });
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(1),
      users: [{ _id: 'user_1' }],
      options: { target: 1 },
    });

    expect(stats.factCheck.googleUsed).toBe(0);
    expect(stats.factCheck.fallbackUsed).toBe(1);
  });

  test('counts a skipped fact-check separately', async () => {
    global.__pipelineStageDoc = stageDoc({ provider: null, status: 'SKIPPED', label: null });
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(1),
      users: [{ _id: 'user_1' }],
      options: { target: 1 },
    });

    expect(stats.factCheck.skipped).toBe(1);
    expect(stats.factCheck.googleUsed).toBe(0);
  });

  test('a failing record is recorded and does not abort the rest', async () => {
    const users = [{ _id: 'user_1' }];
    const records = makeRecords(4);
    global.__pipelineBehaviour = { failFor: ['post_1'] };

    const { stats, errors } = await historicalImport.importHistoricalPosts({
      records,
      users,
      options: { target: 4 },
    });

    expect(stats.inserted).toBe(4);
    expect(stats.failedPipeline).toBe(1);
    expect(errors.some((e) => e.stage === 'PIPELINE')).toBe(true);
  });

  test('a thrown error on one record does not corrupt the batch', async () => {
    const users = [{ _id: 'user_1' }];
    const records = makeRecords(3);
    Post.create.mockRejectedValueOnce(new Error('simulated write failure'));

    const { stats, errors } = await historicalImport.importHistoricalPosts({
      records,
      users,
      options: { target: 3 },
    });

    expect(stats.rejected).toBe(1);
    expect(stats.inserted).toBe(2);
    expect(errors[0].error).toMatch(/simulated write failure/);
  });

  test('dry run writes nothing', async () => {
    const { stats } = await historicalImport.importHistoricalPosts({
      records: makeRecords(5),
      users: [{ _id: 'user_1' }],
      options: { dryRun: true, target: 5 },
    });

    expect(stats.processed).toBe(5);
    expect(Post.create).not.toHaveBeenCalled();
    expect(pipelineOrchestrator.executePipeline).not.toHaveBeenCalled();
  });

  test('tracks the real date range of the imported records', async () => {
    const { stats } = await historicalImport.importHistoricalPosts({
      records: [
        makeRecord({ publishedAt: '2026-03-22T00:00:00.000Z', sourceUrl: 'https://www.reuters.com/a' }),
        makeRecord({ publishedAt: '2026-09-22T00:00:00.000Z', sourceUrl: 'https://www.reuters.com/b' }),
      ],
      users: [{ _id: 'user_1' }],
      options: { target: 2 },
    });

    expect(stats.dates.oldest).toBe('2026-03-22');
    expect(stats.dates.newest).toBe('2026-09-22');
  });
});

// ─── 6/7. Duplicate prevention and 150 counting ───────────────────────

describe('Historical import — idempotency', () => {
  test('imports 150 records, then imports 0 on a second run', async () => {
    const users = [{ _id: 'user_1' }];
    const records = makeRecords(150);

    const first = await historicalImport.importHistoricalPosts({ records, users, options: { target: 150 } });
    expect(first.stats.inserted).toBe(150);
    expect(first.stats.skippedDuplicates).toBe(0);
    expect(Post.__docs).toHaveLength(150);

    const second = await historicalImport.importHistoricalPosts({ records, users, options: { target: 150 } });
    expect(second.stats.inserted).toBe(0);
    expect(second.stats.skippedDuplicates).toBe(150);
    // Still 150 — never 300.
    expect(Post.__docs).toHaveLength(150);
    expect(await historicalImport.countImportedPosts()).toBe(150);
  });

  test('finds an existing post by normalized source URL', async () => {
    await historicalImport.importHistoricalPosts({
      records: [makeRecord()],
      users: [{ _id: 'user_1' }],
      options: { target: 1 },
    });

    const found = await historicalImport.findExistingPost(
      makeRecord({ sourceUrl: 'https://www.reuters.com/world/story-2026-05-17/?utm_source=newsletter' })
    );
    expect(found).not.toBeNull();
  });

  test('re-verifies existing posts only when explicitly asked', async () => {
    const users = [{ _id: 'user_1' }];
    const records = makeRecords(2);

    await historicalImport.importHistoricalPosts({ records, users, options: { target: 2 } });
    pipelineOrchestrator.executePipeline.mockClear();

    const { stats } = await historicalImport.importHistoricalPosts({
      records,
      users,
      options: { target: 2, update: true },
    });

    expect(stats.updated).toBe(2);
    expect(stats.inserted).toBe(0);
    expect(pipelineOrchestrator.executePipeline).toHaveBeenCalledTimes(2);
    expect(Post.__docs).toHaveLength(2);
  });
});

// ─── 13/14. Seed accounts and engagement ─────────────────────────────

describe('Historical import — seed accounts and engagement', () => {
  test('seed accounts are named so they cannot be mistaken for people', () => {
    const profile = historicalImport.seedUserProfile(1);
    expect(profile.name).toBe('Nexora Seed User 001');
    expect(profile.username).toBe('nexora_seed_001');
    expect(profile.bio).toMatch(/not a real person/i);
  });

  test('seed accounts are created once and reused afterwards', async () => {
    const first = await historicalImport.ensureSeedUsers(3);
    expect(first).toHaveLength(3);
    expect(User.create).toHaveBeenCalledTimes(3);

    User.create.mockClear();
    const second = await historicalImport.ensureSeedUsers(3);
    expect(second).toHaveLength(3);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('seeded engagement is idempotent and keeps post counters consistent', async () => {
    const posts = [{ _id: 'post_1' }, { _id: 'post_2' }];
    const users = [{ _id: 'user_1' }, { _id: 'user_2' }, { _id: 'user_3' }];

    const first = await historicalImport.createSeededEngagement({
      posts,
      users,
      options: { likesPerPost: 2, commentsPerPost: 1, savesPerPost: 1, resharesPerPost: 1 },
    });
    expect(first.likes).toBe(4);
    expect(first.comments).toBe(2);

    // Post counters are refreshed from the rows that exist.
    const counterUpdate = Post.updateOne.mock.calls.find(([q]) => q._id === 'post_1');
    expect(counterUpdate[1].$set.likesCount).toBe(2);
    expect(counterUpdate[1].$set.commentsCount).toBe(1);

    Post.updateOne.mockClear();
    const second = await historicalImport.createSeededEngagement({
      posts,
      users,
      options: { likesPerPost: 2, commentsPerPost: 1, savesPerPost: 1, resharesPerPost: 1 },
    });
    expect(second.likes).toBe(0);
    expect(second.comments).toBe(0);
  });
});

// ─── 15. Reporting ────────────────────────────────────────────────────

describe('Historical import — reporting', () => {
  function runStats(overrides = {}) {
    return {
      target: 150,
      processed: 10,
      inserted: 9,
      updated: 1,
      skippedDuplicates: 0,
      rejected: 1,
      failedPipeline: 0,
      labels: { Green: 3, Blue: 2, Purple: 1, Orange: 2, Red: 1 },
      categories: { TECHNOLOGY: 10 },
      sources: { Reuters: 10 },
      factCheck: { googleUsed: 7, matches: 2, noEvidence: 5, fallbackUsed: 1, skipped: 1, errors: 0 },
      dates: { oldest: '2026-03-22', newest: '2026-09-22' },
      engagement: { likes: 4, comments: 2, saves: 1, reshares: 1 },
      durationMs: 1000,
      ...overrides,
    };
  }

  test('reports the numbers from the run, not placeholders', () => {
    const report = historicalImport.formatReport({ stats: runStats() });
    expect(report).toContain('NEXORA HISTORICAL DATA IMPORT');
    expect(report).toContain('9');
    expect(report).toContain('2026-03-22');
    expect(report).toContain('2026-09-22');
  });

  test('reflects a different run faithfully (nothing is hardcoded to 150)', () => {
    const report = historicalImport.formatReport({ stats: runStats({ inserted: 7, processed: 7 }) });
    expect(report).toMatch(/Inserted:\s+7/);
    expect(report).toMatch(/Processed:\s+7/);

    const other = historicalImport.formatReport({ stats: runStats({ inserted: 123 }) });
    expect(other).toMatch(/Inserted:\s+123/);
  });

  test('includes every trust label bucket and the fact-check counts', () => {
    const report = historicalImport.formatReport({ stats: runStats() });
    for (const label of ['Green', 'Blue', 'Purple', 'Orange', 'Red']) {
      expect(report).toContain(label);
    }
    expect(report).toMatch(/Google Fact Check used:\s+7/);
    expect(report).toMatch(/No evidence:\s+5/);
  });

  test('surfaces recorded errors in the report', () => {
    const report = historicalImport.formatReport({
      stats: runStats(),
      errors: [{ stage: 'PIPELINE', sourceUrl: 'https://www.reuters.com/x', error: 'timeout' }],
    });
    expect(report).toContain('ERRORS (1)');
    expect(report).toContain('timeout');
  });

  test('discovery report states the shortfall instead of implying completeness', () => {
    const report = historicalImport.formatDiscoveryReport({
      stats: {
        target: 150,
        selected: 88,
        daysInRange: 185,
        daysScheduled: 185,
        daysFetched: 90,
        daysFromCache: 0,
        daysMissing: 2,
        daysFailed: 3,
        discovered: 900,
        duplicatesRemoved: 10,
        rejectedByValidation: 5,
        validCandidates: 885,
        availablePerCategory: [['WORLD', 400]],
        aborted: null,
      },
    });
    expect(report).toContain('SHORTFALL');
    expect(report).toContain('No filler was invented');
  });
});
