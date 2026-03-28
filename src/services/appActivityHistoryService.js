import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import {
  LOCAL_HISTORY_RETENTION_MS,
  filterEntriesWithinRetention,
} from '../utils/localHistoryRetention';

const STORAGE_KEY = '@app_activity_history';
const MAX_ENTRIES = 800;

export const ACTIVITY_HISTORY_UPDATED_EVENT = 'AppActivityHistoryUpdated';

/** Use these categories so each history screen can filter its own log. */
export const ActivityCategory = {
  FLOATING_MIC: 'floating_mic',
  VOICE_RECORDER: 'voice_recorder',
  RECORDINGS: 'recordings',
  TRANSLATOR: 'translator',
  SETTINGS: 'settings',
};

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    const pruned = filterEntriesWithinRetention(arr, LOCAL_HISTORY_RETENTION_MS);
    if (pruned.length !== arr.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
      DeviceEventEmitter.emit(ACTIVITY_HISTORY_UPDATED_EVENT);
    }
    return pruned;
  } catch {
    return [];
  }
}

async function writeAll(entries) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  DeviceEventEmitter.emit(ACTIVITY_HISTORY_UPDATED_EVENT);
}

/**
 * @param {string} category - ActivityCategory.*
 * @param {string} action - machine-readable action id
 * @param {{ label?: string, meta?: string }} [details]
 */
export async function logActivity(category, action, details = {}) {
  try {
    const entries = await readAll();
    const label =
      details.label != null && String(details.label).trim() !== ''
        ? String(details.label).trim()
        : humanizeAction(action);
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      category,
      action,
      label: label.slice(0, 500),
      meta: details.meta != null ? String(details.meta).slice(0, 1000) : undefined,
      createdAt: new Date().toISOString(),
    };
    entries.push(entry);
    const pruned = filterEntriesWithinRetention(entries, LOCAL_HISTORY_RETENTION_MS);
    const trimmed = pruned.slice(-MAX_ENTRIES);
    await writeAll(trimmed);
    return { success: true, entry };
  } catch (e) {
    console.warn('[appActivityHistory]', e);
    return { success: false, error: e?.message };
  }
}

function humanizeAction(action) {
  if (!action) return 'Activity';
  return String(action)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getByCategory(category, limit = 400) {
  const all = await readAll();
  return all
    .filter((e) => e.category === category)
    .slice(-limit)
    .reverse();
}

/** Newest first, all categories (e.g. Home dashboard). */
export async function getAllRecent(limit = 50) {
  const all = await readAll();
  return all.slice(-limit).reverse();
}

export async function deleteEntry(id) {
  const all = await readAll();
  const next = all.filter((e) => e.id !== id);
  await writeAll(next);
  return { success: true };
}

export async function clearCategory(category) {
  const all = await readAll();
  const next = all.filter((e) => e.category !== category);
  await writeAll(next);
  return { success: true };
}

export async function clearAll() {
  await writeAll([]);
  return { success: true };
}
