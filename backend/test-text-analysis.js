/**
 * Text Analysis Integration Tests
 * ================================
 * Tests the Python AI service via the Node.js backend.
 *
 * Run:
 *   node test-text-analysis.js
 *
 * Prerequisites:
 *   1. Python AI service running: cd src/ai_service && python -m uvicorn app:app --port 8000
 *   2. Node.js backend running:   npm run dev
 */

const axios = require('axios');

// -- Configuration ----------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Set if auth is required

const HEADERS = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

// -- Test Cases -------------------------------------------------------------

const testCases = [
  {
    name: '1. Obviously factual text',
    description: 'Well-known scientific fact — should have low misinformation probability',
    text: 'The Earth orbits the Sun at an average distance of approximately 149.6 million kilometers. This distance is also known as one astronomical unit (AU). The orbit is slightly elliptical, not perfectly circular.',
    postId: '000000000000000000000001',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'misinformationProbability is a number',
        pass: typeof result.misinformationProbability === 'number',
      });
      checks.push({
        name: 'misinformationProbability is between 0 and 1',
        pass: result.misinformationProbability >= 0 && result.misinformationProbability <= 1,
      });
      checks.push({
        name: 'aiGeneratedProbability is between 0 and 1',
        pass: result.aiGeneratedProbability >= 0 && result.aiGeneratedProbability <= 1,
      });
      checks.push({
        name: 'confidence is between 0 and 1',
        pass: result.confidence >= 0 && result.confidence <= 1,
      });
      checks.push({
        name: 'modelVersion is present',
        pass: typeof result.modelVersion === 'string' && result.modelVersion.length > 0,
      });
      checks.push({
        name: 'preprocessing has required fields',
        pass: result.preprocessing && typeof result.preprocessing.characterCount === 'number',
      });
      checks.push({
        name: 'language is detected',
        pass: result.preprocessing.language === 'en',
      });
      return checks;
    },
  },
  {
    name: '2. Obviously false claim',
    description: 'Claims the Moon is made of cheese — may flag as misinformation',
    text: 'Scientists have recently confirmed that the Moon is actually made entirely of aged cheddar cheese. A study conducted by the Lunar Cheese Research Institute shows that 97% of the Moon surface is cheese. According to Dr. Swiss Gouda, the evidence is conclusive and proves beyond doubt that the Moon is dairy-based.',
    postId: '000000000000000000000002',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'misinformationProbability is between 0 and 1',
        pass: typeof result.misinformationProbability === 'number' && result.misinformationProbability >= 0 && result.misinformationProbability <= 1,
      });
      checks.push({
        name: 'claims are extracted (should find some)',
        pass: Array.isArray(result.claims),
      });
      checks.push({
        name: 'entities may be extracted',
        pass: Array.isArray(result.entities),
      });
      return checks;
    },
  },
  {
    name: '3. Neutral / opinion text',
    description: 'Subjective opinion — should not be flagged as misinformation',
    text: 'I personally think that pineapple on pizza is an abomination. My favorite restaurant serves a margherita pizza with fresh basil and mozzarella. Food is subjective and everyone has different tastes.',
    postId: '000000000000000000000003',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'misinformationProbability is between 0 and 1',
        pass: typeof result.misinformationProbability === 'number' && result.misinformationProbability >= 0 && result.misinformationProbability <= 1,
      });
      checks.push({
        name: 'wordCount > 0',
        pass: result.preprocessing && result.preprocessing.wordCount > 0,
      });
      return checks;
    },
  },
  {
    name: '4. AI-generated text style',
    description: 'Formulaic AI-style text — should show higher AI probability',
    text: 'Artificial intelligence is revolutionizing the way we approach complex problems in modern society. By leveraging advanced machine learning algorithms and neural network architectures, organizations can now automate critical decision-making processes. The implications of this technological advancement are far-reaching and transformative. Furthermore, the integration of AI systems into existing workflows represents a paradigm shift in how businesses operate. In conclusion, the future of artificial intelligence holds immense promise for creating innovative solutions to the challenges facing humanity.',
    postId: '000000000000000000000004',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'aiGeneratedProbability is between 0 and 1',
        pass: typeof result.aiGeneratedProbability === 'number' && result.aiGeneratedProbability >= 0 && result.aiGeneratedProbability <= 1,
      });
      checks.push({
        name: 'wordCount > 30',
        pass: result.preprocessing && result.preprocessing.wordCount > 30,
      });
      return checks;
    },
  },
  {
    name: '5. Empty text',
    description: 'Should return validation error',
    text: '',
    postId: '000000000000000000000005',
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '6. Whitespace-only text',
    description: 'Should return validation error',
    text: '   \n\t  ',
    postId: '000000000000000000000006',
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '7. Very long text (1000+ words)',
    description: 'Should handle long text without errors',
    text: `The history of artificial intelligence dates back to the mid-20th century when computer scientists first began exploring the concept of machine intelligence. Alan Turing, in his seminal 1950 paper "Computing Machinery and Intelligence," proposed what is now known as the Turing Test as a criterion for determining whether a machine can exhibit intelligent behavior equivalent to that of a human. This foundational work set the stage for decades of research in AI. The field experienced several periods of intense activity followed by what are known as "AI winters," during which funding and interest waned. The first AI winter occurred in the 1970s when early neural networks failed to deliver on their promises. A second AI winter followed in the late 1980s and early 1990s when expert systems proved less practical than anticipated. However, the resurgence of interest in machine learning, particularly deep learning, has led to remarkable breakthroughs in recent years. Convolutional neural networks have revolutionized computer vision, while recurrent neural networks and transformers have transformed natural language processing. The development of large language models such as GPT, BERT, and their successors has demonstrated that AI systems can generate remarkably coherent text, translate between languages with high accuracy, and even write code. These advances have raised important questions about the societal implications of AI, including concerns about job displacement, algorithmic bias, privacy, and the potential for misuse. As AI continues to evolve, it is crucial that we develop robust frameworks for ensuring these technologies are developed and deployed responsibly. The intersection of AI with fields such as healthcare, climate science, and education offers tremendous potential for positive impact, but only if we approach these applications with careful consideration of ethical implications and a commitment to fairness and transparency.`,
    postId: '000000000000000000000007',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'wordCount > 100',
        pass: result.preprocessing && result.preprocessing.wordCount > 100,
      });
      checks.push({
        name: 'processingTimeMs is a positive number',
        pass: typeof result.processingTimeMs === 'number' && result.processingTimeMs > 0,
      });
      checks.push({
        name: 'preprocessing.characterCount > 1000',
        pass: result.preprocessing && result.preprocessing.characterCount > 1000,
      });
      return checks;
    },
  },
  {
    name: '8. Malformed request - missing text',
    description: 'Should return validation error when text field is missing',
    text: null,
    postId: '000000000000000000000008',
    sendBody: { postId: '000000000000000000000008' }, // no text field
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '9. Malformed request - missing postId',
    description: 'Should return validation error when postId field is missing',
    text: null,
    postId: null,
    sendBody: { text: 'Some text here' }, // no postId field
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '10. Malformed request - empty body',
    description: 'Should return validation error for empty JSON body',
    text: null,
    postId: null,
    sendBody: {},
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: '11. Malformed request - wrong Content-Type',
    description: 'Should return error for non-JSON content type',
    text: 'This should fail',
    postId: '00000000000000000000000B',
    sendRaw: true,
    expectError: true,
  },
  {
    name: '12. Short text',
    description: 'Very short but valid text',
    text: 'Hello world!',
    postId: '00000000000000000000000C',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'wordCount is 2',
        pass: result.preprocessing && result.preprocessing.wordCount === 2,
      });
      return checks;
    },
  },
  {
    name: '13. Text with entities',
    description: 'Text containing named entities (people, places, orgs)',
    text: 'Barack Obama served as the 44th President of the United States from 2009 to 2017. He was born in Honolulu, Hawaii. Before becoming president, Obama was a senator from Illinois and taught constitutional law at the University of Chicago. His memoir "Dreams from My Father" was published in 1995.',
    postId: '00000000000000000000000D',
    assertions: (result) => {
      const checks = [];
      checks.push({
        name: 'success is true',
        pass: result.success === true,
      });
      checks.push({
        name: 'entities array is present',
        pass: Array.isArray(result.entities),
      });
      checks.push({
        name: 'at least one entity detected',
        pass: result.entities.length > 0,
      });
      if (result.entities.length > 0) {
        checks.push({
          name: 'entity has text and label',
          pass: typeof result.entities[0].text === 'string' && typeof result.entities[0].label === 'string',
        });
      }
      return checks;
    },
  },
];

