/**
 * AI Service Error Helper
 * =======================
 * Turns a failed request to the Python AI analysis service into a clear
 * message plus a machine-readable code.
 *
 * Spec §31: when a model service is unavailable its signal is marked as
 * UNAVAILABLE. Callers must record the failure and account for the missing
 * evidence — never substitute a fabricated value for it.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * @param {Error} err - The axios error
 * @param {string} modality - 'image' | 'video' | 'audio' | 'text'
 * @returns {{ available: false, code: string, message: string, serviceUrl: string }}
 */
function describeAiServiceError(err, modality = 'media') {
  const serviceUrl = AI_SERVICE_URL;

  if (err?.code === 'ECONNREFUSED') {
    return {
      available: false,
      code: 'ai_service_unavailable',
      message:
        `Python AI service is not reachable at ${serviceUrl}. The ${modality} ` +
        'authenticity model did not run, so that signal is unavailable. Start ' +
        'the service to enable it.',
      serviceUrl,
    };
  }

  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
    return {
      available: false,
      code: 'ai_service_timeout',
      message:
        `Python AI service timed out during ${modality} analysis. The ` +
        'authenticity model did not complete, so that signal is unavailable.',
      serviceUrl,
    };
  }

  if (err?.response?.data) {
    return {
      available: false,
      code: 'ai_service_error',
      message:
        `AI service error during ${modality} analysis: ` +
        `${err.response.data.detail || err.response.statusText || 'unknown error'}`,
      serviceUrl,
    };
  }

  return {
    available: false,
    code: 'ai_service_error',
    message: `AI ${modality} analysis failed: ${err?.message || 'unknown error'}`,
    serviceUrl,
  };
}

module.exports = { describeAiServiceError, AI_SERVICE_URL };
