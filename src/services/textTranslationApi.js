import { buildEasyVoiceUrl, API_ENDPOINTS } from '../config/api';

/**
 * Calls the Easy Voice text translation endpoint.
 * Update `extractTranslatedText` if your backend returns a different JSON shape.
 */
export async function translateText({ text, sourceLanguage, targetLanguage }) {
  const url = buildEasyVoiceUrl(API_ENDPOINTS.VOICE.TEXT_TRANSLATE);
  const body = {
    text: text.trim(),
    sourceLanguage,
    targetLanguage,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const msg =
      data.message ||
      data.error ||
      `Translation failed (${response.status}). Check API route and server.`;
    throw new Error(msg);
  }

  if (data.success === false) {
    throw new Error(data.message || 'Translation failed');
  }

  const translated = extractTranslatedText(data);
  if (translated == null || translated === '') {
    throw new Error('Unexpected response: no translated text');
  }
  return translated;
}

function extractTranslatedText(data) {
  if (typeof data === 'string') return data;
  if (data.translatedText != null) return String(data.translatedText);
  if (data.translation != null) return String(data.translation);
  if (data.translated != null) return String(data.translated);
  if (data.result != null) return String(data.result);
  if (data.text != null) return String(data.text);
  if (data.data?.translatedText != null) return String(data.data.translatedText);
  if (data.data?.text != null) return String(data.data.text);
  return null;
}
