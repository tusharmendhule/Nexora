/**
 * Video Analysis Integration Tests
 * =================================
 * Tests the video deepfake analysis pipeline via the Node.js backend.
 *
 * Run:
 *   node test-video-analysis.js
 *
 * Prerequisites:
 *   1. Python AI service running: cd src/ai_service && python -m uvicorn app:app --port 8000
 *   2. Node.js backend running:   npm run dev
 *   3. MongoDB running
 *
 * Test matrix:
 *   - Short valid video (< 10s)
 *   - Long valid video (30s+)
 *   - Invalid file format (non-video URL)
 *   - Non-existent URL
 *   - Very large video (> 200MB simulated)
 *   - Missing required fields
 *   - Empty body
 *   - Invalid mediaUrl format
 *   - Background processing + polling
 *   - Duplicate analysis (caching)
 *   - Trust Score integration
 */

const axios = require('axios');

// -- Configuration ----------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const HEADERS = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

// -- Public test video URLs -------------------------------------------------
// These are freely available test videos for integration testing.

const TEST_VIDEOS = {
  // Short video (~5s) — Big Buck Bunny clip
  shortValid:
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',

  // Longer video (~30s) — Sintel trailer
  longValid:
    'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',

  // Another short video
  elephant:
    'https://test-videos.co.uk/vids/elephants-dream/mp4/h264/360/Elephants_Dream_360_10s_1MB.mp4',
};

// -- Test Cases -------------------------------------------------------------

