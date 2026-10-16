/**
 * Rebuild the 20-row summary from live20-raw.json:
 *  - fixes evidence extraction (verify.evidenceItems can be an object)
 *  - re-reads CURRENT persisted state (some posts were re-scored by the
 *    classification-aware trust-score API for F1/F2/E2 band demos)
 *  - writes live20-summary.json + live20-table.md
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000';
const DIR = __dirname;
const token = fs.readFileSync(path.join(DIR, 'token.txt'), 'utf8').trim();
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'live20-raw.json'), 'utf8'));

async function get(urlPath) {
  const res = await fetch(`${BASE}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function evidenceUrls(verifyBody) {
  const v = (verifyBody && verifyBody.verification) || verifyBody || {};
  const urls = [];
  for (const r of v.factCheckResults || []) {
    for (const rev of r.reviews || []) {
      if (rev.url) urls.push({ publisher: (rev.publisher && rev.publisher.name) || rev.publisherName || null, rating: rev.textualRating || rev.rating || null, relevance: rev.relevanceScore ?? null, url: rev.url });
    }
  }
  const ev = v.evidenceItems;
  const groups = Array.isArray(ev) ? ev : ev && ev.evidenceItems ? [ev] : [];
  for (const g of groups) {
    for (const it of g.evidenceItems || []) {
      if (it.url) urls.push({ source: it.source || it.sourceType || null, verdict: it.verdict || null, url: it.url });
    }
  }
  // dedupe by url
  const seen = new Set();
  return urls.filter((u) => (seen.has(u.url) ? false : (seen.add(u.url), true)));
}

// Post-hoc classification-aware rescoring applied AFTER the main run
// (real API calls; recorded here for transparency)
const DEMO_OVERLAY = {};
for (const f of ['demo-purple-f1', 'demo-purple-f2', 'demo-ai-e2']) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `${f}.json`), 'utf8'));
  const postId = j.trustScore && j.trustScore.post;
  DEMO_OVERLAY[String(postId)] = f;
}

(async () => {
  const rows = [];
  for (const p of raw.posts) {
    const postId = p.create && p.create.postId;
    const v = (p.verify && p.verify.response && p.verify.response.verification) || {};
    const postRes = await get(`/api/v1/posts/${postId}`);
    const trustRes = await get(`/api/trust-score/${postId}`);
    const post = postRes.body.post || {};
    const td = trustRes.body.trustScore || {};
    rows.push({
      id: p.id,
      category: p.category,
      postId,
      text: p.text,
      contentType: p.contentType || 'text',
      pipelineStatus: p.pipeline && p.pipeline.status,
      pipelineTrust: p.pipelineTrust && p.pipelineTrust.none ? null : { score: p.pipelineTrust && p.pipelineTrust.score, label: p.pipelineTrust && p.pipelineTrust.label },
      claims: (v.claims || []).map((c) => c.text),
      apiOutcome: {
        http: p.verify && p.verify.httpStatus,
        providerUsed: v.providerUsed || null,
        providerStatus: v.providerStatus || null,
        verificationStatus: v.verificationStatus || null,
        factCheck: ((v.factCheckResults || []).map((r) => ({ claimText: r.claimText, status: r.status, source: r.source, apiError: r.apiError || null }))),
        persistedAggregateStatus: td.factCheckData ? td.factCheckData.aggregateStatus : null,
      },
      evidenceUrls: evidenceUrls(p.verify && p.verify.response),
      verifyTrustScore: v.trustScoreResult ? v.trustScoreResult.trustScore : null,
      verifyLabel: v.trustScoreResult ? v.trustScoreResult.label : null,
      verifyComponents: v.trustScoreResult ? v.trustScoreResult.componentScores : null,
      persistedScore: td.score != null ? td.score : null,
      persistedLabel: td.label || null,
      persistedIsOverride: td.isOverrideApplied != null ? td.isOverrideApplied : null,
      feedBadge: post.trustBadge || null,
      postVerificationStatus: post.verificationStatus || null,
      demoRescore: DEMO_OVERLAY[String(postId)] || null,
    });
  }
  fs.writeFileSync(path.join(DIR, 'live20-summary.json'), JSON.stringify(rows, null, 2));

  const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const lines = [];
  lines.push('| # | Cat | postId | Claims extracted | FC status (verify) | Evidence URL(s) | Verify score→label | Pipeline score→label | Persisted score→label | Feed badge | Rescored |');
  lines.push('|---|-----|--------|------------------|--------------------|-----------------|--------------------|----------------------|------------------------|------------|----------|');
  rows.forEach((r, i) => {
    const fcst = r.apiOutcome.factCheck.map((f) => f.status + (f.apiError ? `(${f.apiError})` : '')).join('; ') || '(no fact-check: no claims)';
    const ev = r.evidenceUrls.map((e) => e.url).join('<br>') || '—';
    const pt = r.pipelineTrust ? `${r.pipelineTrust.score} ${r.pipelineTrust.label}` : '—';
    lines.push(`| ${i + 1} | ${esc(r.category)} | \`${r.postId}\` | ${esc(short(r.claims.join(' / ') || '(none)', 70))} | ${esc(fcst)} | ${esc(short(ev, 120))} | ${r.verifyTrustScore} ${r.verifyLabel} | ${pt} | ${r.persistedScore} ${r.persistedLabel} | ${r.feedBadge} | ${r.demoRescore || '—'} |`);
  });
  fs.writeFileSync(path.join(DIR, 'live20-table.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\n${rows.length} rows written to live-results/live20-summary.json and live20-table.md`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
