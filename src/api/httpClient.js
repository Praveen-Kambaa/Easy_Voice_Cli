/**
 * Logged fetch — wraps global fetch for API tracking + timeout support.
 */
import logger, { API_LOGGING_ENABLED, isInternalDevUrl } from '../utils/logger';

export const originalFetch = global.fetch.bind(global);

let fetchLoggerInstalled = false;

function urlToString(url) {
  if (typeof url === 'string') return url;
  if (url && typeof url === 'object' && url.url) return url.url;
  return String(url);
}

async function readResponsePreview(response) {
  try {
    const text = await response.clone().text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    }
  } catch {
    return '[unreadable]';
  }
}

/** Patches global.fetch so Auth, translate, grammar, etc. are all logged. */
export function installGlobalFetchLogger() {
  if (fetchLoggerInstalled) return;
  fetchLoggerInstalled = true;

  global.fetch = async (url, options = {}) => {
    const urlStr = urlToString(url);
    if (!logger.isApiLoggingEnabled() || isInternalDevUrl(urlStr)) {
      return originalFetch(url, options);
    }

    const method = options.method || 'GET';
    const started = Date.now();
    logger.apiRequest(method, urlStr, options.body);

    try {
      const response = await originalFetch(url, options);
      const durationMs = Date.now() - started;
      const preview = await readResponsePreview(response);
      if (response.ok) {
        logger.apiResponse(method, urlStr, response.status, preview, durationMs);
      } else {
        logger.apiError(
          method,
          urlStr,
          { message: `HTTP ${response.status}`, status: response.status, response: { status: response.status, data: preview } },
          durationMs,
        );
      }
      return response;
    } catch (error) {
      logger.apiError(method, urlStr, error, Date.now() - started);
      throw error;
    }
  };
}

export function initHttpClient() {
  if (API_LOGGING_ENABLED) {
    installGlobalFetchLogger();
  }
}

/**
 * Fetch with timeout. Logs URL / payload / response (does not use global.fetch
 * patch, so logging is done here explicitly).
 */
export async function apiFetch(url, options = {}, timeoutMs = 120000) {
  const method = options.method || 'GET';
  const started = Date.now();
  const shouldLog = logger.isApiLoggingEnabled() && !isInternalDevUrl(url);

  if (shouldLog) {
    logger.apiRequest(method, url, options.body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await originalFetch(url, {
      ...options,
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const err = {
        message:
          (typeof data === 'object' && (data?.message || data?.error)) ||
          `HTTP ${response.status}`,
        status: response.status,
        response: { status: response.status, data },
      };
      if (shouldLog) {
        logger.apiError(method, url, err, durationMs);
      }
      throw err;
    }

    if (shouldLog) {
      logger.apiResponse(method, url, response.status, data, durationMs);
    }

    return data;
  } catch (error) {
    if (error?.response || error?.status) {
      // already logged above for HTTP errors
      if (error?.name === 'AbortError') {
        throw { message: 'Request timed out', name: 'AbortError' };
      }
      throw error;
    }

    const durationMs = Date.now() - started;
    if (shouldLog) {
      if (error?.name === 'AbortError') {
        logger.apiError(method, url, { message: 'Request timed out', name: 'AbortError' }, durationMs);
      } else {
        logger.apiError(method, url, error, durationMs);
      }
    }
    if (error?.name === 'AbortError') {
      throw { message: 'Request timed out', name: 'AbortError' };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
