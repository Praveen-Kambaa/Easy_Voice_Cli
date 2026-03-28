import {
  AI_CHAT_API_BASE_URL,
  AI_CHAT_MODEL,
} from '../config/aiProvider';
import { getAiProviderApiKey } from './floatingMicConfig';

/**
 * Chat completion via the configured AI provider (see aiProvider.js).
 * Floating overlay uses the same contract natively (AiProviderChatClient.kt).
 *
 * SECURITY: Prefer a backend proxy in production — never expose long-lived keys in shipped apps.
 *
 * @param {string} question - user question (assumed English)
 * @returns {Promise<{ success: true, answer: string } | { success: false, error: string }>}
 */
export async function askQuestion(question) {
  const q = (question ?? '').trim();
  if (!q) {
    return { success: false, error: 'Empty question' };
  }

  const apiKey = await getAiProviderApiKey();
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Configure AI_PROVIDER_API_KEY in src/config/aiProvider.js.' };
  }

  const url = `${AI_CHAT_API_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_CHAT_MODEL,
        messages: [
          { role: 'system', content: 'Answer clearly and concisely.' },
          { role: 'user', content: q },
        ],
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        `Request failed (${res.status})`;
      return { success: false, error: msg };
    }

    const answer =
      data?.choices?.[0]?.message?.content != null
        ? String(data.choices[0].message.content).trim()
        : '';

    if (!answer) {
      return { success: false, error: 'No answer from the model' };
    }
    return { success: true, answer };
  } catch (e) {
    const msg =
      e?.name === 'AbortError'
        ? 'Request timed out'
        : e?.message || 'AI request failed';
    return { success: false, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}
