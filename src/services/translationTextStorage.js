import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@translator_text_history';
const SAVED_KEY = '@translator_text_saved';
const MAX_HISTORY = 80;

function entryId(sourceText, fromCode, toCode) {
  return `${fromCode}|${toCode}|${sourceText}`.slice(0, 200);
}

export async function getTranslationHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addTranslationHistory(entry) {
  try {
    const prev = await getTranslationHistory();
    const id = String(Date.now());
    const item = {
      id,
      sourceText: entry.sourceText,
      translatedText: entry.translatedText,
      fromCode: entry.fromCode,
      toCode: entry.toCode,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...prev.filter((p) => p.sourceText !== entry.sourceText || p.toCode !== entry.toCode)].slice(
      0,
      MAX_HISTORY,
    );
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[translationTextStorage] addTranslationHistory', e);
  }
}

export async function getSavedTranslations() {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function isTranslationSaved(sourceText, fromCode, toCode) {
  const key = entryId(sourceText, fromCode, toCode);
  const list = await getSavedTranslations();
  return list.some((s) => s.key === key);
}

export async function toggleSavedTranslation({ sourceText, translatedText, fromCode, toCode }) {
  const key = entryId(sourceText, fromCode, toCode);
  const list = await getSavedTranslations();
  const idx = list.findIndex((s) => s.key === key);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({
      key,
      id: String(Date.now()),
      sourceText,
      translatedText,
      fromCode,
      toCode,
      createdAt: new Date().toISOString(),
    });
  }
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
  return idx < 0;
}
