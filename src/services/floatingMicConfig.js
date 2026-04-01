import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { buildEasyVoiceUrl } from '../config/api';
import {
  AI_PROVIDER_API_KEY,
  AI_CHAT_API_BASE_URL,
  AI_CHAT_MODEL,
} from '../config/aiProvider';

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

const { FloatingMicModule } = NativeModules;

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

/** @returns {Promise<boolean>} true = floating translator uses ML Kit on Android (no audio upload) */
export async function getInternalFloatingTranslationEnabled() {
  try {
    const raw = await AsyncStorage.getItem(INTERNAL_FLOATING_TRANSLATION_STORAGE);
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
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
 * In-app Ask Question (Android): requires the floating mic foreground service to be running (Floating Mic screen → Start)
 * and the Ask Question overlay toggle under Settings → FLOATING MIC → Overlay actions.
 * iOS: no floating service; allow the screen.
 */
export async function canAccessAskQuestionFeature() {
  if (Platform.OS !== 'android') {
    return true;
  }
  const [askQuestionOverlay, serviceRunning] = await Promise.all([
    getOverlayAskQuestionEnabled(),
    isFloatingMicServiceRunning(),
  ]);
  return askQuestionOverlay && serviceRunning;
}

/** API key from `src/config/aiProvider.js` (synced to Android for floating Ask Question). */
export async function getAiProviderApiKey() {
  return (AI_PROVIDER_API_KEY ?? '').trim();
}

/**
 * Push mode, voice base URL, translate path, and Settings languages to Android
 * so the overlay works over other apps without JS.
 */
export async function syncFloatingMicSettingsToNative() {
  if (Platform.OS !== 'android') return;
  try {
    const internal = await getInternalTranscribeEnabled();
    const baseUrl = buildEasyVoiceUrl('');
    const fromLang = (await AsyncStorage.getItem('@from_language')) || 'en';
    const toLang = (await AsyncStorage.getItem('@to_language')) || 'es';
    const elevenLabsKey = await getElevenLabsApiKey();
    let overlayMic = await getOverlayMicEnabled();
    let overlayTranslation = await getOverlayTranslationEnabled();
    const overlayAskQuestion = await getOverlayAskQuestionEnabled();
    const internalFloatingTranslation = await getInternalFloatingTranslationEnabled();
    const aiProviderApiKey = await getAiProviderApiKey();
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
      );
    }
  } catch (e) {
    console.warn('[floatingMicConfig] sync to native failed:', e?.message || e);
  }
}
