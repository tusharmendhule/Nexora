/**
 * End-to-end verification test — 10 posts covering every claim/media type.
 * =======================================================================
 * Creates 10 posts and runs each through the REAL async verification pipeline:
 *   - real text claims   (should be treated as trustworthy)
 *   - fake text claims   (should be treated as suspect)
 *   - real photographs   (image authenticity + media claims)
 *   - AI-generated images (image authenticity + media claims)
 *
 * For every post it prints the final status/score/label, and the extracted
 * claims with their claim type + fact-check status. Image posts additionally
 * show the AI-generated verdict.
 *
 * External dependencies (reachable from this machine AND the Python AI
 * service): the image URLs below, plus GEMINI_API_KEY for OCR/claims.
 *
 * Run against a running server:
 *   node test-end-to-end-10-posts.js
 *   E2E_BASE=http://localhost:5055/api/v1 node test-end-to-end-10-posts.js
 */
const BASE = process.env.E2E_BASE || 'http://localhost:5000/api/v1';

// Real photographs (OpenCV sample data — stable, hotlink-friendly).
const REAL_PHOTOS = {
  messi: 'https://raw.githubusercontent.com/opencv/opencv/master/samples/data/messi5.jpg',
  lena: 'https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg',
};
// AI-generated images (already uploaded to Cloudinary by the seed tooling).
const AI_IMAGES = {
  ai_00: 'https://res.cloudinary.com/vknaxu3z/image/upload/v1788679931/nexora_seed_ai/nexora_seed_ai/ai_00.png',
  ai_01: 'https://res.cloudinary.com/vknaxu3z/image/upload/v1788679933/nexora_seed_ai/nexora_seed_ai/ai_01.jpg',
};

// ─── The 10 posts ─────────────────────────────────────────────────────
// kind: 'real' | 'fake' for text, 'real-image' | 'ai-image' for media.
const POSTS = [
  // ── Real text claims ──────────────────────────────────────────────
  {
    kind: 'real',
    note: 'science fact',
    text:
      'Pure water boils at 100 degrees Celsius (212 degrees Fahrenheit) at standard ' +
      'atmospheric pressure at sea level, a value defined by the International System of Units.',
  },
  {
    kind: 'real',
    note: 'astronomy fact',
    text:
      'The Earth orbits the Sun at an average distance of about 149.6 million kilometers, ' +
      'completing one orbit every 365.25 days, as measured by NASA.',
  },
  {
    kind: 'real',
    note: 'geography fact',
    text:
      'Mount Everest is the highest mountain above sea level at 8,848.86 meters, a height ' +
      'officially recognized by China and Nepal in December 2020.',
  },
  // ── Fake text claims ──────────────────────────────────────────────
  {
    kind: 'fake',
    note: 'flat-earth hoax',
    text:
      'BREAKING: Scientists at NASA have confirmed that the Earth is flat and the Moon is ' +
      'actually a giant hologram projected by the government since 1969.',
  },
  {
    kind: 'fake',
    note: 'dangerous health hoax',
    text:
      'Doctors are hiding it: drinking a small amount of bleach every day cures all viral ' +
      'infections, according to a leaked World Health Organization study.',
  },
  {
    kind: 'fake',
    note: 'popular myth',
    text:
      'The Great Wall of China is the only man-made object on Earth that is visible from ' +
      'space with the naked eye.',
  },
  // ── Real photograph + claim caption ───────────────────────────────
  {
    kind: 'real-image',
    note: 'real photo + TRUE caption',
    image: REAL_PHOTOS.messi,
    text:
      'Straight off the camera, no edits. For the record, the speed of light in a vacuum ' +
      'is exactly 299,792,458 meters per second.',
  },
  {
    kind: 'real-image',
    note: 'real photo + FALSE caption',
    image: REAL_PHOTOS.lena,
    text:
      'Unedited photo. This proves the Apollo Moon landings were filmed in a desert ' +
      'studio, and the Moon is only 300 kilometers away from Earth.',
  },
  // ── AI-generated image + claim caption ────────────────────────────
  {
    kind: 'ai-image',
    note: 'AI image + claim caption',
    image: AI_IMAGES.ai_00,
    text:
      'Photorealistic reconstruction shared online. Some say the Great Wall of China is the ' +
      'only man-made object visible from space with the naked eye.',
  },
  {
    kind: 'ai-image',
    note: 'AI image + claim caption',
    image: AI_IMAGES.ai_01,
    text:
      'This image was generated, but the claim stands: humans only use 10 percent of their ' +
      'brains, and the rest is unused.',
  },
];

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
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