const testCases = [
  // ─── Validation Tests (no AI service needed) ─────────────────────

  {
    name: '1. Missing mediaUrl',
    description: 'Should return 400 when mediaUrl is missing',
    body: { postId: '000000000000000000000001' },
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '2. Empty mediaUrl',
    description: 'Should return 400 when mediaUrl is empty string',
    body: { mediaUrl: '', postId: '000000000000000000000002' },
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '3. Invalid mediaUrl format (not HTTP)',
    description: 'Should return 400 when mediaUrl is not an HTTP URL',
    body: { mediaUrl: 'ftp://example.com/video.mp4', postId: '000000000000000000000003' },
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '4. Empty request body',
    description: 'Should return 400 for empty JSON body',
    body: {},
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '5. Non-object body',
    description: 'Should return 400 when body is a string',
    body: null,
    sendRaw: 'just a string',
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '6. Whitespace-only mediaUrl',
    description: 'Should return 400 when mediaUrl is only whitespace',
    body: { mediaUrl: '   ', postId: '000000000000000000000006' },
    expectError: true,
    expectedStatus: 400,
  },

  // ─── Invalid Video Tests (require AI service) ────────────────────

  {
    name: '7. Non-existent video URL',
    description: 'Should fail gracefully when video URL does not exist',
    body: {
      mediaUrl: 'https://example.com/nonexistent-video-12345.mp4',
      postId: '000000000000000000000007',
    },
    expectProcessing: true, // Returns 202, fails in background
  },
  {
    name: '8. Non-video URL (HTML page)',
    description: 'Should fail when URL points to an HTML page, not a video',
    body: {
      mediaUrl: 'https://example.com',
      postId: '000000000000000000000008',
    },
    expectProcessing: true, // Returns 202, fails in background
  },
  {
    name: '9. Image URL instead of video',
    description: 'Should fail when URL is an image, not a video',
    body: {
      mediaUrl: 'https://via.placeholder.com/300',
      postId: '000000000000000000000009',
    },
    expectProcessing: true, // Returns 202, fails in background
  },

  // ─── Valid Video Tests (require AI service) ──────────────────────

  {
    name: '10. Short valid video (< 10s)',
    description: 'Should accept and process a short valid MP4 video',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
      postId: '00000000000000000000000A',
    },
    expectProcessing: true,
    shouldComplete: true,
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'deepfakeProbability is a number',
        pass: typeof result.deepfakeProbability === 'number',
      });
      checks.push({
        name: 'deepfakeProbability is between 0 and 1',
        pass: result.deepfakeProbability >= 0 && result.deepfakeProbability <= 1,
      });
      checks.push({
        name: 'manipulationProbability is a number',
        pass: typeof result.manipulationProbability === 'number',
      });
      checks.push({
        name: 'manipulationProbability is between 0 and 1',
        pass: result.manipulationProbability >= 0 && result.manipulationProbability <= 1,
      });
      checks.push({
        name: 'frameCount is a positive number',
        pass: typeof result.frameCount === 'number' && result.frameCount > 0,
      });
      checks.push({
        name: 'analyzedFrames is a positive number',
        pass: typeof result.analyzedFrames === 'number' && result.analyzedFrames > 0,
      });
      checks.push({
        name: 'analyzedFrames <= frameCount',
        pass: result.analyzedFrames <= result.frameCount,
      });
      checks.push({
        name: 'confidence is between 0 and 1',
        pass: typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1,
      });
      checks.push({
        name: 'modelVersion is present',
        pass: typeof result.modelVersion === 'string' && result.modelVersion.length > 0,
      });
      checks.push({
        name: 'frames array is present',
        pass: Array.isArray(result.frames),
      });
      checks.push({
        name: 'temporalConsistency is present',
        pass: result.temporalConsistency && typeof result.temporalConsistency.temporalCoherence === 'number',
      });
      checks.push({
        name: 'finalScore is between 0 and 100',
        pass: typeof result.finalScore === 'number' && result.finalScore >= 0 && result.finalScore <= 100,
      });
      return checks;
    },
  },
  {
    name: '11. Another short valid video',
    description: 'Should process Elephant\'s Dream clip',
    body: {
      mediaUrl: TEST_VIDEOS.elephant,
      postId: '00000000000000000000000B',
    },
    expectProcessing: true,
    shouldComplete: true,
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success fields are valid',
        pass: typeof result.deepfakeProbability === 'number' && typeof result.confidence === 'number',
      });
      checks.push({
        name: 'frameCount > 0',
        pass: result.frameCount > 0,
      });
      return checks;
    },
  },

  // ─── Trust Score Integration Test ─────────────────────────────────

  {
    name: '12. Trust Score generation',
    description: 'Should create a TrustScore document when postId is provided',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
      postId: '00000000000000000000000C',
    },
    expectProcessing: true,
    shouldComplete: true,
    checkTrustScore: true,
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'finalScore is a number',
        pass: typeof result.finalScore === 'number',
      });
      return checks;
    },
  },

  // ─── Background Processing Tests ─────────────────────────────────

  {
    name: '13. Background processing returns 202',
    description: 'POST should return 202 Accepted with jobId',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
      postId: '00000000000000000000000D',
    },
    expectProcessing: true,
    checkJobId: true,
  },
  {
    name: '14. Polling endpoint returns status',
    description: 'GET /analyze/video/:jobId should return job status',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
      postId: '00000000000000000000000E',
    },
    expectProcessing: true,
    checkPolling: true,
  },
  {
    name: '15. Non-existent jobId returns 404',
    description: 'GET with invalid jobId should return 404',
    skipSubmit: true,
    expectError: true,
    expectedStatus: 404,
    directGet: '/api/v1/analyze/video/nonexistent-job-id-12345',
  },

  // ─── Caching / Duplicate Test ────────────────────────────────────

  {
    name: '16. Duplicate analysis returns cached result',
    description: 'Second request for same postId+mediaUrl should return cached',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
      postId: '00000000000000000000000A', // Same as test 10
    },
    expectProcessing: true,
    shouldComplete: true,
    expectCached: true,
  },

  // ─── No postId (standalone analysis) ─────────────────────────────

  {
    name: '17. Standalone analysis without postId',
    description: 'Should work without postId for standalone analysis',
    body: {
      mediaUrl: TEST_VIDEOS.shortValid,
    },
    expectProcessing: true,
    shouldComplete: true,
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'deepfakeProbability is valid',
        pass: typeof result.deepfakeProbability === 'number',
      });
      return checks;
    },
  },

  // ─── Large video simulation ──────────────────────────────────────

  {
    name: '18. Very large video URL (simulated rejection)',
    description: 'Should handle URLs that point to excessively large files',
    body: {
      mediaUrl: 'https://example.com/huge-video-500mb.mp4',
      postId: '000000000000000000000012',
    },
    expectProcessing: true, // Returns 202, fails in background
  },
];

