import { Alert } from 'react-native';
import { GROQ_CONFIG } from '../config/api';

const PLACEHOLDER_KEY = 'PASTE_YOUR_GROQ_API_KEY_HERE';

export function isGroqConfigured() {
  const key = (GROQ_CONFIG?.API_KEY ?? '').trim();
  return Boolean(key && key !== PLACEHOLDER_KEY);
}

function getApiKeyOrThrow() {
  const key = (GROQ_CONFIG?.API_KEY ?? '').trim();
  if (!key || key === PLACEHOLDER_KEY) {
    const msg = 'Please add your Groq API key in src/config/api.js';
    try {
      Alert.alert('Groq API Key Required', msg);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return key;
}

function toFileUri(filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith('file://') || filePath.startsWith('content://')) return filePath;
  return `file://${filePath}`;
}

function getMimeType(filePath) {
  if (!filePath) return 'audio/mp4';
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = {
    m4a: 'audio/m4a',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
  };
  return map[ext] || 'audio/mp4';
}

function normalizeLanguageCode(lang) {
  if (!lang || String(lang).toLowerCase() === 'auto') return undefined;
  return String(lang).split(/[-_]/)[0].toLowerCase();
}

/**
 * 1. Speech-to-Text via Groq Whisper v3 Turbo.
 * POST https://api.groq.com/openai/v1/audio/transcriptions
 *
 * @param {string} audioUri
 * @param {string} [language]
 * @returns {Promise<{ transcript: string, rawTranscript: string, refinedTranscript: string, voiceAssetId: string }>}
 */
export async function transcribeWithGroq(audioUri, language) {
  const apiKey = getApiKeyOrThrow();
  const uri = toFileUri(audioUri);
  const fileName = audioUri.split(/[/\\]/).pop() || `audio_${Date.now()}.m4a`;
  const mimeType = getMimeType(audioUri);

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: mimeType,
    name: fileName,
  });
  formData.append('model', GROQ_CONFIG.STT_MODEL || 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');

  const lang = normalizeLanguageCode(language);
  if (lang) {
    formData.append('language', lang);
  }

  const res = await fetch(`${GROQ_CONFIG.BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Groq STT failed (${res.status})`);
  }

  const text = (data?.text || '').trim();
  const voiceAssetId = `groq-${Date.now()}`;
  return {
    transcript: text,
    rawTranscript: text,
    refinedTranscript: text,
    voiceAssetId,
  };
}

/**
 * Helper to call Groq Chat Completions.
 */
async function callGroqChat({
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxTokens = 1024,
  reasoningEffort = 'low',
}) {
  const apiKey = getApiKeyOrThrow();
  const selectedModel = model || GROQ_CONFIG.SMART_LLM_MODEL;

  const payload = {
    model: selectedModel,
    temperature,
    max_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch(`${GROQ_CONFIG.BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Groq Chat failed (${res.status})`);
  }

  const reply = data?.choices?.[0]?.message?.content?.trim() || '';
  return reply;
}

/**
 * 2. Speech-to-Translate via Groq.
 * Uses /audio/translations to English, then chains chat completion if target != English.
 *
 * @param {string} audioUri
 * @param {string} [targetLanguage='en']
 * @returns {Promise<{ transcript: string, translatedText: string }>}
 */
export async function speechTranslateWithGroq(audioUri, targetLanguage = 'en') {
  const apiKey = getApiKeyOrThrow();
  const uri = toFileUri(audioUri);
  const fileName = audioUri.split(/[/\\]/).pop() || `audio_${Date.now()}.m4a`;
  const mimeType = getMimeType(audioUri);

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: mimeType,
    name: fileName,
  });
  formData.append('model', GROQ_CONFIG.TRANSLATE_AUDIO_MODEL || 'whisper-large-v3');
  formData.append('response_format', 'json');

  const res = await fetch(`${GROQ_CONFIG.BASE_URL}/audio/translations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Groq audio translation failed (${res.status})`);
  }

  const englishText = (data?.text || '').trim();
  const normTarget = normalizeLanguageCode(targetLanguage) || 'en';

  if (!normTarget || normTarget === 'en') {
    return {
      transcript: englishText,
      translatedText: englishText,
    };
  }

  // Chain LLM translation for non-English targets
  const translated = await translateTextWithGroq(englishText, 'en', targetLanguage);
  return {
    transcript: englishText,
    translatedText: translated.translatedText || englishText,
  };
}

