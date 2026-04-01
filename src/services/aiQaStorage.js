import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import {
  LOCAL_HISTORY_RETENTION_MS,
  filterEntriesWithinRetention,
} from '../utils/localHistoryRetention';

const HISTORY_KEY = '@ai_qa_history';
const SAVED_KEY = '@ai_qa_saved';
const MAX_HISTORY = 80;

export function getAiQaPairKey(question, answer) {
  return `${String(question).trim()}|${String(answer).trim()}`.slice(0, 400);
}

async function persistHistoryIfChanged(prev, pruned) {
  if (pruned.length === prev.length) return;
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
  } catch (e) {
    console.warn('[aiQaStorage] persist prune', e);
  }
}

export async function getAiQaHistory() {
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

export async function deleteAiQaHistoryEntry(id) {
  try {
    const list = await getAiQaHistory();
    const next = list.filter((item) => item.id !== id);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    DeviceEventEmitter.emit(AI_QA_HISTORY_UPDATED_EVENT);
    return { success: true };
  } catch (e) {
    console.warn('[aiQaStorage] deleteAiQaHistoryEntry', e);
    return { success: false, error: e?.message || 'Could not delete' };
  }
}

export async function addAiQaHistory({ question, answer }) {
  const q = String(question ?? '').trim();
  const a = String(answer ?? '').trim();
  if (!q || !a) return;
  try {
    const prev = await getAiQaHistory();
    const id = String(Date.now());
    const item = {
      id,
      question: q,
      answer: a,
      createdAt: new Date().toISOString(),
    };
    const merged = [item, ...prev.filter((p) => p.question !== q || p.answer !== a)];
    const pruned = filterEntriesWithinRetention(merged, LOCAL_HISTORY_RETENTION_MS);
    const next = pruned.slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    DeviceEventEmitter.emit(AI_QA_HISTORY_UPDATED_EVENT);
  } catch (e) {
    console.warn('[aiQaStorage] addAiQaHistory', e);
  }
}

export async function getSavedAiQa() {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function isAiQaSaved(question, answer) {
  const key = entryKey(question, answer);
  const list = await getSavedAiQa();
  return list.some((s) => s.key === key);
}

export async function toggleSavedAiQa({ question, answer }) {
  const key = getAiQaPairKey(question, answer);
  const list = await getSavedAiQa();
  const idx = list.findIndex((s) => s.key === key);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({
      key,
      id: String(Date.now()),
      question: String(question ?? '').trim(),
      answer: String(answer ?? '').trim(),
      createdAt: new Date().toISOString(),
    });
  }
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
  return idx < 0;
}
