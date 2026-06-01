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

const write = (level, tag, args) => {
  if (!enabled || LEVELS[level] < minLevel) return;
  const prefix = tag ? `[${tag}]` : '[App]';
  const line = `${prefix} ${formatArgs(args)}`;
  switch (level) {
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line);
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.info(line);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
};

const redactBody = (body) => {
  if (body == null) return body;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[FormData]';
  }
  if (typeof body === 'string') {
    return body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
  }
  try {
    const s = JSON.stringify(body);
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  } catch {
    return '[object]';
  }
};

const redactResponse = (data) => {
  if (data == null) return data;
  if (typeof data === 'string') {
    return data.length > 2000 ? `${data.slice(0, 2000)}…` : data;
  }
  try {
    const s = JSON.stringify(data);
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  } catch {
    return '[object]';
  }
};

const apiCallHistory = [];
const MAX_API_HISTORY = 100;

function pushApiHistory(entry) {
  apiCallHistory.push(entry);
  if (apiCallHistory.length > MAX_API_HISTORY) {
    apiCallHistory.shift();
  }
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
    pushApiHistory({
      type: 'request',
      at: new Date().toISOString(),
      method: method?.toUpperCase?.() || method,
      url,
    });
    write('info', 'API →', [
      method?.toUpperCase?.() || method,
      url,
      body != null ? redactBody(body) : '',
      meta || '',
    ]);
  },

  apiResponse(method, url, status, data, durationMs) {
    if (!enabled || !API_LOGGING_ENABLED) return;
    pushApiHistory({
      type: 'response',
      at: new Date().toISOString(),
      method: method?.toUpperCase?.() || method,
      url,
      status,
      durationMs,
    });
    write('info', 'API ←', [
      method?.toUpperCase?.() || method,
      url,
      status,
      `${durationMs ?? '?'}ms`,
      redactResponse(data),
    ]);
  },

  apiError(method, url, err, durationMs) {
    if (!enabled || !API_LOGGING_ENABLED) return;
    const status = err?.response?.status ?? err?.status ?? err?.statusCode;
    const message = err?.message || err?.response?.data?.message || String(err);
    pushApiHistory({
      type: 'error',
      at: new Date().toISOString(),
      method: method?.toUpperCase?.() || method,
      url,
      status: status || 'network',
      message,
      durationMs,
    });
    write('error', 'API ✕', [
      method?.toUpperCase?.() || method,
      url,
      status || 'network',
      `${durationMs ?? '?'}ms`,
      message,
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
