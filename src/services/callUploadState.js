import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@call_recordings_uploaded_paths';

async function readSet() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return new Set();
    }
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export async function isPathUploaded(audioPath) {
  const s = await readSet();
  return s.has(audioPath);
}

export async function markPathUploaded(audioPath) {
  const s = await readSet();
  s.add(audioPath);
  await AsyncStorage.setItem(KEY, JSON.stringify([...s]));
}

export async function clearUploadMarks() {
  await AsyncStorage.removeItem(KEY);
}
