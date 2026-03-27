/**
 * Single list for Settings translation pickers and Translator screen labels.
 * Codes match AsyncStorage @from_language / @to_language.
 */
export const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ach', name: 'Acholi' },
];

export function getLanguageName(code) {
  const found = TRANSLATION_LANGUAGES.find((l) => l.code === code);
  return found?.name || code?.toUpperCase() || '—';
}
