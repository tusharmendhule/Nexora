/**
 * Live 20-Post Trust Score Verification Runner
 * ============================================
 * Drives the REAL application end to end (no mocks):
 *   1. Local auth (login → JWT)                     POST /api/v1/auth/login-local
 *   2. Post creation                                POST /api/v1/posts
 *   3. Background pipeline completion               GET  /api/v1/pipeline/:postId
 *   4. Trust score after pipeline (capture)         GET  /api/trust-score/:postId
 *   5. Explicit verification                        POST /api/v1/pipeline/verify/:postId
 *   6. Final persisted reads                        GET  /api/v1/posts/:postId
 *                                                  GET  /api/trust-score/:postId
 *
 * Every HTTP response is recorded faithfully (status codes and errors are
 * stored, never hidden). No values are fabricated: claims, fact-check
 * outcomes, evidence URLs and labels come straight from API responses.
 *
 * Usage:  cd backend && node test/live-20-posts-runner.js
 * Output: live-results/live20-raw.json      (full responses)
 *         live-results/live20-summary.json  (one flat row per post)
 *         live-results/live20-run.log       (progress log)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const OUT_DIR = path.join(__dirname, '..', '..', 'live-results');
fs.mkdirSync(OUT_DIR, { recursive: true });

const EMAIL = 'pilot-live@nexora.test';
const PASSWORD = 'pilotpass123';

// ─── Corpus: 20 posts (aligned with backend/test/test-corpus.md) ─────
const CORPUS = [
  // Category A — known true claims (expect evidence-backed support)
  { id: 'A1', category: 'known-true', text: 'Scientists confirm that drinking water is essential for human survival. H2O is necessary for all known forms of life.' },
  { id: 'A2', category: 'known-true', text: 'The Earth revolves around the Sun, confirmed by astronomical observation.' },
  { id: 'A3', category: 'known-true', text: 'Peer-reviewed studies show that vaccines are safe and effective.' },
  { id: 'A4', category: 'known-true', text: 'Historical records confirm that the Roman Empire fell in 476 CE.' },
  // Category B — evidence-confirmed false / contradicted claims
  { id: 'B1', category: 'evidence-false', text: 'Drinking bleach prevents COVID-19.' },
  { id: 'B2', category: 'evidence-false', text: '5G towers spread coronavirus disease.' },
  { id: 'B3', category: 'mixed-false-dominant', text: 'Vitamin C cures cancer completely, while also boosting the immune system.' },
  { id: 'B4', category: 'manipulated-claim', text: 'Edited video proves the politician said something they never said.' },
  // Category C — mixed / partially supported
  { id: 'C1', category: 'mixed', text: 'Eating carrots improves vision, but they will not give you night vision in total darkness.' },
  { id: 'C2', category: 'mixed', text: 'Study shows correlation between ice cream sales and drowning.' },
  { id: 'C3', category: 'mixed', text: 'New study suggests link between X biomarker and Y disease progression.' },
  // Category D — no evidence available
  { id: 'D1', category: 'no-evidence', text: 'The optimal temperature for brewing green tea is 80 degrees Celsius.' },
  { id: 'D2', category: 'no-evidence', text: 'The traditional method of pottery firing in region X uses temperature Y.' },
  { id: 'D3', category: 'no-evidence', text: 'The optimal steeping time for matcha tea is 30 seconds.' },
  // Step 8 — known-false claim WITHOUT a matching Google fact-check review.
  // Expected: NO_EVIDENCE must NOT be treated as truth or falsehood.
  { id: 'D4', category: 'false-no-review', text: 'Drinking warm lemon water cures diabetes within seven days.' },
  // Category E — AI-generated content
  { id: 'E1', category: 'ai-generated-supported', contentType: 'image',
    media: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/4/41/DALL-E_2_artificial_intelligence_digital_image_generated_photo.jpg', type: 'image' }],
    text: 'AI-generated illustration (DALL-E 2). Research indicates that daily walking of 30 minutes reduces risk of heart disease by 20%.' },
  { id: 'E2', category: 'ai-generated-unsupported', text: 'AI-generated: Algorithm can predict stock market prices with 99% accuracy.' },
  // Category F — opinion / satire
  { id: 'F1', category: 'opinion', text: 'In my opinion, pineapple belongs on pizza. It is a matter of personal taste.' },
  { id: 'F2', category: 'satire', text: "The Onion: 'Local Man Claims Wooden Spoon Cures All Ailments, Scientists Baffled'." },
  // Category G — misleading context without explicit falsehood
  { id: 'G2', category: 'misleading-context', text: 'Study shows X, but leaves out important context Y, leading to misleading impression.' },
];

// ─── HTTP helpers (real network calls only) ──────────────────────────

async function api(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = { _unparsed: text.slice(0, 500) }; }
    return { status: res.status, ms: Date.now() - started, body: json };
  } catch (err) {
    return { status: 0, ms: Date.now() - started, error: err.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPipeline(token, postId, maxMs = 300000) {
  const deadline = Date.now() + maxMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await api('GET', `/api/v1/pipeline/${postId}`, null, token);
    last = res;
    const status = res.body && res.body.pipeline && res.body.pipeline.status;
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') return res;
    await sleep(3000);
  }
  return last; // timed out — caller records it faithfully
}

function pickEvidenceUrls(verifyBody) {
  const urls = [];
  const v = (verifyBody && verifyBody.verification) || verifyBody || {};
  for (const r of v.factCheckResults || []) {
    for (const rev of r.reviews || []) {
      if (rev.url) urls.push({ publisher: (rev.publisher && rev.publisher.name) || rev.publisherName || null, rating: rev.textualRating || rev.rating || null, url: rev.url });
    }
  }
  // evidenceItems is returned as a single normalized-evidence object for the
  // primary claim (not always an array) — handle both shapes.
  const evGroups = Array.isArray(v.evidenceItems)
    ? v.evidenceItems
    : v.evidenceItems && v.evidenceItems.evidenceItems
      ? [v.evidenceItems]
      : [];
  for (const e of evGroups) {
    for (const it of e.evidenceItems || []) {
      if (it.url) urls.push({ source: it.source || it.sourceType || null, verdict: it.verdict || null, url: it.url });
    }
  }
  return urls;
}

// ─── Main ────────────────────────────────────────────────────────────

const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(`${new Date().toISOString()} ${msg}`);
}

async function main() {
  // 1. Auth
  const login = await api('POST', '/api/v1/auth/login-local', { identifier: EMAIL, password: PASSWORD });
  if (login.status !== 200 || !login.body || !login.body.token) {
    log(`FATAL: login failed (${login.status}) ${JSON.stringify(login.body).slice(0, 300)}`);
    process.exit(1);
  }
  const token = login.body.token;
  log(`Auth OK (login ${login.status})`);

  const raw = { startedAt: new Date().toISOString(), posts: [] };
  const summary = [];

  for (const item of CORPUS) {
    log(`\n=== ${item.id} (${item.category}) ===`);
    const rec = { id: item.id, category: item.category, text: item.text, contentType: item.contentType || 'text' };

    try {
      // 2. Create post
      const createBody = { text: item.text, postType: 'standard' };
      if (item.contentType) createBody.contentType = item.contentType;
      if (item.media) createBody.media = item.media;
      const created = await api('POST', '/api/v1/posts', createBody, token);
      rec.create = { status: created.status, postId: created.body && created.body.post && created.body.post._id, message: created.body && created.body.message };
      log(`  create: ${created.status} postId=${rec.create.postId || 'NONE'}`);

      if (!rec.create.postId) {
        rec.error = 'post creation failed';
        raw.posts.push(rec);
        summary.push({ id: item.id, category: item.category, error: 'create failed', createStatus: created.status, createMessage: rec.create.message });
        fs.writeFileSync(path.join(OUT_DIR, 'live20-raw.json'), JSON.stringify(raw, null, 2));
        continue;
      }
      const postId = rec.create.postId;

      // 3. Wait for the background pipeline (the app's automatic flow)
      const pipe = await waitForPipeline(token, postId);
      rec.pipeline = {
        status: pipe && pipe.body && pipe.body.pipeline ? pipe.body.pipeline.status : 'NO_PIPELINE_RESPONSE',
        httpStatus: pipe ? pipe.status : 0,
        stages: pipe && pipe.body && pipe.body.pipeline && pipe.body.pipeline.stages
          ? pipe.body.pipeline.stages.map((s) => ({ stage: s.stage, status: s.status, error: s.error, durationMs: s.durationMs }))
          : null,
      };
      log(`  pipeline: ${rec.pipeline.status}`);

      // 4. Trust score computed by the background pipeline (captured before verify)
      const pipeTrust = await api('GET', `/api/trust-score/${postId}`, null, token);
      const pipeTs = pipeTrust.body && pipeTrust.body.trustScore;
      rec.pipelineTrust = pipeTs
        ? { score: pipeTs.score, label: pipeTs.label, analyzedAt: pipeTs.analyzedAt }
        : { httpStatus: pipeTrust.status, none: true };
      log(`  pipeline trust: ${rec.pipelineTrust.none ? 'none' : `${rec.pipelineTrust.score} → ${rec.pipelineTrust.label}`}`);

      // 5. Explicit verification API (the real verification endpoint)
      const verify = await api('POST', `/api/v1/pipeline/verify/${postId}`, {}, token);
      rec.verify = { httpStatus: verify.status, response: verify.body };
      const v = (verify.body && verify.body.verification) || {};
      log(`  verify: ${verify.status} provider=${v.providerUsed}/${v.providerStatus} trust=${v.trustScoreResult ? `${v.trustScoreResult.trustScore}→${v.trustScoreResult.label}` : 'NONE'}`);

      // settle
      await sleep(800);

      // 6. Final persisted reads (what the feed / frontend will render)
      const getPost = await api('GET', `/api/v1/posts/${postId}`, null, token);
      const post = (getPost.body && getPost.body.post) || null;
      const getTrust = await api('GET', `/api/trust-score/${postId}`, null, token);
      const trustDoc = (getTrust.body && getTrust.body.trustScore) || null;

      rec.final = {
        postHttp: getPost.status,
        trustHttp: getTrust.status,
        postTrustBadge: post ? post.trustBadge : null,
        postTrustScore: post ? post.trustScore : null,
        postVerificationStatus: post ? post.verificationStatus : null,
        postTrustScoreDetail: post ? post.trustScoreDetail || null : null,
        persistedLabel: trustDoc ? trustDoc.label : null,
        persistedScore: trustDoc ? trustDoc.score : null,
        persistedComponents: trustDoc
          ? { authenticity: trustDoc.authenticity, factualVerification: trustDoc.factualVerification, sourceCredibility: trustDoc.sourceCredibility, modelConfidence: trustDoc.modelConfidence }
          : null,
        factCheckData: trustDoc ? trustDoc.factCheckData || null : null,
        persistedExplanation: trustDoc ? trustDoc.explanation : null,
        isOverrideApplied: trustDoc ? trustDoc.isOverrideApplied : null,
        ruleVersion: trustDoc ? trustDoc.ruleVersion : null,
      };
      log(`  final persisted: ${rec.final.persistedLabel} (${rec.final.persistedScore}) | feed badge: ${rec.final.postTrustBadge}`);

      // Flat summary row (the 20-row table source)
      const factResults = v.factCheckResults || [];
      summary.push({
        id: item.id,
        category: item.category,
        postId,
        text: item.text,
        contentType: rec.contentType,
        pipelineStatus: rec.pipeline.status,
        pipelineTrustScore: rec.pipelineTrust.none ? null : rec.pipelineTrust.score,
        pipelineLabel: rec.pipelineTrust.none ? null : rec.pipelineTrust.label,
        extractedClaims: (v.claims || []).map((c) => c.text),
        apiOutcome: {
          httpStatus: verify.status,
          providerUsed: v.providerUsed || null,
          providerStatus: v.providerStatus || null,
          verificationStatus: v.verificationStatus || null,
          factCheckStatuses: factResults.map((r) => ({ claimText: r.claimText, status: r.status, source: r.source, apiError: r.apiError, errorCode: r.errorCode })),
          aggregateStatus: rec.final.factCheckData ? rec.final.factCheckData.aggregateStatus : null,
        },
        evidenceUrls: pickEvidenceUrls(verify.body),
        trustScore: v.trustScoreResult ? v.trustScoreResult.trustScore : null,
        backendLabel: v.trustScoreResult ? v.trustScoreResult.label : null,
        components: v.trustScoreResult ? v.trustScoreResult.componentScores : null,
        persistedLabel: rec.final.persistedLabel,
        persistedScore: rec.final.persistedScore,
        feedBadge: rec.final.postTrustBadge,
        isOverrideApplied: rec.final.isOverrideApplied,
      });
    } catch (err) {
      log(`  ERROR ${item.id}: ${err.message}`);
      rec.error = err.message;
      summary.push({ id: item.id, category: item.category, error: err.message });
    }

    raw.posts.push(rec);
    fs.writeFileSync(path.join(OUT_DIR, 'live20-raw.json'), JSON.stringify(raw, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'live20-summary.json'), JSON.stringify(summary, null, 2));
  }

  raw.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'live20-raw.json'), JSON.stringify(raw, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'live20-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'live20-run.log'), logLines.join('\n'));

  log(`\nDONE. ${summary.length} rows → live-results/live20-summary.json`);
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
