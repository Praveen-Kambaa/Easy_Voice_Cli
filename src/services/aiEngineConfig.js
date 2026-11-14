import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, DeviceEventEmitter } from 'react-native';

export const AI_ENGINE_KEY = '@ai_engine_provider';
export const AI_ENGINE_CHANGED_EVENT = 'AI_ENGINE_PROVIDER_CHANGED';

export const AI_ENGINES = {
  DEFAULT: 'default',
  GROQ: 'groq',
};

/**
 * Returns the currently active AI engine provider ('default' | 'groq').
 * Defaults to 'default'.
 */
export async function getAiEngineProvider() {
  try {
    const val = await AsyncStorage.getItem(AI_ENGINE_KEY);
    if (val === 'groq') return 'groq';
    return 'default';
  } catch {
    return 'default';
  }
}

/**
 * Persists selected AI engine provider to AsyncStorage and syncs immediately
 * to Android SharedPreferences ("TypeEasyPrefs") via NativeModule.
 *
 * @param {'default' | 'groq'} provider
 */
export async function setAiEngineProvider(provider) {
  const normalized = provider === 'groq' ? 'groq' : 'default';
  try {
    await AsyncStorage.setItem(AI_ENGINE_KEY, normalized);
  } catch {
    // ignore
  }

  try {
    if (NativeModules.FloatingMicModule?.setAiEngineProvider) {
      await NativeModules.FloatingMicModule.setAiEngineProvider(normalized);
    }
  } catch {
    // ignore
  }

  DeviceEventEmitter.emit(AI_ENGINE_CHANGED_EVENT, normalized);
  return normalized;
}

