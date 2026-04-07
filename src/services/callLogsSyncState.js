import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@call_logs_synced_ids';

async function readSet() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return new Set();
    }
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function getSyncedCallLogIdSet() {
  return readSet();
}

export async function isCallLogIdSynced(callLogId) {
  const s = await readSet();
  return s.has(String(callLogId));
}

export async function markCallLogIdsSynced(ids) {
  if (!ids?.length) {
    return;
  }
  const s = await readSet();
  for (const id of ids) {
    s.add(String(id));
  }
  await AsyncStorage.setItem(KEY, JSON.stringify([...s]));
}
