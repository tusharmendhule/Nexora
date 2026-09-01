/**
 * Nexora API v1 — Endpoint Test Script
 *
 * Tests all required endpoints against a running server.
 * Run: node test-endpoints.js
 * Server must be running on port 5000.
 */

const http = require('http');

const BASE = 'http://localhost:5000';

let passed = 0;
let failed = 0;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} — ${detail || 'FAILED'}`);
  }
}

async function run() {
  console.log('\n🧪 NEXORA API v1 — ENDPOINT TESTS\n');

  let token;
  let postId;
  let commentId;
  let userId;

  // ─── 1. Health Check ──────────────────────────────
  console.log('📋 Health Check');
  const health = await request('GET', '/api/v1/health');
  assert('GET /api/v1/health → 200', health.status === 200);
  assert('Response has success: true', health.body?.success === true);
  assert('Response has version: v1', health.body?.version === 'v1');
  assert('Response has timestamp', !!health.body?.timestamp);

  // ─── 2. Register ──────────────────────────────────
  console.log('\n📋 Auth — Register');
  const reg = await request('POST', '/api/v1/auth/register', {
    name: 'Test User',
    username: 'testuser_v1',
    email: 'testv1@nexora.com',
    password: 'password123',
  });
  assert('POST /api/v1/auth/register → 201', reg.status === 201);
  assert('Response has token', !!reg.body?.token);
  assert('Response has user object', !!reg.body?.user?._id);
  token = reg.body?.token;
  userId = reg.body?.user?._id;

  // ─── 3. Register validation ────────────────────────
  console.log('\n📋 Auth — Validation');
  const regBad = await request('POST', '/api/v1/auth/register', {
    name: 'Bad',
  });
  assert('Missing fields → 400', regBad.status === 400);

  // ─── 4. Duplicate register ─────────────────────────
  console.log('\n📋 Auth — Duplicate');
  const regDup = await request('POST', '/api/v1/auth/register', {
    name: 'Test User',
    username: 'testuser_v1',
    email: 'testv1@nexora.com',
    password: 'password123',
  });
  assert('Duplicate username → 409', regDup.status === 409);

  // ─── 5. Login ──────────────────────────────────────
  console.log('\n📋 Auth — Login');
  const login = await request('POST', '/api/v1/auth/login', {
    identifier: 'testuser_v1',
    password: 'password123',
  });
  assert('POST /api/v1/auth/login → 200', login.status === 200);
  assert('Login returns token', !!login.body?.token);
  token = login.body?.token;

  // ─── 6. Login wrong password ───────────────────────
  console.log('\n📋 Auth — Wrong Password');
  const loginBad = await request('POST', '/api/v1/auth/login', {
    identifier: 'testuser_v1',
    password: 'wrong',
  });
  assert('Wrong password → 401', loginBad.status === 401);

  // ─── 7. Get Me ─────────────────────────────────────
  console.log('\n📋 Auth — Get Me');
  const me = await request('GET', '/api/v1/auth/me', null, token);
  assert('GET /api/v1/auth/me → 200', me.status === 200);
  assert('Returns user object', !!me.body?.user?._id);
  assert('No password in response', !me.body?.user?.password);

  // ─── 8. Get Me without token ───────────────────────
  console.log('\n📋 Auth — Unauthorized');
  const noAuth = await request('GET', '/api/v1/auth/me');
  assert('No token → 401', noAuth.status === 401);

  // ─── 9. Users — Get Me ─────────────────────────────
  console.log('\n📋 Users — Get Me');
  const userMe = await request('GET', '/api/v1/users/me', null, token);
  assert('GET /api/v1/users/me → 200', userMe.status === 200);
  assert('Returns user data', !!userMe.body?.user?.username);

  // ─── 10. Users — Update Me ─────────────────────────
  console.log('\n📋 Users — Update Me');
  const updateMe = await request('PATCH', '/api/v1/users/me', { bio: 'Updated via API' }, token);
  assert('PATCH /api/v1/users/me → 200', updateMe.status === 200);
  assert('Bio updated', updateMe.body?.user?.bio === 'Updated via API');

  // ─── 11. Users — Get by ID ─────────────────────────
  console.log('\n📋 Users — Get by ID');
  const getUser = await request('GET', `/api/v1/users/${userId}`, null, token);
  assert('GET /api/v1/users/:id → 200', getUser.status === 200);
  assert('Returns correct user', getUser.body?.user?._id === userId);

  // ─── 12. Users — Invalid ID ────────────────────────
  console.log('\n📋 Users — Invalid ID');
  const badId = await request('GET', '/api/v1/users/invalid-id', null, token);
  assert('Invalid ObjectId → 400', badId.status === 400);

  // ─── 12b. Users — Update Profile (full fields) ──────
  console.log('\n📋 Users — Update Profile (full fields)');
  const updateProfile = await request('PATCH', '/api/v1/users/me', {
    name: 'Updated Name',
    bio: 'Updated bio via test',
    website: 'https://nexora.dev',
  }, token);
  assert('PATCH /api/v1/users/me (full) → 200', updateProfile.status === 200);
  assert('Name updated', updateProfile.body?.user?.name === 'Updated Name');
  assert('Bio updated', updateProfile.body?.user?.bio === 'Updated bio via test');
  assert('Website updated', updateProfile.body?.user?.website === 'https://nexora.dev');
  assert('Timestamps present', !!updateProfile.body?.user?.createdAt);
  assert('isVerified field present', updateProfile.body?.user?.isVerified !== undefined);
  assert('reputationBadge present', !!updateProfile.body?.user?.reputationBadge);

  // ─── 12c. Users — Update Username ───────────────────
  console.log('\n📋 Users — Update Username');
  const updateUsername = await request('PATCH', '/api/v1/users/me', { username: 'renamed_user' }, token);
  assert('PATCH username → 200', updateUsername.status === 200);
  assert('Username changed', updateUsername.body?.user?.username === 'renamed_user');

  // ─── 12d. Users — Duplicate Username ────────────────
  console.log('\n📋 Users — Duplicate Username');
  const dupUsername = await request('PATCH', '/api/v1/users/me', { username: 'renamed_user' }, token);
  assert('Same username → 200 (no-op)', dupUsername.status === 200);

  // ─── 12e. Users — Unauthorized access ───────────────
  console.log('\n📋 Users — Unauthorized access');
  const unauthUser = await request('GET', '/api/v1/users/me');
  assert('No token → 401', unauthUser.status === 401);

  // ─── 13. Posts — Create ────────────────────────────
  console.log('\n📋 Posts — Create');
  const createPost = await request('POST', '/api/v1/posts', { text: 'Hello Nexora!' }, token);
  assert('POST /api/v1/posts → 201', createPost.status === 201);
  assert('Returns post object', !!createPost.body?.post?._id);
  assert('Post has text', createPost.body?.post?.text === 'Hello Nexora!');
  assert('Post has populated user', !!createPost.body?.post?.user?.username);
  postId = createPost.body?.post?._id;

  // ─── 14. Posts — Create validation ─────────────────
  console.log('\n📋 Posts — Create Validation');
  const emptyPost = await request('POST', '/api/v1/posts', {}, token);
  assert('Empty post → 400', emptyPost.status === 400);

  // ─── 15. Posts — Get All ───────────────────────────
  console.log('\n📋 Posts — Get All');
  const getPosts = await request('GET', '/api/v1/posts', null, token);
  assert('GET /api/v1/posts → 200', getPosts.status === 200);
  assert('Returns posts array', Array.isArray(getPosts.body?.posts));
  assert('Has pagination', !!getPosts.body?.pagination);
  assert('Posts count >= 1', getPosts.body?.posts?.length >= 1);

  // ─── 16. Posts — Get by ID ─────────────────────────
  console.log('\n📋 Posts — Get by ID');
  const getPost = await request('GET', `/api/v1/posts/${postId}`, null, token);
  assert('GET /api/v1/posts/:id → 200', getPost.status === 200);
  assert('Returns correct post', getPost.body?.post?._id === postId);

  // ─── 17. Posts — Update ────────────────────────────
  console.log('\n📋 Posts — Update');
  const updatePost = await request('PATCH', `/api/v1/posts/${postId}`, { text: 'Updated text!' }, token);
  assert('PATCH /api/v1/posts/:id → 200', updatePost.status === 200);
  assert('Text updated', updatePost.body?.post?.text === 'Updated text!');

  // ─── 18. Likes — Toggle On ─────────────────────────
  console.log('\n📋 Likes — Toggle On');
  const likeOn = await request('POST', `/api/v1/posts/${postId}/like`, null, token);
  assert('POST /api/v1/posts/:id/like → 200', likeOn.status === 200);
  assert('isLiked: true', likeOn.body?.isLiked === true);
  assert('likesCount incremented', likeOn.body?.likesCount >= 1);

  // ─── 19. Likes — Toggle Off ────────────────────────
  console.log('\n📋 Likes — Toggle Off');
  const likeOff = await request('POST', `/api/v1/posts/${postId}/like`, null, token);
  assert('Toggle again → 200', likeOff.status === 200);
  assert('isLiked: false', likeOff.body?.isLiked === false);

  // ─── 20. Likes — Explicit Remove ───────────────────
  console.log('\n📋 Likes — Explicit Remove');
  const likeRemove = await request('DELETE', `/api/v1/posts/${postId}/like`, null, token);
  assert('DELETE /api/v1/posts/:id/like → 200', likeRemove.status === 200);

  // ─── 21. Comments — Create ─────────────────────────
  console.log('\n📋 Comments — Create');
  const createComment = await request('POST', `/api/v1/posts/${postId}/comments`, { text: 'Great post!' }, token);
  assert('POST /api/v1/posts/:id/comments → 201', createComment.status === 201);
  assert('Returns comment object', !!createComment.body?.comment?._id);
  assert('Comment has text', createComment.body?.comment?.text === 'Great post!');
  commentId = createComment.body?.comment?._id;

  // ─── 22. Comments — Get All ────────────────────────
  console.log('\n📋 Comments — Get All');
  const getComments = await request('GET', `/api/v1/posts/${postId}/comments`, null, token);
  assert('GET /api/v1/posts/:id/comments → 200', getComments.status === 200);
  assert('Returns comments array', Array.isArray(getComments.body?.comments));
  assert('Comments count >= 1', getComments.body?.comments?.length >= 1);

  // ─── 23. Comments — Delete ─────────────────────────
  console.log('\n📋 Comments — Delete');
  const deleteComment = await request('DELETE', `/api/v1/comments/${commentId}`, null, token);
  assert('DELETE /api/v1/comments/:id → 200', deleteComment.status === 200);

  // ─── 24. Comments — Create with reply ──────────────
  console.log('\n📋 Comments — Create Reply');
  const parentComment = await request('POST', `/api/v1/posts/${postId}/comments`, { text: 'Parent comment' }, token);
  const parentId = parentComment.body?.comment?._id;
  const reply = await request('POST', `/api/v1/posts/${postId}/comments`, { text: 'Reply text', parentCommentId: parentId }, token);
  assert('Reply created → 201', reply.status === 201);
  assert('Reply has parentComment', reply.body?.comment?.parentComment === parentId);

  // Get comments with replies
  const commentsWithReplies = await request('GET', `/api/v1/posts/${postId}/comments`, null, token);
  const parent = commentsWithReplies.body?.comments?.find(c => c._id === parentId);
  assert('Parent has replies array', Array.isArray(parent?.replies));
  assert('Replies count >= 1', parent?.replies?.length >= 1);

  // Clean up parent comment (and its reply should be auto-deleted)
  await request('DELETE', `/api/v1/comments/${parentId}`, null, token);

  // ─── 25. Reports — Create ──────────────────────────
  console.log('\n📋 Reports — Create');
  const createReport = await request('POST', `/api/v1/posts/${postId}/report`, { reason: 'Suspicious content' }, token);
  assert('POST /api/v1/posts/:id/report → 201', createReport.status === 201);
  assert('Returns report object', !!createReport.body?.report?._id);

  // ─── 26. Reports — Duplicate ───────────────────────
  console.log('\n📋 Reports — Duplicate');
  const dupReport = await request('POST', `/api/v1/posts/${postId}/report`, { reason: 'Same user again' }, token);
  assert('Duplicate report → 409', dupReport.status === 409);

  // ─── 27. Reports — Get All ─────────────────────────
  console.log('\n📋 Reports — Get All');
  const getReports = await request('GET', '/api/v1/reports', null, token);
  assert('GET /api/v1/reports → 200', getReports.status === 200);
  assert('Returns reports array', Array.isArray(getReports.body?.reports));

  // ─── 28. Posts — Delete ────────────────────────────
  console.log('\n📋 Posts — Delete');
  const deletePost = await request('DELETE', `/api/v1/posts/${postId}`, null, token);
  assert('DELETE /api/v1/posts/:id → 200', deletePost.status === 200);

  // ─── 29. Posts — Get Deleted ───────────────────────
  console.log('\n📋 Posts — Get Deleted');
  const getDeleted = await request('GET', `/api/v1/posts/${postId}`, null, token);
  assert('Deleted post → 404', getDeleted.status === 404);

  // ─── 30. Posts — Unauthorized ──────────────────────
  console.log('\n📋 Posts — Unauthorized');
  const unauthPost = await request('GET', '/api/v1/posts');
  assert('No token → 401', unauthPost.status === 401);

  // ─── 31. 404 Route ─────────────────────────────────
  console.log('\n📋 404 Route');
  const notFound = await request('GET', '/api/v1/nonexistent');
  assert('Unknown route → 404', notFound.status === 404);

  // ─── Summary ───────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
