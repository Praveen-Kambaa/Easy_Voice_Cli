import {
  AI_CHAT_API_BASE_URL,
  AI_CHAT_MODEL,
  AI_PROVIDER_API_KEY,
} from '../config/aiProvider';
import { transcribeBySettings } from './transcribeService';
import { fetchLiveContext } from './liveContextService';

/**
 * Chat completion via OpenRouter (or any OpenAI-compatible API) — see `src/config/aiProvider.js`.
 * Optionally enriches the system prompt with **Tavily** web context (`liveContextService` + `liveContextProvider.js`).
 *
 * Flow: user text → fetchLiveContext(question) → POST /chat/completions with model + messages.
 *
 * @param {string} question - user question (from transcription or typing)
 * @returns {Promise<{ success: true, answer: string } | { success: false, error: string }>}
 */
export async function askQuestion(question) {
  const q = (question ?? '').trim();
  if (!q) {
    return { success: false, error: 'Empty question' };
  }

  const apiKey = (AI_PROVIDER_API_KEY ?? '').trim();
  if (!apiKey) {
    return { success: false, error: 'Set AI_PROVIDER_API_KEY in src/config/aiProvider.js.' };
  }

  const url = `${AI_CHAT_API_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (/openrouter\.ai/i.test(AI_CHAT_API_BASE_URL)) {
    headers['HTTP-Referer'] = 'https://typeeasy.app';
    headers['X-OpenRouter-Title'] = 'TypeEasy';
  }

  try {
    const liveContext = await fetchLiveContext(q);
    const useLive = Boolean(liveContext && liveContext.trim());
    const systemContent = useLive
      ? `You are an AI assistant with access to the latest real-time information.

IMPORTANT RULES:

* You MUST use the provided context to answer
* DO NOT say "I don't have real-time data"
* DO NOT mention knowledge cutoff
* If context is relevant, prioritize it

LATEST CONTEXT:
${liveContext}`
      : 'Answer clearly and concisely.';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: AI_CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
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

    const answerRaw =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.choices?.[0]?.message?.text ??
      (typeof data?.choices?.[0]?.delta?.content === 'string' ? data.choices[0].delta.content : null) ??
      data?.message?.content ??
      data?.response ??
      data?.output ??
      '';
    const answer = String(answerRaw ?? '').trim();

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

const DEFAULT_TRANSCRIBE_OPTS = {
  language: 'en-US',
  enablePunctuation: true,
  enableTimestamps: false,
};

/**
 * **Ask Question mic pipeline** (used by `AskQuestionScreen`):
 * 1. **STT** — POST audio to Easy Voice ` /voice/transcribe` via `transcribeAudio` (`voiceApi.js`).
 * 2. **Tavily (optional)** — `fetchLiveContext` adds live web snippets when `TAVILY_API_KEY` is set (`liveContextProvider.js`).
 * 3. **OpenRouter** — chat completion using `AI_CHAT_API_BASE_URL`, `AI_CHAT_MODEL`, `AI_PROVIDER_API_KEY` from `aiProvider.js`.
 *
 * @param {string} audioFilePath - path from `NativeAudioService.stopRecording().filePath`
 * @param {object} [transcribeOptions] - overrides for STT (language, etc.)
 * @returns {Promise<
 *   | { success: true; questionText: string; answer: string }
 *   | { success: false; stage: 'transcribe' | 'ai'; error: string; questionText?: string }
 * >}
 */
export async function transcribeAndAskQuestion(audioFilePath, transcribeOptions = {}) {
  const tr = await transcribeBySettings(audioFilePath, {
    ...DEFAULT_TRANSCRIBE_OPTS,
    ...transcribeOptions,
  });

  if (!tr.success) {
    return { success: false, stage: 'transcribe', error: tr.error || 'Could not transcribe audio.' };
  }

  const questionText = String(
    tr.data?.refinedTranscript || tr.data?.rawTranscript || '',
  ).trim();

  if (!questionText) {
    return {
      success: false,
      stage: 'transcribe',
      error: 'No speech detected. Speak clearly, then stop recording.',
    };
  }

  const ai = await askQuestion(questionText);

  if (!ai.success) {
    return {
      success: false,
      stage: 'ai',
      questionText,
      error: ai.error || 'Could not get an AI answer.',
    };
  }

  const answer = String(ai.answer ?? '').trim();
  if (!answer) {
    return {
      success: false,
      stage: 'ai',
      questionText,
      error: 'The model returned an empty answer.',
    };
  }

  return { success: true, questionText, answer };
}
