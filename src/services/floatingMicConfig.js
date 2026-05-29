import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, NativeModules, Platform } from 'react-native';

/** Keep in sync with ThemeContext THEME_STORAGE_KEY / THEME_MODES */
const THEME_STORAGE_KEY = '@app_color_scheme';
const THEME_MODES = { SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' };
import { buildEasyVoiceUrl } from '../config/api';
import {
  AI_PROVIDER_API_KEY,
  AI_CHAT_API_BASE_URL,
  AI_CHAT_MODEL,
} from '../config/aiProvider';
import { TAVILY_API_KEY } from '../config/liveContextProvider';

const STORAGE_KEY = '@internal_transcribe';
/** Floating overlay: show microphone vs speech-translate; at least one must stay on (enforced in Settings + native). */
export const OVERLAY_MIC_STORAGE = '@overlay_floating_mic_enabled';
export const OVERLAY_TRANSLATION_STORAGE = '@overlay_floating_translation_enabled';
/** Floating overlay translation row: on-device ML Kit instead of /speech-translate */
export const INTERNAL_FLOATING_TRANSLATION_STORAGE = '@internal_floating_translation';
/** AsyncStorage key; default placeholder until user pastes a real key in Settings. */
export const ELEVENLABS_API_KEY_STORAGE = '@elevenlabs_api_key';
export const ELEVENLABS_API_KEY_PLACEHOLDER = 'sk_b421402b1344b82c0b9e392cb59fac86c44fa16848dac753';

/** Floating overlay: Ask Question (speech → AI reply injected as returned). Default OFF. */
export const OVERLAY_ASK_QUESTION_STORAGE = '@overlay_floating_ask_question_enabled';

const { FloatingMicModule, KeyboardModule } = NativeModules;

/**
 * Relative path on the Easy Voice server for speech → translate.
 * Update this (or pass from env) when your backend route is finalized.
 */
export const SPEECH_TRANSLATE_PATH = '/voice/speech-translate';

/** @returns {Promise<boolean>} true = on-device SpeechRecognizer; false = upload to voice API */
export async function getInternalTranscribeEnabled() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function setInternalTranscribeEnabled(enabled) {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  await syncFloatingMicSettingsToNative();
}

/** Value sent to native for STT. Unset storage → placeholder (ElevenLabs off until user saves a real key). */
export async function getElevenLabsApiKey() {
  try {
    const raw = await AsyncStorage.getItem(ELEVENLABS_API_KEY_STORAGE);
    if (raw === null) return ELEVENLABS_API_KEY_PLACEHOLDER;
    return raw;
  } catch {
    return ELEVENLABS_API_KEY_PLACEHOLDER;
  }
}

export async function setElevenLabsApiKey(apiKey) {
  await AsyncStorage.setItem(ELEVENLABS_API_KEY_STORAGE, (apiKey ?? '').trim());
  await syncFloatingMicSettingsToNative();
}

export async function getOverlayMicEnabled() {
  try {
    const raw = await AsyncStorage.getItem(OVERLAY_MIC_STORAGE);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function getOverlayTranslationEnabled() {
  try {
    const raw = await AsyncStorage.getItem(OVERLAY_TRANSLATION_STORAGE);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function setOverlayMicEnabled(enabled) {
  await AsyncStorage.setItem(OVERLAY_MIC_STORAGE, enabled ? 'true' : 'false');
  await syncFloatingMicSettingsToNative();
}

export async function setOverlayTranslationEnabled(enabled) {
  await AsyncStorage.setItem(OVERLAY_TRANSLATION_STORAGE, enabled ? 'true' : 'false');
  await syncFloatingMicSettingsToNative();
}

/** @returns {Promise<boolean>} true = floating translator uses ML Kit on Android (no audio upload). Default ON. */
export async function getInternalFloatingTranslationEnabled() {
  try {
    const raw = await AsyncStorage.getItem(INTERNAL_FLOATING_TRANSLATION_STORAGE);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function setInternalFloatingTranslationEnabled(enabled) {
  await AsyncStorage.setItem(INTERNAL_FLOATING_TRANSLATION_STORAGE, enabled ? 'true' : 'false');
  await syncFloatingMicSettingsToNative();
}

export async function getOverlayAskQuestionEnabled() {
  try {
    const raw = await AsyncStorage.getItem(OVERLAY_ASK_QUESTION_STORAGE);
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setOverlayAskQuestionEnabled(enabled) {
  await AsyncStorage.setItem(OVERLAY_ASK_QUESTION_STORAGE, enabled ? 'true' : 'false');
  await syncFloatingMicSettingsToNative();
}

/** @returns {Promise<boolean>} Whether the Android floating mic foreground service is running. */
export async function isFloatingMicServiceRunning() {
  if (Platform.OS !== 'android' || typeof FloatingMicModule?.isFloatingMicServiceRunning !== 'function') {
    return false;
  }
  try {
    return await FloatingMicModule.isFloatingMicServiceRunning();
  } catch {
    return false;
  }
}

/**
 * In-app Ask Question (Android): only the Ask Question overlay toggle under
 * Settings → Floating mic → Overlay actions must be on.
 * iOS: no floating overlay gate; allow the screen.
 */
export async function canAccessAskQuestionFeature() {
  if (Platform.OS !== 'android') {
    return true;
  }
  return getOverlayAskQuestionEnabled();
}

/** API key from `src/config/aiProvider.js` (synced to Android for floating Ask Question). */
export async function getAiProviderApiKey() {
  return (AI_PROVIDER_API_KEY ?? '').trim();
}

async function getStoredAuthUserId() {
  try {
    const raw = await AsyncStorage.getItem('@auth_user_data');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed?.userId ?? parsed?.id ?? parsed?.user?.id ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * Push auth/language settings to the Android keyboard service. The keyboard runs
 * outside React Native, so it cannot reliably read AsyncStorage directly.
 */
async function resolveKeyboardIsDark(isDarkOverride) {
  if (typeof isDarkOverride === 'boolean') return isDarkOverride;
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEME_MODES.DARK) return true;
    if (stored === THEME_MODES.LIGHT) return false;
  } catch {
    // fall through to system
  }
  return Appearance.getColorScheme() === 'dark';
}

export async function syncKeyboardSettingsToNative(userIdOverride, isDarkOverride, themeModeOverride) {
  if (typeof KeyboardModule?.syncKeyboardSettings !== 'function') return;
  try {
    const fromLang = (await AsyncStorage.getItem('@from_language')) || 'en';
    const toLang = (await AsyncStorage.getItem('@to_language')) || 'ta';
    const userId =
      userIdOverride !== undefined && userIdOverride !== null
        ? String(userIdOverride).trim()
        : await getStoredAuthUserId();

    if (Platform.OS === 'ios') {
      await KeyboardModule.syncKeyboardSettings(userId, fromLang, toLang);
      return;
    }

    if (Platform.OS !== 'android') return;

    const isDark = await resolveKeyboardIsDark(isDarkOverride);
    let themeMode = themeModeOverride;
    if (themeMode !== THEME_MODES.LIGHT && themeMode !== THEME_MODES.DARK && themeMode !== THEME_MODES.SYSTEM) {
      themeMode = THEME_MODES.SYSTEM;
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === THEME_MODES.LIGHT || stored === THEME_MODES.DARK || stored === THEME_MODES.SYSTEM) {
          themeMode = stored;
        }
      } catch {
        // default system
      }
    }
    await KeyboardModule.syncKeyboardSettings(userId, fromLang, toLang, isDark, themeMode);
  } catch (e) {
    console.warn('[floatingMicConfig] keyboard sync failed:', e?.message || e);
  }
}

export async function syncTranslationLanguagesFromKeyboard() {
  if (typeof KeyboardModule?.getKeyboardSettings !== 'function') {
    const fromLang = (await AsyncStorage.getItem('@from_language')) || 'en';
    const toLang = (await AsyncStorage.getItem('@to_language')) || 'ta';
    return { fromLang, toLang, changed: false };
  }

  try {
    const currentFrom = (await AsyncStorage.getItem('@from_language')) || 'en';
    const currentTo = (await AsyncStorage.getItem('@to_language')) || 'ta';
    const native = await KeyboardModule.getKeyboardSettings();
    const fromLang = (native?.hasFromLang ? native?.fromLang : currentFrom || 'en').trim();
    const toLang = (native?.hasToLang ? native?.toLang : currentTo || 'ta').trim();
    const changed = fromLang !== currentFrom || toLang !== currentTo;

    if (changed) {
      await AsyncStorage.setItem('@from_language', fromLang);
      await AsyncStorage.setItem('@to_language', toLang);
      await syncFloatingMicSettingsToNative();
    } else if (!native?.hasFromLang || !native?.hasToLang) {
      await syncKeyboardSettingsToNative();
    }

    return { fromLang, toLang, changed };
  } catch (e) {
    console.warn('[floatingMicConfig] keyboard language pull failed:', e?.message || e);
    const fromLang = (await AsyncStorage.getItem('@from_language')) || 'en';
    const toLang = (await AsyncStorage.getItem('@to_language')) || 'ta';
    return { fromLang, toLang, changed: false };
  }
}

/**
 * Push mode, voice base URL, translate path, and Settings languages to Android
 * so the overlay works over other apps without JS.
 */
export async function syncFloatingMicSettingsToNative() {
  try {
    if (Platform.OS !== 'android') return;
    const internal = await getInternalTranscribeEnabled();
    const baseUrl = buildEasyVoiceUrl('');
    const fromLang = (await AsyncStorage.getItem('@from_language')) || 'en';
    const toLang = (await AsyncStorage.getItem('@to_language')) || 'ta';
    const elevenLabsKey = await getElevenLabsApiKey();
    let overlayMic = await getOverlayMicEnabled();
    let overlayTranslation = await getOverlayTranslationEnabled();
    const overlayAskQuestion = await getOverlayAskQuestionEnabled();
    const internalFloatingTranslation = await getInternalFloatingTranslationEnabled();
    const aiProviderApiKey = await getAiProviderApiKey();
    const tavilyApiKey = (TAVILY_API_KEY ?? '').trim();
    if (!overlayMic && !overlayTranslation && !overlayAskQuestion) {
      overlayMic = true;
      overlayTranslation = false;
      await AsyncStorage.setItem(OVERLAY_MIC_STORAGE, 'true');
      await AsyncStorage.setItem(OVERLAY_TRANSLATION_STORAGE, 'false');
    }
    if (typeof FloatingMicModule?.syncFloatingMicSettings === 'function') {
      await FloatingMicModule.syncFloatingMicSettings(
        internal,
        baseUrl,
        SPEECH_TRANSLATE_PATH,
        fromLang,
        toLang,
        elevenLabsKey,
        overlayMic,
        overlayTranslation,
        internalFloatingTranslation,
        overlayAskQuestion,
        aiProviderApiKey,
        (AI_CHAT_API_BASE_URL ?? '').trim(),
        (AI_CHAT_MODEL ?? '').trim(),
        tavilyApiKey,
      );
    }
  } catch (e) {
    console.warn('[floatingMicConfig] sync to native failed:', e?.message || e);
  } finally {
    await syncKeyboardSettingsToNative();
  }
}
