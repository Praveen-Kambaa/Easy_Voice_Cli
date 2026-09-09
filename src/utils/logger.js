/**
 * Centralized application logger + config.
 *
 * Set APP_LOGGING_ENABLED = false to silence all logs.
 * Or at runtime: logger.setEnabled(false)
 */
export const APP_LOGGING_ENABLED = true;
export const API_LOGGING_ENABLED = true;

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

let enabled = APP_LOGGING_ENABLED;
let minLevel = LEVELS.debug;

const formatArgs = (args) =>
  args
    .map((a) => {
      if (a == null) return String(a);
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

/** Always console.log so LogBox does not spam Metro /symbolicate on API errors. */
const writeLine = (line) => {
  // eslint-disable-next-line no-console
  console.log(line);
};

const write = (level, tag, args) => {
  if (!enabled || LEVELS[level] < minLevel) return;
  const prefix = tag ? `[${tag}]` : '[App]';
  const line = `${prefix} ${formatArgs(args)}`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
    return;
  }
  writeLine(line);
};

const truncate = (s, max = 4000) => {
  if (s == null) return s;
  const str = String(s);
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

const redactBody = (body) => {
  if (body == null) return '(none)';
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[FormData]';
  }
  if (typeof body === 'string') {
    try {
      return truncate(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      return truncate(body);
    }
  }
  try {
    return truncate(JSON.stringify(body, null, 2));
  } catch {
    return '[object]';
  }
};

const redactResponse = (data) => {
  if (data == null) return '(empty)';
  if (typeof data === 'string') {
    try {
      return truncate(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      return truncate(data);
    }
  }
  try {
    return truncate(JSON.stringify(data, null, 2));
  } catch {
    return '[object]';
  }
};

/** Skip Metro / DevTools traffic so log:android stays readable. */
export function isInternalDevUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('/symbolicate') ||
    url.includes('/message?') ||
    url.includes('/inspector') ||
    url.includes('localhost:8081') ||
    url.includes('localhost:8082') ||
    url.includes('127.0.0.1:8081') ||
    url.includes('127.0.0.1:8082')
  );
}

const apiCallHistory = [];
const MAX_API_HISTORY = 100;

function pushApiHistory(entry) {
  apiCallHistory.push(entry);
  if (apiCallHistory.length > MAX_API_HISTORY) {
    apiCallHistory.shift();
  }
}

function logApiBlock(title, lines) {
  if (!enabled || !API_LOGGING_ENABLED) return;
  writeLine(`──────── ${title} ────────`);
  for (const line of lines) {
    writeLine(line);
  }
  writeLine('────────────────────────────');
}

export const logger = {
  isEnabled() {
    return enabled;
  },

  isApiLoggingEnabled() {
    return enabled && API_LOGGING_ENABLED;
  },

  setEnabled(value) {
    enabled = !!value;
  },

  setLevel(level) {
    if (LEVELS[level] != null) minLevel = LEVELS[level];
  },

  getApiHistory() {
    return [...apiCallHistory];
  },

  clearApiHistory() {
    apiCallHistory.length = 0;
  },

  debug: (...args) => write('debug', 'App', args),
  info: (...args) => write('info', 'App', args),
  warn: (...args) => write('warn', 'App', args),
  error: (...args) => write('error', 'App', args),

  apiRequest(method, url, body, meta) {
    if (!enabled || !API_LOGGING_ENABLED) return;
    if (isInternalDevUrl(url)) return;
    const methodUp = method?.toUpperCase?.() || method || 'GET';
    pushApiHistory({
      type: 'request',
      at: new Date().toISOString(),
      method: methodUp,
      url,
    });
    logApiBlock('API REQUEST', [
      `METHOD : ${methodUp}`,
      `URL    : ${url}`,
      `PAYLOAD: ${redactBody(body)}`,
      meta ? `META   : ${formatArgs([meta])}` : null,
    ].filter(Boolean));
  },

  apiResponse(method, url, status, data, durationMs) {
    if (!enabled || !API_LOGGING_ENABLED) return;
    if (isInternalDevUrl(url)) return;
    const methodUp = method?.toUpperCase?.() || method || 'GET';
    pushApiHistory({
      type: 'response',
      at: new Date().toISOString(),
      method: methodUp,
      url,
      status,
      durationMs,
    });
    logApiBlock('API RESPONSE', [
      `METHOD  : ${methodUp}`,
      `URL     : ${url}`,
      `STATUS  : ${status}`,
      `DURATION: ${durationMs ?? '?'}ms`,
      `BODY    : ${redactResponse(data)}`,
    ]);
  },

  apiError(method, url, err, durationMs) {
    if (!enabled || !API_LOGGING_ENABLED) return;
    if (isInternalDevUrl(url)) return;
    const methodUp = method?.toUpperCase?.() || method || '?';
    const status = err?.response?.status ?? err?.status ?? err?.statusCode;
    const message = err?.message || err?.response?.data?.message || String(err);
    const responseBody = err?.response?.data ?? err?.data ?? null;
    pushApiHistory({
      type: 'error',
      at: new Date().toISOString(),
      method: methodUp,
      url,
      status: status || 'network',
      message,
      durationMs,
    });
    logApiBlock('API ERROR', [
      `METHOD  : ${methodUp}`,
      `URL     : ${url}`,
      `STATUS  : ${status || 'network'}`,
      `DURATION: ${durationMs ?? '?'}ms`,
      `MESSAGE : ${message}`,
      `BODY    : ${redactResponse(responseBody)}`,
    ]);
  },
};

export function initAppLogging() {
  enabled = APP_LOGGING_ENABLED;
  if (enabled) {
    logger.info('Logging enabled. Set APP_LOGGING_ENABLED=false in src/utils/logger.js to silence.');
  }
}

export default logger;
