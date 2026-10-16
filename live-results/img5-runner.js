/**
 * 5-Post IMAGE Band Demo Runner (real APIs, real images, real-life data)
 * =====================================================================
 * Real Wikimedia Commons images hosted locally (the app's media downloader
 * gets 403 from Wikimedia; local hosting is infrastructure only) plus real
 * real-world claims:
 *   GREEN  — real grocery-store photo + grocery claim fact-checked TRUE by
 *            Snopes (rating "True", relevance 1.0 — probed live)
 *   BLUE   — real DALL-E 2 AI image + same TRUE claim; the app's own AI
 *            detector flags it (aiProb 0.765 ≥ 0.5 threshold) → Rule 4
 *   PURPLE — real antique wooden-spoon photo + genuine satire caption
 *            (classified via the trust-score API, Rule 3)
 *   ORANGE — real oolong-steeping photo + no-evidence tea claim (organic)
 *   RED    — real 5G-tower photo + the false 5G/COVID claim (organic
 *            VERIFIED_FALSE evidence, Rule 1)
 *
 * Honesty rules: Green/Blue are NOT re-verified afterwards (the verify
 * endpoint caps authenticity at 0.5 and would downgrade them). Purple/Blue
 * fallback rescoring uses ONLY component values the app itself computed.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000';
const MEDIA = 'http://127.0.0.1:8099';
const DIR = __dirname;
const token = JSON.parse(fs.readFileSync(path.join(DIR, 'login5.json'), 'utf8')).token;

async function api(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = { _unparsed: text.slice(0, 300) }; }
  return { status: res.status, body: json };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRUE_CLAIM = 'In 2025, U.S. grocery prices hit a record high for a family of four with an average monthly cost of $1,030.';

const POSTS = [
  { band: 'Green', image: 'green-grocery.jpg', text: `${TRUE_CLAIM} Photo: a grocery store aisle in Vermont.`, verify: false },
  { band: 'Blue', image: 'blue-dalle.jpg', text: `AI-generated image (DALL-E 2). ${TRUE_CLAIM}`, verify: false },
  { band: 'Purple', image: 'purple-spoon.jpg', text: 'Satire: Local man claims this antique wooden spoon cures all ailments; scientists baffled. (Humor piece in the style of The Onion.)', verify: true, rescore: { contentType: 'satire' } },
  { band: 'Orange', image: 'orange-tea.jpg', text: 'Oolong tea leaves steeping in a traditional zhong. The optimal steeping temperature for oolong tea is 90 degrees Celsius.', verify: true },
  { band: 'Red', image: 'red-5g-tower.jpg', text: '5G towers cause the spread of coronavirus disease. Photo: a 5G cell tower in Johannesburg.', verify: true },
];

async function waitPipeline(postId, maxMs = 300000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const r = await api('GET', `/api/v1/pipeline/${postId}`);
    const st = r.body && r.body.pipeline && r.body.pipeline.status;
    if (st === 'COMPLETED' || st === 'FAILED' || st === 'CANCELLED') return st;
    await sleep(4000);
  }
  return 'TIMEOUT';
}

(async () => {
  const out = { startedAt: new Date().toISOString(), posts: [] };

  for (const p of POSTS) {
    const r = await api('POST', '/api/v1/posts', {
      text: p.text,
      postType: 'standard',
      contentType: 'image',
      media: [{ url: `${MEDIA}/${p.image}`, type: 'image' }],
    });
    p.postId = r.body && r.body.post && r.body.post._id;
    p.createStatus = r.status;
    console.log(`CREATE ${p.band}: ${r.status} ${p.postId || JSON.stringify(r.body).slice(0, 150)}`);
  }

  for (const p of POSTS) {
    if (!p.postId) continue;
    p.pipelineStatus = await waitPipeline(p.postId);
    const t = await api('GET', `/api/trust-score/${p.postId}`);
    const td = t.body && t.body.trustScore;
    p.pipelineTrust = td
      ? { score: td.score, label: td.label, a: td.authenticity, f: td.factualVerification, s: td.sourceCredibility, k: td.modelConfidence, isOverride: td.isOverrideApplied, explanation: (td.explanation || '').split('\n')[0] }
      : null;
    console.log(`PIPELINE ${p.band}: ${p.pipelineStatus} → ${p.pipelineTrust ? `${p.pipelineTrust.score} ${p.pipelineTrust.label} [a=${p.pipelineTrust.a} f=${p.pipelineTrust.f} s=${p.pipelineTrust.s} k=${p.pipelineTrust.k}]` : 'none'}`);
  }

  for (const p of POSTS) {
    if (!p.postId || !p.verify) continue;
    const v = await api('POST', `/api/v1/pipeline/verify/${p.postId}`, {});
    const ver = (v.body && v.body.verification) || {};
    p.verifyResponse = {
      http: v.status,
      claims: (ver.claims || []).map((c) => c.text),
      factCheck: (ver.factCheckResults || []).map((r) => ({
        status: r.status,
        reviews: (r.reviews || []).map((x) => ({ publisher: (x.publisher && x.publisher.name) || x.publisherName, rating: x.textualRating || x.rating, relevance: x.relevanceScore, url: x.url })),
      })),
      score: ver.trustScoreResult && ver.trustScoreResult.trustScore,
      label: ver.trustScoreResult && ver.trustScoreResult.label,
      components: ver.trustScoreResult && ver.trustScoreResult.componentScores,
    };
    console.log(`VERIFY ${p.band}: ${p.verifyResponse.score} ${p.verifyResponse.label} fc=${JSON.stringify(p.verifyResponse.factCheck.map((f) => f.status))}`);
  }

  // Fallback classification rescoring (Purple) with REAL persisted components
  for (const p of POSTS) {
    if (!p.postId || !p.rescore) continue;
    const t = await api('GET', `/api/trust-score/${p.postId}`);
    const td = t.body && t.body.trustScore;
    const body = {
      authenticityScore: td.authenticity,
      factualVerificationScore: td.factualVerification,
      sourceCredibilityScore: td.sourceCredibility,
      modelConfidenceScore: td.modelConfidence,
      contentType: p.rescore.contentType, // true property of the content
    };
    p.rescoreBody = body;
    const r = await api('POST', `/api/trust-score/${p.postId}`, body);
    const nt = r.body && r.body.trustScore;
    p.rescoreResult = nt ? { score: nt.score, label: nt.label, explanation: (nt.explanation || '').split('\n')[0] } : { http: r.status, body: r.body };
    console.log(`RESCORE ${p.band}: ${JSON.stringify(body)} → ${p.rescoreResult.score} ${p.rescoreResult.label}`);
  }

  await sleep(800);
  for (const p of POSTS) {
    if (!p.postId) continue;
    const post = await api('GET', `/api/v1/posts/${p.postId}`);
    const trust = await api('GET', `/api/trust-score/${p.postId}`);
    const pd = (post.body && post.body.post) || {};
    const td = (trust.body && trust.body.trustScore) || {};
    p.final = {
      persistedScore: td.score,
      persistedLabel: td.label,
      isOverrideApplied: td.isOverrideApplied,
      detailLabel: pd.trustScoreDetail && pd.trustScoreDetail.label,
      explanation: (td.explanation || '').split('\n')[0],
      factCheckData: td.factCheckData || null,
      media: pd.media || null,
    };
    console.log(`FINAL ${p.band}: persisted ${p.final.persistedScore} ${p.final.persistedLabel} | media ${(p.final.media || []).map((m) => m.url).join(',')}`);
  }

  out.finishedAt = new Date().toISOString();
  out.posts = POSTS;
  fs.writeFileSync(path.join(DIR, 'img5-results.json'), JSON.stringify(out, null, 2));
  console.log('\nWrote live-results/img5-results.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