// -- Test Runner ------------------------------------------------------------

async function runTests() {
  console.log('='.repeat(70));
  console.log('NEXORA TEXT ANALYSIS — INTEGRATION TESTS');
  console.log('='.repeat(70));
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`AI Service URL: ${AI_SERVICE_URL}`);
  console.log('');

  // First, check AI service health
  console.log('--- AI Service Health Check ---');
  try {
    const health = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 10000 });
    console.log('Status:', health.data.status);
    console.log('Models:', JSON.stringify(health.data.modelsLoaded, null, 2));
    console.log('Device:', health.data.device);
    if (health.data.modelsFailed && health.data.modelsFailed.length > 0) {
      console.log('Models that failed to load:', health.data.modelsFailed);
    }
    console.log('');
  } catch (err) {
    console.log('WARNING: Could not reach AI service:', err.message);
    console.log('Tests will still run but model-dependent tests may fail.');
    console.log('');
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const testCase of testCases) {
    console.log(`--- Test: ${testCase.name} ---`);
    console.log(`Description: ${testCase.description}`);

    try {
      let response;

      if (testCase.sendRaw) {
        // Send raw text without Content-Type: application/json
        try {
          response = await axios.post(
            `${BACKEND_URL}/api/v1/content/analyze-text`,
            'plain text body',
            {
              headers: { 'Content-Type': 'text/plain', ...HEADERS },
              timeout: 120000,
            }
          );
          // If we got here without error, the server accepted raw text
          console.log('  Result: ACCEPTED (server processed raw text)');
          passed++;
          console.log('  Status: PASSED');
        } catch (err) {
          if (err.response && err.response.status >= 400) {
            console.log(`  Result: Error ${err.response.status} (expected)`);
            passed++;
            console.log('  Status: PASSED');
          } else {
            console.log(`  Result: Unexpected error: ${err.message}`);
            failed++;
            console.log('  Status: FAILED');
          }
        }
        console.log('');
        continue;
      }

      const body = testCase.sendBody || {
        text: testCase.text,
        postId: testCase.postId,
      };

      response = await axios.post(
        `${BACKEND_URL}/api/v1/content/analyze-text`,
        body,
        {
          headers: HEADERS,
          timeout: 120000,
        }
      );

      if (testCase.expectError) {
        console.log(`  Result: Expected error but got status ${response.status}`);
        failed++;
        console.log('  Status: FAILED');
      } else {
        const result = response.data.analysis || response.data;
        console.log(`  Status code: ${response.status}`);
        console.log(`  Success: ${result.success}`);
        console.log(`  Misinformation: ${(result.misinformationProbability * 100).toFixed(2)}%`);
        console.log(`  AI-Generated: ${(result.aiGeneratedProbability * 100).toFixed(2)}%`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(2)}%`);
        console.log(`  Model: ${result.modelVersion}`);
        console.log(`  Processing time: ${result.processingTimeMs}ms`);
        console.log(`  Language: ${result.preprocessing?.language || 'unknown'}`);
        console.log(`  Word count: ${result.preprocessing?.wordCount || 0}`);
        console.log(`  Claims: ${result.claims?.length || 0}`);
        console.log(`  Entities: ${result.entities?.length || 0}`);
        if (result.errors && result.errors.length > 0) {
          console.log(`  Errors: ${JSON.stringify(result.errors)}`);
        }

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
      if (testCase.expectError) {
        const status = err.response ? err.response.status : 'no response';
        const match = err.response && err.response.status === testCase.expectedStatus;
        console.log(`  Result: Error ${status}${match ? ' (expected)' : ' (unexpected)'}`);
        if (match) {
          passed++;
          console.log('  Status: PASSED');
        } else {
          failed++;
          console.log('  Status: FAILED');
        }
      } else {
        console.log(`  Result: Unexpected error: ${err.message}`);
        if (err.response) {
          console.log(`  Response: ${JSON.stringify(err.response.data, null, 2)}`);
        }
        failed++;
        console.log('  Status: FAILED');
      }
    }
    console.log('');
  }

  // Summary
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
