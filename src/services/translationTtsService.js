import { Platform } from 'react-native';
import Tts from 'react-native-tts';
import { appCodeToTtsLocale } from '../constants/ttsLanguageLocales';

let configured = false;

/**
 * react-native-tts `stop()` uses a BOOL on iOS; RN New Architecture cannot bridge it
 * (crashes even with `false`). Skip native stop on iOS — `speak()` replaces playback.
 */
function stopTts() {
  if (Platform.OS === 'ios') {
    return Promise.resolve();
  }
  return Tts.stop();
}

async function ensureReady() {
  if (Platform.OS === 'android') {
    await Tts.getInitStatus();
  }
  if (!configured) {
    // setDefaultRate uses BOOL on iOS native bridge — only safe after TextToSpeech.m patch (RN New Arch).
    if (Platform.OS === 'android') {
      try {
        await Tts.setDefaultRate(0.48);
      } catch {
        // ignore
      }
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
    await stopTts();
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
  return stopTts().catch(() => undefined);
}
