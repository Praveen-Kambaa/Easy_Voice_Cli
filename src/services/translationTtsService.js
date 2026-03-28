import { Platform } from 'react-native';
import Tts from 'react-native-tts';
import { appCodeToTtsLocale } from '../constants/ttsLanguageLocales';

let configured = false;

async function ensureReady() {
  if (Platform.OS === 'android') {
    await Tts.getInitStatus();
  }
  if (!configured) {
    try {
      await Tts.setDefaultRate(0.48);
    } catch {
      // ignore
    }
    configured = true;
  }
}

/**
 * Speak translated text in a voice suited to the target language.
 * @param {string} text
 * @param {string} targetAppCode
 * @returns {Promise<{ success: true } | { success: false, error: string }>}
 */
export async function speakTranslatedText(text, targetAppCode) {
  const t = (text ?? '').trim();
  if (!t) {
    return { success: false, error: 'Nothing to read aloud' };
  }
  try {
    await ensureReady();
    await Tts.stop();
    const locale = appCodeToTtsLocale(targetAppCode);
    await Tts.setDefaultLanguage(locale);
    await Tts.speak(t);
    return { success: true };
  } catch (e) {
    const msg = e?.message || String(e);
    return { success: false, error: msg || 'Text-to-speech failed' };
  }
}

export function stopTranslationSpeech() {
  return Tts.stop().catch(() => undefined);
}
