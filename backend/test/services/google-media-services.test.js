/**
 * Google Cloud Media Services Tests
 * =================================
 * Covers:
 *   1. Honest availability gating when service-account credentials are absent
 *   2. Video Intelligence annotation normalization
 *   3. Speech-to-Text encoding mapping and response normalization
 *   4. Source credibility derived from real evidence only
 *   5. Media → rule-engine content type resolution
 *
 * Run with: npm test -- --testPathPattern=google-media-services
 */

describe('Google Cloud media services', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('credential gate', () => {
    it('reports not configured when no credentials are present', () => {
      const config = require('../../src/services/google-cloud-config.service');
      const resolved = config.resolveCredentials();
      expect(resolved.configured).toBe(false);
      expect(resolved.reason).toMatch(/service-account credentials/i);
    });

    it('reports not configured when the credentials path does not exist', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:/definitely/missing/key.json';
      const config = require('../../src/services/google-cloud-config.service');
      expect(config.isConfigured()).toBe(false);
    });
  });

  describe('Video Intelligence service', () => {
    it('returns available:false with reason not_configured (never fabricated output)', async () => {
      const service = require('../../src/services/google-video-intelligence.service');
      expect(service.getAvailability().available).toBe(false);
      expect(service.getAvailability().reason).toBe('not_configured');

      const result = await service.analyzeVideo('https://example.com/video.mp4');
      expect(result.available).toBe(false);
      expect(result.reason).toBe('not_configured');
      expect(result.labels).toBeUndefined();
      expect(result.transcript).toBeUndefined();
    });

    it('converts protobuf durations to seconds', () => {
      const service = require('../../src/services/google-video-intelligence.service');
      expect(service.durationToSeconds({ seconds: 2, nanos: 500000000 })).toBe(2.5);
      expect(service.durationToSeconds(null)).toBe(0);
    });

    it('merges segment/shot/frame labels by highest confidence', () => {
      const service = require('../../src/services/google-video-intelligence.service');
      const labels = service.normalizeLabels({
        segmentLabelAnnotations: [
          { entity: { description: 'Car' }, confidence: 0.9, categoryEntities: [] },
        ],
        shotLabelAnnotations: [
          { entity: { description: 'Vehicle' }, confidence: 0.4, categoryEntities: [] },
        ],
        frameLabelAnnotations: [
          { entity: { description: 'Car' }, confidence: 0.6, categoryEntities: [] },
        ],
      });
      expect(labels[0].name).toBe('Car');
      expect(labels[0].confidence).toBe(0.9);
      expect(labels).toHaveLength(2);
    });

    it('normalizes the speech transcript of the audio track', () => {
      const service = require('../../src/services/google-video-intelligence.service');
      const result = service.normalizeSpeechTranscription({
        speechTranscriptions: [
          {
            languageCode: 'en-US',
            alternatives: [
              {
                transcript: 'the reactor was shut down',
                confidence: 0.8,
                words: [
                  { word: 'the', startTime: { seconds: 1 }, endTime: { seconds: 2 } },
                ],
              },
            ],
          },
        ],
      });
      expect(result.transcript).toBe('the reactor was shut down');
      expect(result.available).toBe(true);
      expect(result.languageCode).toBe('en-US');
      expect(result.words).toHaveLength(1);
    });

    it('reports an empty transcript as unavailable', () => {
      const service = require('../../src/services/google-video-intelligence.service');
      expect(service.normalizeSpeechTranscription({}).available).toBe(false);
    });

    it('classifies API errors into machine-readable codes', () => {
      const service = require('../../src/services/google-video-intelligence.service');
      expect(service.classifyError({ code: 'ETIMEDOUT' })).toBe('timeout');
      expect(service.classifyError({ response: { status: 403 } })).toBe('authentication_failed');
      expect(service.classifyError({ response: { status: 429 } })).toBe('quota_exceeded');
      expect(service.classifyError({ response: { status: 503 } })).toBe('service_unavailable');
      expect(service.classifyError({ message: 'boom' })).toBe('api_error');
    });
  });

  describe('Speech-to-Text service', () => {
    it('returns available:false with reason not_configured', async () => {
      const service = require('../../src/services/google-speech.service');
      expect(service.getAvailability().available).toBe(false);

      const result = await service.transcribe('https://example.com/audio.mp3');
      expect(result.available).toBe(false);
      expect(result.reason).toBe('not_configured');
      expect(result.transcript).toBeUndefined();
    });

    it('maps file extensions to supported encodings', () => {
      const service = require('../../src/services/google-speech.service');
      expect(service.encodingForExtension('.mp3')).toBe('MP3');
      expect(service.encodingForExtension('ogg')).toBe('OGG_OPUS');
      expect(service.encodingForExtension('.flac')).toBe('FLAC');
      expect(service.encodingForExtension('.wav')).toBe('LINEAR16');
      expect(service.encodingForExtension('.aac')).toBeNull();
    });

    it('normalizes a recognition response with words and confidence', () => {
      const service = require('../../src/services/google-speech.service');
      const result = service.normalizeResponse({
        results: [
          {
            languageCode: 'en-US',
            alternatives: [
              {
                transcript: 'hello world',
                confidence: 0.9,
                words: [
                  { word: 'hello', startTime: { seconds: 0 }, endTime: { seconds: 1 } },
                  { word: 'world', startTime: { seconds: 1 }, endTime: { seconds: 2 } },
                ],
              },
            ],
          },
        ],
      });
      expect(result.transcript).toBe('hello world');
      expect(result.languageCode).toBe('en-US');
      expect(result.confidence).toBe(0.9);
      expect(result.wordCount).toBe(2);
      expect(result.segments).toHaveLength(1);
    });

    it('returns an empty transcript for an empty response', () => {
      const service = require('../../src/services/google-speech.service');
      const result = service.normalizeResponse({});
      expect(result.transcript).toBe('');
      expect(result.wordCount).toBe(0);
    });
  });

  describe('Source credibility service', () => {
    it('returns neutral + unavailable when there is no evidence', () => {
      const service = require('../../src/services/source-credibility.service');
      const result = service.computeSourceCredibility({});
      expect(result.available).toBe(false);
      expect(result.score).toBe(0.5);
      expect(result.signals).toEqual([]);
    });

    it('derives credibility from real fact-check publisher evidence', () => {
      const service = require('../../src/services/source-credibility.service');
      const result = service.computeSourceCredibility({
        factCheckReviews: [
          { publisher: { name: 'Reuters Fact Check', site: 'https://reuters.com' } },
          { publisher: { name: 'AP Fact Check', site: 'https://apnews.com' } },
        ],
      });
      expect(result.available).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.signals.map((s) => s.name)).toContain('fact_check_publisher_presence');
      expect(result.signals.map((s) => s.name)).toContain('independent_corroboration');
    });

    it('accepts flattened stored review shapes', () => {
      const service = require('../../src/services/source-credibility.service');
      const result = service.computeSourceCredibility({
        factCheckReviews: [{ publisherName: 'PolitiFact', publisherSite: 'https://politifact.com' }],
      });
      expect(result.available).toBe(true);
      expect(service.uniquePublishers([{ publisherName: 'PolitiFact' }])).toEqual(['PolitiFact']);
    });

    it('flags the source itself being a fact-check publisher', () => {
      const service = require('../../src/services/source-credibility.service');
      const result = service.computeSourceCredibility({
        factCheckReviews: [{ publisher: { name: 'Snopes', site: 'https://snopes.com' } }],
        sourceUrl: 'https://snopes.com/article/123',
      });
      expect(result.signals.map((s) => s.name)).toContain('source_is_fact_check_publisher');
    });

    it('hostnameOf is safe for invalid URLs', () => {
      const service = require('../../src/services/source-credibility.service');
      expect(service.hostnameOf('not a url')).toBeNull();
      expect(service.hostnameOf('https://www.Example.com/x')).toBe('example.com');
    });
  });

  describe('Media verification rule typing', () => {
    it('maps opinion/satire media with no factual claims to the PURPLE rule', () => {
      const service = require('../../src/services/media-verification.service');
      const result = service.resolveRuleContentType(
        'IMAGE',
        { claimContentType: 'SATIRE' },
        { factCheckable: [], skipped: [] },
        'image'
      );
      expect(result).toBe('satire');
    });

    it('keeps the media content type when factual claims were found', () => {
      const service = require('../../src/services/media-verification.service');
      const result = service.resolveRuleContentType(
        'IMAGE',
        { claimContentType: 'SATIRE' },
        { factCheckable: [{ text: 'x' }], skipped: [] },
        'image'
      );
      expect(result).toBe('image');
    });
  });
});
