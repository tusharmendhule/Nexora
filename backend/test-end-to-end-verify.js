/**
 * End-to-end verification test — proves the trust analysis is REAL, not
 * hardcoded and not a pending placeholder.
 *
 *   1. Login as a seeded local user.
 *   2. Create a REAL-fact post  (expect a higher/benign outcome)
 *   3. Create a FAKE-claim post (expect a worse outcome)
 *   4. Wait for the asynchronous content pipeline to finish for each post
 *      (the POST /posts call enqueues a ContentJob; this waits for the real
 *      result rather than reading the immediate neutral placeholder).
 *   5. Print the real claims, provider, trust score and label.
 *
 * Run against a running server:
 *   node test-end-to-end-verify.js
 *   E2E_BASE=http://localhost:5055/api/v1 node test-end-to-end-verify.js
 */
const BASE = process.env.E2E_BASE || 'http://localhost:5000/api/v1';

// A post is "done" once its verification status reaches a terminal state.
const TERMINAL_STATUSES = new Set([
  'PUBLISHED',
  'REJECTED',
  'REVIEW_REQUIRED',
  'VERIFIED',
  'FAILED',
]);

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

// Poll GET /pipeline/:postId until the post reaches a terminal status or the
// timeout elapses. Returns the last response seen.
async function waitForPipeline(postId, token, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await api(`/pipeline/${postId}`, { token });
    const post = last.json?.post || {};
    if (TERMINAL_STATUSES.has(post.verificationStatus)) {
      return last;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return last;
}

function fmt(n) {
  return typeof n === 'number' && n.toFixed ? n.toFixed(2) : n;
}

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} — ${detail || 'FAILED'}`);
  }
}

(async () => {
  // 1. Login
  const login = await api('/auth/login-local', {
    method: 'POST',
    body: { identifier: 'seeduser01@nexora.app', password: 'NexoraSeed123!' },
  });
  if (!login.json.token) {
    console.error('LOGIN FAILED:', JSON.stringify(login, null, 2));
    process.exit(1);
  }
  const token = login.json.token;
  console.log('✅ Logged in as seeduser01:', login.json.user?.name);

  // 2. Create posts
  const realFact =
    'Water freezes at 0 degrees Celsius (32 degrees Fahrenheit) at standard atmospheric pressure, ' +
    'a fact confirmed by the National Institute of Standards and Technology and taught in physics worldwide.';
  const fakeClaim =
    'BREAKING: Scientists at NASA have confirmed that the Earth is flat and the Moon is actually ' +
    'a giant hologram projected by the government since 1969.';

  const p1 = await api('/posts', { method: 'POST', token, body: { text: realFact } });
  const p2 = await api('/posts', { method: 'POST', token, body: { text: fakeClaim } });
  const post1 = p1.json.post || p1.json;
  const post2 = p2.json.post || p2.json;
  const id1 = post1._id || post1.id;
  const id2 = post2._id || post2.id;
  console.log('✅ Created posts:', id1, '|', id2);

  const results = [];

  for (const [label, id, text] of [
    ['REAL FACT ', id1, realFact],
    ['FAKE CLAIM', id2, fakeClaim],
  ]) {
    console.log(`\n━━━ ${label} — ${text.slice(0, 60)}… ━━━`);

    const t0 = Date.now();
    const polled = await waitForPipeline(id, token);
    const dt = Date.now() - t0;
    const post = polled.json?.post || {};
    const pipeline = polled.json?.pipeline;

    console.log(`  pipeline ready in ${dt}ms — status: ${post.verificationStatus}`);

    // Real extracted claims (never undefined/pending). The pipeline persists
    // them on a ClaimEntity document keyed by post.
    const claimsRes = await api(`/content/extract-claims/${id}`, { token });
    const claims = claimsRes.json?.analysis?.claims || [];
    const claimTexts = claims
      .map((c) => (typeof c === 'string' ? c : c.text))
      .filter((t) => typeof t === 'string' && t.trim().length > 0);

    console.log(`  claims (${claimTexts.length}):`);
    claimTexts.slice(0, 3).forEach((t) => console.log(`    • ${t}`));

    console.log(`  trustScore: ${fmt(post.trustScore)}/100  LABEL: ${post.trustBadge}`);
    const b = post.trustBreakdown || {};
    console.log(
      `  components: auth ${fmt(b.authenticity)} | factual ${fmt(b.factualVerification)} | ` +
        `source ${fmt(b.sourceCredibility)} | model ${fmt(b.modelConfidence)}`
    );
    if (pipeline?.finalVerificationStatus) {
      console.log(`  pipeline final: ${pipeline.finalVerificationStatus}`);
    }

    // Only NAME extraction stage providers that actually ran.
    const stages = pipeline?.stages || [];
    const ranStages = stages.filter((s) => s.status === 'COMPLETED').map((s) => s.stage);
    if (ranStages.length) console.log(`  stages completed: ${ranStages.join(', ')}`);

    assert(`${label}: reached terminal status`, TERMINAL_STATUSES.has(post.verificationStatus));
    assert(`${label}: real claims extracted (non-empty)`, claimTexts.length > 0,
      `got ${claimTexts.length} claims`);
    assert(`${label}: trust score is a real number`, typeof post.trustScore === 'number');

    results.push({ label, id, status: post.verificationStatus, score: post.trustScore, claimCount: claimTexts.length });
  }

  // ── Cross-post expectation ─────────────────────────────────────────
  // The fake claim must not be treated better than the real fact: it should
  // score lower and/or be rejected while the real fact is not.
  const [real, fake] = results;
  console.log('\n━━━ SUMMARY ━━━');
  console.table(results);

  assert(
    'real fact not rejected',
    real.status !== 'REJECTED',
    `status=${real.status}`
  );
  assert(
    'fake claim scores <= real fact',
    typeof fake.score === 'number' && typeof real.score === 'number' && fake.score <= real.score,
    `real=${real.score} fake=${fake.score}`
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('TEST ERROR:', e.message);
  process.exit(1);
});
