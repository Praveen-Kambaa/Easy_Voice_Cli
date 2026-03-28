import { TranslateLanguage } from '@react-native-ml-kit/translate-text';

/**
 * ISO codes supported by the linked ML Kit module (stays in sync with TranslateLanguage enum values).
 * @type {Readonly<Record<string, string>>}
 */
const ISO_BY_LOWER = (() => {
  /** @type {Record<string, string>} */
  const m = {};
  Object.keys(TranslateLanguage).forEach((key) => {
    const val = TranslateLanguage[key];
    // String enums: value is ISO code (2 letters). Skip any reverse/name entries.
    if (typeof val === 'string' && /^[a-z]{2}$/i.test(val)) {
      m[val.toLowerCase()] = val;
    }
  });
  return m;
})();

/**
 * @param {string} appCode
 * @returns {string | null} ML Kit language code, or null if unknown
 */
export function appLanguageToMlKit(appCode) {
  if (!appCode || typeof appCode !== 'string') return null;
  const key = appCode.trim().toLowerCase();
  return ISO_BY_LOWER[key] ?? null;
}

export function isAppLanguageSupportedByMlKit(appCode) {
  return appLanguageToMlKit(appCode) != null;
}
