/**
 * Google Cloud Configuration Gate
 * ===============================
 * Single, honest source of truth for whether the Google Cloud media APIs
 * (Video Intelligence, Speech-to-Text) can actually be called.
 *
 * IMPORTANT (spec: no fake data):
 *   When credentials are not configured, every caller must report the
 *   capability as UNAVAILABLE and mark that signal absent. It must never
 *   substitute a heuristic or fabricated result for the API output.
 *
 * Credentials are resolved from (in order):
 *   1. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account JSON file
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON    — inline service-account JSON string
 *
 * The project id is read from GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_PROJECT_ID
 * / GCLOUD_PROJECT. The optional media bucket is GOOGLE_CLOUD_STORAGE_BUCKET,
 * used when a service requires a Cloud Storage URI (long audio / video).
 */

const fs = require('fs');

// ─── Credential resolution ────────────────────────────────────────────

/**
 * Resolve the configured service-account credentials.
 *
 * @returns {{ configured: boolean, source: string|null, credentials: object|null, projectId: string|null, reason: string|null }}
 */
function resolveCredentials() {
  const projectId = getProjectId();
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (credPath) {
    try {
      if (!fs.existsSync(credPath)) {
        return {
          configured: false,
          source: null,
          credentials: null,
          projectId,
          reason: `GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist: ${credPath}`,
        };
      }
      const raw = fs.readFileSync(credPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        configured: true,
        source: 'GOOGLE_APPLICATION_CREDENTIALS',
        credentials: parsed,
        projectId: projectId || parsed.project_id || null,
        reason: null,
      };
    } catch (err) {
      return {
        configured: false,
        source: null,
        credentials: null,
        projectId,
        reason: `Could not read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`,
      };
    }
  }

  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson);
      return {
        configured: true,
        source: 'GOOGLE_SERVICE_ACCOUNT_JSON',
        credentials: parsed,
        projectId: projectId || parsed.project_id || null,
        reason: null,
      };
    } catch (err) {
      return {
        configured: false,
        source: null,
        credentials: null,
        projectId,
        reason: `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`,
      };
    }
  }

  return {
    configured: false,
    source: null,
    credentials: null,
    projectId,
    reason:
      'No Google Cloud service-account credentials configured. Set ' +
      'GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON) or ' +
      'GOOGLE_SERVICE_ACCOUNT_JSON, and enable the required Google Cloud APIs.',
  };
}

/**
 * Cheapest possible "can we call the API" check.
 */
function isConfigured() {
  return resolveCredentials().configured;
}

/**
 * Read the Google Cloud project id from any supported env var.
 */
function getProjectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    null
  );
}

/**
 * Optional Cloud Storage bucket used for media that must be referenced by a
 * gs:// URI (long audio transcription).
 */
function getStorageBucket() {
  return process.env.GOOGLE_CLOUD_STORAGE_BUCKET || null;
}

/**
 * Options object for the @google-cloud/* client constructors.
 */
function clientOptions() {
  const resolved = resolveCredentials();
  const opts = { projectId: resolved.projectId || undefined };
  if (resolved.credentials) {
    opts.credentials = resolved.credentials;
  }
  return opts;
}

/**
 * Human-readable description of the media-API configuration (for /health and
 * the final report). Never claims a capability is working when it is not.
 */
function describeConfiguration() {
  const resolved = resolveCredentials();
  return {
    configured: resolved.configured,
    source: resolved.source,
    projectId: resolved.projectId,
    storageBucket: getStorageBucket(),
    reason: resolved.reason,
  };
}

module.exports = {
  resolveCredentials,
  isConfigured,
  getProjectId,
  getStorageBucket,
  clientOptions,
  describeConfiguration,
};
