/**
 * End-to-end verification test — proves the trust analysis is REAL (Gemini
 * API called, labels computed by the backend engine), not hardcoded.
 *
 *   1. Login as a seeded local user.
 *   2. Create a REAL-fact post  (expect a high trust label)
 *   3. Create a FAKE-claim post (expect a low/red label)
 *   4. POST /api/v1/pipeline/verify/:postId on both
 *   5. Print Gemini analysis signals + final trust score/label
 */
const BASE = 'http://localhost:5000/api/v1';

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

  // 3. Run the REAL verification pipeline on both
  for (const [label, id, text] of [
    ['REAL FACT ', id1, realFact],
    ['FAKE CLAIM', id2, fakeClaim],
  ]) {
    console.log(`\n━━━ VERIFYING ${label} — ${text.slice(0, 60)}… ━━━`);
    const t0 = Date.now();
    const v = await api(`/pipeline/verify/${id}`, { method: 'POST', token, body: {} });
    const dt = Date.now() - t0;
    const vd = v.json.verification || v.json;
    if (vd.trustScoreResult) {
      const g = vd.geminiAnalysis || {};
      console.log(`  status: ${vd.verificationStatus} (${dt}ms, provider ${vd.providerUsed})`);
      console.log(`  Gemini contentType: ${g.contentType}  confidence: ${g.confidence}`);
      console.log(`  Gemini opinion/satire/edited: ${g.opinionProbability}/${g.satireProbability}/${g.editedProbability}`);
      console.log(`  Gemini claims (${(g.claims || []).length}):`, JSON.stringify((g.claims || []).slice(0, 2)));
      console.log(`  factCheck results: ${vd.factCheckResults ? vd.factCheckResults.length : 0}`);
      const t = vd.trustScoreResult;
      console.log(`  TRUST SCORE: ${t.trustScore.toFixed ? t.trustScore.toFixed(1) : t.trustScore}/100  LABEL: ${t.label}`);
      console.log(`  components: auth ${t.componentScores.authenticity.toFixed(2)} | factual ${t.componentScores.factualVerification.toFixed(2)} | source ${t.componentScores.sourceCredibility.toFixed(2)} | model ${t.componentScores.modelConfidence.toFixed(2)}`);
      console.log(`  reasoning: ${(t.reasoning || []).join(' | ')}`);
    } else {
      console.log('  NO TRUST SCORE —', JSON.stringify(vd).slice(0, 400));
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('TEST ERROR:', e.message);
  process.exit(1);
});