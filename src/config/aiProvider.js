/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI provider (OpenAI-compatible Chat Completions API)
 * ═══════════════════════════════════════════════════════════════════════════
 * Change **only this file** to switch API host or model. Values are synced to the
 * Android floating overlay on app launch / settings changes.
 *
 * Examples (OpenRouter model IDs):
 *   liquid/lfm-2.5-1.2b-instruct:free
 *   (other providers: set AI_CHAT_API_BASE_URL to their base + matching model id)
 *
 * SECURITY: API key below is for dev; use a backend in production.
 */
export const AI_CHAT_API_BASE_URL = 'https://openrouter.ai/api/v1';

/** Model id sent in the JSON body (`model` field). Must match your provider’s catalog. */
export const AI_CHAT_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';

/** In-app Ask Question + native overlay. */
export const AI_PROVIDER_API_KEY =
  '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';