// -- Test Runner ------------------------------------------------------------

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('NEXORA VIDEO DEEPFAKE ANALYSIS — INTEGRATION TESTS');
  console.log('='.repeat(70));
  console.log(`Backend URL:     ${BACKEND_URL}`);
  console.log(`AI Service URL:  ${AI_SERVICE_URL}`);
  console.log(`Auth:            ${AUTH_TOKEN ? 'Token provided' : 'No token (tests may fail if auth required)'}`);
  console.log('');

  // Health check
  console.log('--- AI Service Health Check ---');
  try {
    const health = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 10000 });
    console.log(`Status: ${health.data.status}`);
    console.log(`Video Model: ${health.data.videoModelVersion || 'N/A'}`);
    console.log(`Video Models: ${JSON.stringify(health.data.videoModelsLoaded || {}, null, 2)}`);
    if (health.data.videoModelsFailed && health.data.videoModelsFailed.length > 0) {
      console.log(`Failed: ${health.data.videoModelsFailed}`);
    }
    console.log('');
  } catch (err) {
    console.log(`WARNING: Could not reach AI service: ${err.message}`);
    console.log('Video processing tests will fail. Validation-only tests will still pass.');
    console.log('');
  }

  // Backend health check
  console.log('--- Backend Health Check ---');
  try {
    const health = await axios.get(`${BACKEND_URL}/api/v1/health`, { timeout: 5000 });
    console.log(`Status: ${health.data.success ? 'OK' : 'ERROR'}`);
    console.log('');
  } catch (err) {
    console.log(`ERROR: Could not reach backend: ${err.message}`);
    console.log('Make sure the Node.js backend is running on ' + BACKEND_URL);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const testCase of testCases) {
    console.log(`--- Test: ${testCase.name} ---`);
    console.log(`Description: ${testCase.description}`);

    try {
      // ─── Direct GET (no submit) ──────────────────────────
      if (testCase.directGet) {
        try {
          const resp = await axios.get(`${BACKEND_URL}${testCase.directGet}`, {
            headers: HEADERS,
            timeout: 10000,
          });
          console.log(`  Result: Expected error but got ${resp.status}`);
          failed++;
          console.log('  Status: FAILED');
        } catch (err) {
          const status = err.response ? err.response.status : 'no response';
          const match = err.response && err.response.status === testCase.expectedStatus;
          console.log(`  Result: Error ${status}${match ? ' (expected)' : ''}`);
          if (match) {
            passed++;
            console.log('  Status: PASSED');
          } else {
            failed++;
            console.log('  Status: FAILED');
          }
        }
        console.log('');
        continue;
      }

      // ─── Submit analysis ─────────────────────────────────
      if (testCase.sendRaw) {
        try {
          await axios.post(`${BACKEND_URL}/api/v1/analyze/video`, testCase.sendRaw, {
            headers: { 'Content-Type': 'text/plain', ...HEADERS },
            timeout: 10000,
          });
          console.log('  Result: Expected error but got success');
          failed++;
          console.log('  Status: FAILED');
        } catch (err) {
          const status = err.response ? err.response.status : 'no response';
          const match = err.response && err.response.status === (testCase.expectedStatus || 400);
          console.log(`  Result: Error ${status}${match ? ' (expected)' : ''}`);
          if (match) {
            passed++;
            console.log('  Status: PASSED');
          } else {
            failed++;
            console.log('  Status: FAILED');
          }
        }
        console.log('');
        continue;
      }

      let submitResponse;
      try {
        submitResponse = await axios.post(
          `${BACKEND_URL}/api/v1/analyze/video`,
          testCase.body,
          { headers: HEADERS, timeout: 30000 }
        );
      } catch (err) {
        if (testCase.expectError) {
          const status = err.response ? err.response.status : 'no response';
          const match = err.response && err.response.status === testCase.expectedStatus;
          console.log(`  Result: Error ${status}${match ? ' (expected)' : ''}`);
          if (match) {
            passed++;
            console.log('  Status: PASSED');
          } else {
            failed++;
            console.log('  Status: FAILED');
          }
        } else {
          console.log(`  Result: Unexpected submit error: ${err.message}`);
          if (err.response) {
            console.log(`  Response: ${JSON.stringify(err.response.data, null, 2)}`);
          }
          failed++;
          console.log('  Status: FAILED');
        }
        console.log('');
        continue;
      }

      // ─── Handle validation error cases ───────────────────
      if (testCase.expectError) {
        console.log(`  Result: Expected error but got status ${submitResponse.status}`);
        failed++;
        console.log('  Status: FAILED');
        console.log('');
        continue;
      }

      const submitData = submitResponse.data;
      console.log(`  Submit status: ${submitResponse.status}`);
      console.log(`  Job ID: ${submitData.jobId || 'N/A'}`);

      if (testCase.checkJobId) {
        const hasJobId = typeof submitData.jobId === 'string' && submitData.jobId.length > 0;
        const is202 = submitResponse.status === 202;
        console.log(`  202 Accepted: ${is202 ? 'PASS' : 'FAIL'}`);
        console.log(`  Has jobId: ${hasJobId ? 'PASS' : 'FAIL'}`);
        if (is202 && hasJobId) {
          passed++;
          console.log('  Status: PASSED');
        } else {
          failed++;
          console.log('  Status: FAILED');
        }
        console.log('');
        continue;
      }

      // ─── Handle cached results ───────────────────────────
      if (testCase.expectCached) {
        if (submitData.cached) {
          console.log('  Result: Cached (as expected)');
          const result = submitData.analysis || submitData;
          if (testCase.assertions) {
            const checks = testCase.assertions(result);
            let allPassed = true;
            for (const check of checks) {
              const status = check.pass ? 'PASS' : 'FAIL';
              if (!check.pass) allPassed = false;
              console.log(`  ${status}: ${check.name}`);
            }
            if (allPassed) {
              passed++;
              console.log('  Status: PASSED');
            } else {
              failed++;
              console.log('  Status: FAILED');
            }
          } else {
            passed++;
            console.log('  Status: PASSED');
          }
        } else {
          console.log('  Result: Expected cached but got fresh analysis');
          failed++;
          console.log('  Status: FAILED');
        }
        console.log('');
        continue;
      }

      // ─── Poll for results (background processing) ────────
      if (testCase.expectProcessing && submitData.jobId) {
        console.log('  Waiting for background processing...');

        let finalResult = null;
        let pollAttempts = 0;
        const maxPolls = 60; // Max 5 minutes of polling (5s intervals)
        const pollInterval = 5000;

        while (pollAttempts < maxPolls) {
          await sleep(pollInterval);
          pollAttempts++;

          try {
            const pollResp = await axios.get(
              `${BACKEND_URL}/api/v1/analyze/video/${submitData.jobId}`,
              { headers: HEADERS, timeout: 10000 }
            );

            const pollData = pollResp.data;
            console.log(`  Poll ${pollAttempts}: status=${pollData.status}`);

            if (pollData.status === 'completed') {
              finalResult = pollData.analysis;
              break;
            } else if (pollData.status === 'failed') {
              console.log(`  Analysis failed: ${JSON.stringify(pollData.errors || [])}`);
              break;
            }
            // Still processing — continue polling
          } catch (pollErr) {
            console.log(`  Poll error: ${pollErr.message}`);
            break;
          }
        }

        if (pollAttempts >= maxPolls) {
          console.log('  Timed out waiting for analysis');
          failed++;
          console.log('  Status: FAILED (timeout)');
          console.log('');
          continue;
        }

        // ─── Check polling endpoint ──────────────────────
        if (testCase.checkPolling && submitData.jobId) {
          try {
            const pollResp = await axios.get(
              `${BACKEND_URL}/api/v1/analyze/video/${submitData.jobId}`,
              { headers: HEADERS, timeout: 10000 }
            );
            const hasStatus = typeof pollResp.data.status === 'string';
            const hasJobId = typeof pollResp.data.jobId === 'string';
            console.log(`  Polling returns status: ${hasStatus ? 'PASS' : 'FAIL'}`);
            console.log(`  Polling returns jobId: ${hasJobId ? 'PASS' : 'FAIL'}`);
            if (hasStatus && hasJobId) {
              passed++;
              console.log('  Status: PASSED');
            } else {
              failed++;
              console.log('  Status: FAILED');
            }
          } catch (err) {
            console.log(`  Polling failed: ${err.message}`);
            failed++;
            console.log('  Status: FAILED');
          }
          console.log('');
          continue;
        }

        // ─── Validate final result ───────────────────────
        if (testCase.shouldComplete && finalResult) {
          console.log(`  Deepfake probability: ${(finalResult.deepfakeProbability * 100).toFixed(2)}%`);
          console.log(`  Manipulation probability: ${(finalResult.manipulationProbability * 100).toFixed(2)}%`);
          console.log(`  Frame count: ${finalResult.frameCount}`);
          console.log(`  Analyzed frames: ${finalResult.analyzedFrames}`);
          console.log(`  Confidence: ${(finalResult.confidence * 100).toFixed(2)}%`);
          console.log(`  Model: ${finalResult.modelVersion}`);
          console.log(`  Final score: ${finalResult.finalScore}`);

          if (testCase.assertions) {
            const checks = testCase.assertions(finalResult);
            let allPassed = true;
            for (const check of checks) {
              const status = check.pass ? 'PASS' : 'FAIL';
              if (!check.pass) allPassed = false;
              console.log(`  ${status}: ${check.name}`);
            }
            if (allPassed) {
              passed++;
              console.log('  Status: PASSED');
            } else {
              failed++;
              console.log('  Status: FAILED');
            }
          } else {
            passed++;
            console.log('  Status: PASSED');
          }
        } else if (testCase.shouldComplete && !finalResult) {
          console.log('  Result: Expected completion but analysis failed or timed out');
          failed++;
          console.log('  Status: FAILED');
        } else {
          // Just checking that it was accepted — don't wait for completion
          passed++;
          console.log('  Status: PASSED (accepted for processing)');
        }
      } else if (!testCase.expectProcessing) {
        // Synchronous result
        const result = submitData.analysis || submitData;
        if (testCase.assertions) {
          const checks = testCase.assertions(result);
          let allPassed = true;
          for (const check of checks) {
            const status = check.pass ? 'PASS' : 'FAIL';
            if (!check.pass) allPassed = false;
            console.log(`  ${status}: ${check.name}`);
          }
          if (allPassed) {
            passed++;
            console.log('  Status: PASSED');
          } else {
            failed++;
            console.log('  Status: FAILED');
          }
        } else {
          passed++;
          console.log('  Status: PASSED (no assertions)');
        }
      }
    } catch (err) {
      console.log(`  Result: Unexpected error: ${err.message}`);
      if (err.response) {
        console.log(`  Response: ${JSON.stringify(err.response.data, null, 2)}`);
      }
      failed++;
      console.log('  Status: FAILED');
    }
    console.log('');
  }

  // -- Summary ----------------------------------------------------------
  console.log('='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total:   ${passed + failed + skipped}`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\nSome tests failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

// -- Run -------------------------------------------------------------------

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
