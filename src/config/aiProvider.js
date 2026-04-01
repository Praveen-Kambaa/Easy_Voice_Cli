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