function short(text, n = 72) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, n);
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
  console.log(`✅ Logged in as seeduser01: ${login.json.user?.name}`);
  console.log(`   Base: ${BASE}\n`);
  console.log(`Creating and verifying ${POSTS.length} posts…\n`);

  const rows = [];

  for (let i = 0; i < POSTS.length; i++) {
    const spec = POSTS[i];
    const isImage = spec.kind === 'real-image' || spec.kind === 'ai-image';
    const n = i + 1;

    const body = isImage
      ? {
          text: spec.text,
          contentType: 'image',
          media: [{ url: spec.image, type: 'image', altText: spec.note }],
        }
      : { text: spec.text };

    const created = await api('/posts', { method: 'POST', token, body });
    const post = created.json.post || created.json;
    const id = post._id || post.id;

    console.log(`${'─'.repeat(72)}`);
    console.log(`#${n}  [${spec.kind}] ${spec.note}${isImage ? `  (${short(spec.image, 48)}…)` : ''}`);
    console.log(`    text: ${short(spec.text, 90)}${spec.text.length > 90 ? '…' : ''}`);

    if (!id) {
      console.log(`    ❌ post creation failed: ${JSON.stringify(created.json).slice(0, 160)}`);
      rows.push({ n, kind: spec.kind, status: 'CREATE_FAILED', score: '-', label: '-', claims: 0, aiGenerated: '-' });
      continue;
    }

    const t0 = Date.now();
    const polled = await waitForPipeline(id, token);
    const dt = Date.now() - t0;
    const state = polled.json?.post || {};

    console.log(
      `    status: ${state.verificationStatus}  score: ${state.trustScore}  label: ${state.trustBadge}  (${dt}ms)`
    );

    // ── Claims ──────────────────────────────────────────────────
    const claimsRes = await api(`/content/extract-claims/${id}`, { token });
    const claims = claimsRes.json?.analysis?.claims || [];
    console.log(`    claims (${claims.length}):`);
    if (claims.length === 0) {
      console.log('      (none extracted)');
    } else {
      for (const c of claims.slice(0, 4)) {
        const txt = typeof c === 'string' ? c : c.text;
        console.log(
          `      • [${c.claimType || 'UNKNOWN'} / ${c.factCheckStatus || 'unverified'}] ${short(txt, 80)}`
        );
      }
    }

    // ── AI-generated verdict (image posts only) ─────────────────
    let aiVerdict = '-';
    if (isImage) {
      const ia = await api(`/content/analyze-image/${id}`, { token });
      const a = ia.json?.analysis || {};
      aiVerdict = `${a.aiGenerated} (p=${a.aiGeneratedProbability}, ${a.aiDetectionModel || 'no-model'})`;
      console.log(`    image analysis: aiGenerated=${aiVerdict}`);
    }

    rows.push({
      n,
      kind: spec.kind,
      status: state.verificationStatus,
      score: state.trustScore,
      label: state.trustBadge,
      claims: claims.length,
      aiGenerated: aiVerdict,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(72)}`);
  console.log('SUMMARY — 10 posts');
  console.log(`${'═'.repeat(72)}`);
  console.table(
    rows.map((r) => ({
      '#': r.n,
      kind: r.kind,
      status: r.status,
      score: r.score,
      label: r.label,
      claims: r.claims,
      aiGenerated: r.aiGenerated,
    }))
  );

  const text = rows.filter((r) => r.kind === 'real' || r.kind === 'fake');
  const realAvg = avg(text.filter((r) => r.kind === 'real').map((r) => r.score));
  const fakeAvg = avg(text.filter((r) => r.kind === 'fake').map((r) => r.score));
  console.log(`\nText claim scores: real avg ${realAvg} | fake avg ${fakeAvg}`);
  console.log(
    `Image posts: ${rows.filter((r) => r.kind.endsWith('image')).length} ` +
      `(AI-generated flagged: ${rows.filter((r) => String(r.aiGenerated).startsWith('true')).length})`
  );

  function avg(arr) {
    const nums = arr.filter((v) => typeof v === 'number');
    return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 'n/a';
  }
})().catch((e) => {
  console.error('TEST ERROR:', e.message);
  process.exit(1);
});
