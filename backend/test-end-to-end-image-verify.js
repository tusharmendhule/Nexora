/**
 * End-to-end verification test — IMAGE posts.
 * Proves the image pipeline produces REAL results, not placeholders:
 *
 *   1. Login as a seeded local user.
 *   2. Create an AI-generated image post and a real-photo image post.
 *   3. Wait for the asynchronous IMAGE pipeline to finish.
 *   4. Assert:
 *        - the pipeline completes (does NOT fail),
 *        - the image analysis carries a REAL AI-generated verdict
 *          (aiGeneratedProbability + aiDetectionModel + boolean aiGenerated),
 *        - media claims were extracted from the image/caption and are real.
 *
 * External dependencies (must be reachable from this machine AND the Python
 * AI service): the image URLs below, plus GEMINI_API_KEY for OCR/claims.
 *
 * Run against a running server:
 *   node test-end-to-end-image-verify.js
 *   E2E_BASE=http://localhost:5055/api/v1 node test-end-to-end-image-verify.js
 */
const BASE = process.env.E2E_BASE || 'http://localhost:5000/api/v1';

// A documented (real) AI-generated image and a documented real photograph.
const AI_IMAGE_URL =
  process.env.E2E_AI_IMAGE_URL ||
  'https://res.cloudinary.com/vknaxu3z/image/upload/v1788679931/nexora_seed_ai/nexora_seed_ai/ai_00.png';
const REAL_IMAGE_URL =
  process.env.E2E_REAL_IMAGE_URL ||
  'https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg';

// Caption carries one deliberately verifiable claim so the media claim
// extraction path has something real to find (image OCR alone may be empty).
const CAPTION =
  'Shared online as a photorealistic reconstruction. Some say the Great Wall of China ' +
  'is the only man-made object visible from space with the naked eye.';

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

async function waitForPipeline(postId, token, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await api(`/pipeline/${postId}`, { token });
    if (TERMINAL_STATUSES.has(last.json?.post?.verificationStatus)) return last;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return last;
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

  const collected = {};

  for (const [name, url] of [
    ['AI-IMAGE  ', AI_IMAGE_URL],
    ['REAL-PHOTO', REAL_IMAGE_URL],
  ]) {
    console.log(`\n━━━ ${name} — ${url.slice(0, 70)}… ━━━`);

    const created = await api('/posts', {
      method: 'POST',
      token,
      body: {
        text: CAPTION,
        contentType: 'image',
        media: [{ url, type: 'image', altText: name }],
      },
    });
    const post = created.json.post || created.json;
    const id = post._id || post.id;
    if (!id) {
      assert(`${name}: post created`, false, JSON.stringify(created.json).slice(0, 200));
      continue;
    }

    const t0 = Date.now();
    const polled = await waitForPipeline(id, token);
    const dt = Date.now() - t0;
    const postState = polled.json?.post || {};
    const pipeline = polled.json?.pipeline;

    console.log(
      `  pipeline ready in ${dt}ms — status: ${postState.verificationStatus} ` +
        `(score ${postState.trustScore}, ${postState.trustBadge})`
    );
    const stages = pipeline?.stages || [];
    console.log(`  stages: ${stages.map((s) => `${s.stage}:${s.status}`).join(', ')}`);

    // ── Image analysis: real AI-generated verdict ────────────────────
    const ia = await api(`/content/analyze-image/${id}`, { token });
    const analysis = ia.json?.analysis || {};
    console.log(
      `  image analysis: aiGeneratedProbability=${analysis.aiGeneratedProbability} ` +
        `aiDetectionModel=${analysis.aiDetectionModel} aiGenerated=${analysis.aiGenerated}`
    );

    // ── Media claims ─────────────────────────────────────────────────
    const claimsRes = await api(`/content/extract-claims/${id}`, { token });
    const claims = claimsRes.json?.analysis?.claims || [];
    const claimTexts = claims
      .map((c) => (typeof c === 'string' ? c : c.text))
      .filter((t) => typeof t === 'string' && t.trim().length > 0);
    console.log(`  media claims (${claimTexts.length}):`);
    claimTexts.slice(0, 3).forEach((t) => console.log(`    • ${t}`));

    // ── Assertions ───────────────────────────────────────────────────
    assert(`${name}: reached terminal status`, TERMINAL_STATUSES.has(postState.verificationStatus));
    assert(
      `${name}: pipeline did NOT fail`,
      postState.verificationStatus !== 'FAILED',
      `status=${postState.verificationStatus}`
    );

    const prob = analysis.aiGeneratedProbability;
    assert(
      `${name}: real AI-generated probability present (0–1)`,
      typeof prob === 'number' && prob >= 0 && prob <= 1,
      `got ${prob}`
    );
    assert(
      `${name}: AI detection model reported`,
      typeof analysis.aiDetectionModel === 'string' && analysis.aiDetectionModel.length > 0,
      `got ${analysis.aiDetectionModel}`
    );
    assert(
      `${name}: AI-generated label consistent with probability`,
      typeof analysis.aiGenerated === 'boolean' && typeof prob === 'number'
        ? analysis.aiGenerated === prob >= 0.5
        : false,
      `aiGenerated=${analysis.aiGenerated} prob=${prob}`
    );
    assert(
      `${name}: real media claims extracted`,
      claimTexts.length > 0,
      `got ${claimTexts.length} claims`
    );

    collected[name.trim()] = { status: postState.verificationStatus, aiGenerated: analysis.aiGenerated, prob };
  }

  // Cross-check: a documented real photograph must not be labelled AI-generated.
  const real = collected['REAL-PHOTO'];
  assert(
    'REAL-PHOTO: labelled as NOT AI-generated',
    real && real.aiGenerated === false,
    real ? `aiGenerated=${real.aiGenerated} prob=${real.prob}` : 'no result'
  );

  console.log('\n━━━ SUMMARY ━━━');
  console.table(collected);
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('TEST ERROR:', e.message);
  process.exit(1);
});
