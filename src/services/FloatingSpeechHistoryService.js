import AsyncStorage from '@react-native-async-storage/async-storage';
import { FileSystem, Dirs } from 'react-native-file-access';
import { DeviceEventEmitter } from 'react-native';
import {
  LOCAL_HISTORY_RETENTION_MS,
  filterEntriesWithinRetention,
} from '../utils/localHistoryRetention';

const STORAGE_KEY = '@floating_speech_history';
const LEGACY_HISTORY_PATH = `${Dirs.DocumentDir}/floating_speech_history.json`;
const MAX_ENTRIES = 500;

export const FLOATING_SPEECH_UPDATED_EVENT = 'FloatingSpeechHistoryUpdated';

const normalizeText = (payload) => {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload === 'object' && payload.text != null) return String(payload.text).trim();
  return String(payload).trim();
};

async function migrateLegacyFileIfNeeded() {
  try {
    const exists = await FileSystem.exists(LEGACY_HISTORY_PATH);
    if (!exists) return [];
    const raw = await FileSystem.readFile(LEGACY_HISTORY_PATH);
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    const pruned = filterEntriesWithinRetention(arr, LOCAL_HISTORY_RETENTION_MS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    await FileSystem.unlink(LEGACY_HISTORY_PATH).catch(() => undefined);
    return pruned;
  } catch (e) {
    console.warn('[FloatingSpeechHistory] legacy migrate:', e);
    return [];
  }
}

export const FloatingSpeechHistoryService = {
  async getAll() {
    try {
      const fromStorage = await AsyncStorage.getItem(STORAGE_KEY);
      if (fromStorage != null) {
        const parsed = JSON.parse(fromStorage);
        const arr = Array.isArray(parsed) ? parsed : [];
        const pruned = filterEntriesWithinRetention(arr, LOCAL_HISTORY_RETENTION_MS);
        if (pruned.length !== arr.length) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
        }
        console.log('📚 FloatingSpeechHistoryService: Retrieved entries from storage:', pruned.length);
        return pruned;
      }
      console.log('📚 FloatingSpeechHistoryService: No entries in storage, checking legacy...');
      return await migrateLegacyFileIfNeeded();
    } catch (e) {
      console.error('[FloatingSpeechHistory] getAll:', e);
      return [];
    }
  },

  async appendFromFloatingMic(textPayload) {
    const text = normalizeText(textPayload);
    if (!text) return { success: false };

    try {
      console.log('📝 FloatingSpeechHistoryService: Saving transcription:', text);
      const entries = await this.getAll();
      entries.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        text,
        createdAt: new Date().toISOString(),
        source: 'floating_mic',
      });
      const fresh = filterEntriesWithinRetention(entries, LOCAL_HISTORY_RETENTION_MS);
      const trimmed = fresh.slice(-MAX_ENTRIES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      console.log('💾 FloatingSpeechHistoryService: Saved successfully. Total entries:', trimmed.length);
      DeviceEventEmitter.emit(FLOATING_SPEECH_UPDATED_EVENT);
      return { success: true };
    } catch (e) {
      console.error('[FloatingSpeechHistory] append:', e);
      return { success: false, error: e.message };
    }
  },

  async deleteEntry(id) {
    try {
      const entries = await this.getAll();
      const next = entries.filter((e) => e.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      DeviceEventEmitter.emit(FLOATING_SPEECH_UPDATED_EVENT);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async clearAll() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      DeviceEventEmitter.emit(FLOATING_SPEECH_UPDATED_EVENT);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};
