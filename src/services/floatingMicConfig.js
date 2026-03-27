import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { buildEasyVoiceUrl } from '../config/api';

const STORAGE_KEY = '@internal_transcribe';
/** AsyncStorage key; default placeholder until user pastes a real key in Settings. */
export const ELEVENLABS_API_KEY_STORAGE = '@elevenlabs_api_key';
export const ELEVENLABS_API_KEY_PLACEHOLDER = 'sk_b421402b1344b82c0b9e392cb59fac86c44fa16848dac753';

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
    if (typeof FloatingMicModule?.syncFloatingMicSettings === 'function') {
      await FloatingMicModule.syncFloatingMicSettings(
        internal,
        baseUrl,
        SPEECH_TRANSLATE_PATH,
        fromLang,
        toLang,
        elevenLabsKey,
      );
    }
  } catch (e) {
    console.warn('[floatingMicConfig] sync to native failed:', e?.message || e);
  }
}
