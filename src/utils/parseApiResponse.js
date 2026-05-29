/**
 * Safely parse fetch responses that may be JSON or HTML error pages (e.g. 503 from Apache).
 */

/**
 * @param {Response} response
 * @returns {Promise<{
 *   ok: boolean,
 *   status: number,
 *   data: Record<string, unknown>,
 *   rawText?: string,
 *   isHtml?: boolean,
 *   parseError?: boolean,
 * }>}
 */
export async function readJsonResponse(response) {
  const status = response.status;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let text = '';

  try {
    text = await response.text();
  } catch {
    text = '';
  }

  const trimmed = text.trim();
  const looksHtml =
    trimmed.startsWith('<') ||
    trimmed.startsWith('<!') ||
    contentType.includes('text/html');

  if (!trimmed) {
    return { ok: response.ok, status, data: {} };
  }

  if (looksHtml) {
    return { ok: response.ok, status, data: {}, rawText: text, isHtml: true };
  }

  try {
    const data = JSON.parse(trimmed);
    return {
      ok: response.ok,
      status,
      data: typeof data === 'object' && data !== null ? data : { value: data },
    };
  } catch {
    return { ok: response.ok, status, data: {}, rawText: text, parseError: true };
  }
}

/**
 * User-facing message for failed API calls.
 * @param {{ status: number, isHtml?: boolean, parseError?: boolean, data?: Record<string, unknown> }} params
 * @param {string} [fallback]
 */
export function getApiErrorMessage({ status, isHtml, parseError, data }, fallback = 'Request failed') {
  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }

  if (isHtml || parseError) {
    if (status === 503) {
      return 'Server is temporarily unavailable. Please try again in a few minutes.';
    }
    if (status === 502 || status === 504) {
      return 'Server is not responding. Please try again later.';
    }
    if (status === 404) {
      return 'Service not found. Please check your connection or contact support.';
    }
    if (status >= 500) {
      return 'Server error. Please try again later.';
    }
    if (parseError) {
      return 'Invalid response from server. Please try again.';
    }
    return 'Unexpected server response. Please try again.';
  }

  if (status === 401) {
    return 'Invalid email or password.';
  }
  if (status === 403) {
    return 'Access denied.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait and try again.';
  }
  if (status >= 500) {
    return 'Server error. Please try again later.';
  }

  return fallback;
}