/**
 * 3. Grammar & Spelling Check via Groq (Llama 3.1 8B Instant).
 *
 * @param {string} text
 * @returns {Promise<{ correctedText: string, originalText: string }>}
 */
export async function checkGrammarWithGroq(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { correctedText: '', originalText: '' };

  const systemPrompt =
    'Fix grammar, spelling, and punctuation only. Preserve original meaning and tone. Return ONLY the corrected text with zero commentary.';
  const corrected = await callGroqChat({
    model: GROQ_CONFIG.FAST_LLM_MODEL || 'llama-3.1-8b-instant',
    systemPrompt,
    userPrompt: trimmed,
    temperature: 0.1,
  });

  return {
    correctedText: corrected || trimmed,
    originalText: trimmed,
  };
}

/**
 * 4. Text Translation via Groq (Llama 3.3 70B Versatile).
 *
 * @param {string} text
 * @param {string} [sourceLang]
 * @param {string} targetLang
 * @returns {Promise<{ translatedText: string }>}
 */
export async function translateTextWithGroq(text, sourceLang, targetLang) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { translatedText: '' };

  const fromDesc = sourceLang ? sourceLang : 'auto-detected language';
  const toDesc = targetLang || 'English';

  const systemPrompt = `Translate the user text from ${fromDesc} to ${toDesc}. Return ONLY the translated text with zero notes, zero quotes, and zero explanation.`;
  const translated = await callGroqChat({
    model: GROQ_CONFIG.SMART_LLM_MODEL || 'llama-3.3-70b-versatile',
    systemPrompt,
    userPrompt: trimmed,
    temperature: 0.2,
  });

  return {
    translatedText: translated || trimmed,
  };
}

/**
 * 5. Voice Command Execution via Groq (Llama 3.3 70B Versatile).
 *
 * @param {string} transcript
 * @returns {Promise<{ executionId: string, result: string, status: string }>}
 */
export async function executeVoiceCommandWithGroq(transcript) {
  const trimmed = (transcript ?? '').trim();
  const systemPrompt =
    'You are Type Easy, a helpful Android voice assistant. Execute, summarize, or answer the user\'s spoken command clearly and concisely.';

  const resultText = await callGroqChat({
    model: GROQ_CONFIG.SMART_LLM_MODEL || 'llama-3.3-70b-versatile',
    systemPrompt,
    userPrompt: trimmed,
    temperature: 0.3,
  });

  return {
    executionId: `groq-exec-${Date.now()}`,
    result: resultText || 'Command processed successfully.',
    status: 'completed',
  };
}

/**
 * 6. Ask AI / Q&A via Groq (Llama 3.3 70B Versatile).
 *
 * @param {string} question
 * @returns {Promise<{ answer: string }>}
 */
export async function askAiWithGroq(question) {
  const trimmed = (question ?? '').trim();
  const systemPrompt =
    'Answer the user\'s question accurately and concisely using clean markdown bolding for key points.';

  const answer = await callGroqChat({
    model: GROQ_CONFIG.SMART_LLM_MODEL || 'llama-3.3-70b-versatile',
    systemPrompt,
    userPrompt: trimmed,
    temperature: 0.3,
  });

  return { answer };
}

export const groqService = {
  isGroqConfigured,
  transcribeWithGroq,
  speechTranslateWithGroq,
  checkGrammarWithGroq,
  translateTextWithGroq,
  executeVoiceCommandWithGroq,
  askAiWithGroq,
};

export default groqService;

