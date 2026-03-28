/**
 * BCP-47 tags for react-native-tts (target language of the translation).
 */
const CODE_TO_LOCALE = {
  af: 'af-ZA',
  sq: 'sq-AL',
  ar: 'ar-SA',
  be: 'be-BY',
  bn: 'bn-BD',
  bg: 'bg-BG',
  ca: 'ca-ES',
  zh: 'zh-CN',
  hr: 'hr-HR',
  cs: 'cs-CZ',
  da: 'da-DK',
  nl: 'nl-NL',
  en: 'en-US',
  eo: 'en-US',
  et: 'et-EE',
  fi: 'fi-FI',
  fr: 'fr-FR',
  gl: 'gl-ES',
  ka: 'ka-GE',
  de: 'de-DE',
  el: 'el-GR',
  gu: 'gu-IN',
  ht: 'ht-HT',
  he: 'he-IL',
  hi: 'hi-IN',
  hu: 'hu-HU',
  is: 'is-IS',
  id: 'id-ID',
  ga: 'ga-IE',
  it: 'it-IT',
  ja: 'ja-JP',
  kn: 'kn-IN',
  ko: 'ko-KR',
  lv: 'lv-LV',
  lt: 'lt-LT',
  mk: 'mk-MK',
  ms: 'ms-MY',
  mt: 'mt-MT',
  mr: 'mr-IN',
  no: 'nb-NO',
  fa: 'fa-IR',
  pl: 'pl-PL',
  pt: 'pt-BR',
  ro: 'ro-RO',
  ru: 'ru-RU',
  sk: 'sk-SK',
  sl: 'sl-SI',
  es: 'es-ES',
  sv: 'sv-SE',
  sw: 'sw-KE',
  tl: 'fil-PH',
  ta: 'ta-IN',
  te: 'te-IN',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  ur: 'ur-PK',
  vi: 'vi-VN',
  cy: 'cy-GB',
};

/**
 * @param {string} appCode - ISO 639-1 from translation languages
 * @returns {string}
 */
export function appCodeToTtsLocale(appCode) {
  if (!appCode || typeof appCode !== 'string') return 'en-US';
  const key = appCode.trim().toLowerCase();
  return CODE_TO_LOCALE[key] || key || 'en-US';
}
