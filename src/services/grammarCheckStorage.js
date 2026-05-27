import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import {
  LOCAL_HISTORY_RETENTION_MS,
  filterEntriesWithinRetention,
} from '../utils/localHistoryRetention';

export const GRAMMAR_HISTORY_UPDATED_EVENT = 'GrammarCheckHistoryUpdated';

const HISTORY_KEY = '@grammar_check_history';
const SAVED_KEY = '@grammar_check_saved';
const MAX_HISTORY = 80;

export function getGrammarPairKey(inputText, correctedText) {
  return `${String(inputText).trim()}|${String(correctedText).trim()}`.slice(0, 400);
}

async function persistHistoryIfChanged(prev, pruned) {
  if (pruned.length === prev.length) return;
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
  } catch (e) {
    console.warn('[grammarCheckStorage] persist prune', e);
  }
}

export async function getGrammarHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    const pruned = filterEntriesWithinRetention(arr, LOCAL_HISTORY_RETENTION_MS);
    await persistHistoryIfChanged(arr, pruned);
    return pruned;
  } catch {
    return [];
  }
}

export async function deleteGrammarHistoryEntry(id) {
  try {
    const list = await getGrammarHistory();
    const next = list.filter((item) => item.id !== id);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    DeviceEventEmitter.emit(GRAMMAR_HISTORY_UPDATED_EVENT);
    return { success: true };
  } catch (e) {
    console.warn('[grammarCheckStorage] deleteGrammarHistoryEntry', e);
    return { success: false, error: e?.message || 'Could not delete' };
  }
}

export async function addGrammarHistory({ inputText, correctedText }) {
  const i = String(inputText ?? '').trim();
  const c = String(correctedText ?? '').trim();
  if (!i || !c) return;
  try {
    const prev = await getGrammarHistory();
    const id = String(Date.now());
    const item = {
      id,
      inputText: i,
      correctedText: c,
      createdAt: new Date().toISOString(),
    };
    const merged = [item, ...prev.filter((p) => p.inputText !== i || p.correctedText !== c)];
    const pruned = filterEntriesWithinRetention(merged, LOCAL_HISTORY_RETENTION_MS);
    const next = pruned.slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    DeviceEventEmitter.emit(GRAMMAR_HISTORY_UPDATED_EVENT);
  } catch (e) {
    console.warn('[grammarCheckStorage] addGrammarHistory', e);
  }
}

export async function getSavedGrammar() {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function isGrammarSaved(inputText, correctedText) {
  const key = getGrammarPairKey(inputText, correctedText);
  const list = await getSavedGrammar();
  return list.some((s) => s.key === key);
}

export async function toggleSavedGrammar({ inputText, correctedText }) {
  const key = getGrammarPairKey(inputText, correctedText);
  const list = await getSavedGrammar();
  const idx = list.findIndex((s) => s.key === key);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({
      key,
      id: String(Date.now()),
      inputText: String(inputText ?? '').trim(),
      correctedText: String(correctedText ?? '').trim(),
      createdAt: new Date().toISOString(),
    });
  }
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
  return idx < 0;
}
