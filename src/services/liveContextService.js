import { TAVILY_API_BASE_URL, TAVILY_API_KEY } from '../config/liveContextProvider';

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CONTEXT_CHARS = 650;
const cache = new Map(); // query -> { at:number, text:string }
let tavilyDisabledUntilMs = 0;
const DISABLE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeQuery(q) {
  return String(q ?? '').trim().replace(/\s+/g, ' ').slice(0, 240);
}

function formatOneLine(s, maxLen) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function clampText(s, maxChars) {
  const t = String(s ?? '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} query
 * @returns {Promise<string>} a concise numbered summary, or '' on failure.
 */
export async function fetchLiveContext(query) {
  const q = normalizeQuery(query);
  if (!q) return '';
  const key = String(TAVILY_API_KEY ?? '').trim();
  if (!key) return '';

  const now = Date.now();
  if (now < tavilyDisabledUntilMs) return '';
  const cached = cache.get(q);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.text;
  }

  try {
    const url = `${String(TAVILY_API_BASE_URL).replace(/\/$/, '')}/search`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: q,
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
      },
      2500,
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // If credits are exhausted, stop calling Tavily for a while.
      if (res.status === 402 || /credit|quota|insufficient/i.test(String(data?.error ?? data?.message ?? ''))) {
        tavilyDisabledUntilMs = Date.now() + DISABLE_WINDOW_MS;
      }
      return '';
    }

    const results = Array.isArray(data?.results) ? data.results.slice(0, 5) : [];
    if (results.length === 0) return '';

    const lines = results
      .map((r, idx) => {
        const title = formatOneLine(r?.title, 80);
        const summary = formatOneLine(r?.content, 160);
        if (!title && !summary) return null;
        return `${idx + 1}. Title: ${title || '(untitled)'}\n   Summary: ${summary || '(no summary)'}`;
      })
      .filter(Boolean);

    if (lines.length === 0) return '';

    const rawText = `Latest information:\n\n${lines.join('\n\n')}\n`;
    const text = clampText(rawText, MAX_CONTEXT_CHARS);
    cache.set(q, { at: now, text });
    return text;
  } catch {
    return '';
  }
}

