import { Platform } from 'react-native';
import TranslateText from '@react-native-ml-kit/translate-text';
import { appLanguageToMlKit, isAppLanguageSupportedByMlKit } from './mlKitLanguageMap';

/** @type {Set<string>} language pairs that already completed download this app session */
const downloadedModelPairs = new Set();

function pairKey(sourceMl, targetMl) {
  return `${sourceMl}|${targetMl}`;
}

/**
 * @param {unknown} err
 */
function formatMlKitError(err) {
  const msg = err?.message || err?.userInfo?.NSLocalizedDescription || String(err);
  if (/network|download|wifi/i.test(msg)) {
    return `Model download failed. Connect to the internet once to download language models, then you can translate offline.\n${msg}`;
  }
  return msg || 'Translation failed';
}

/**
 * On-device translation via Google ML Kit (Android only in this project — iOS pod is a stub).
 *
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.sourceAppCode - e.g. 'en'
 * @param {string} params.targetAppCode - e.g. 'es'
 * @returns {Promise<{ success: true, translatedText: string } | { success: false, error: string }>}
 */
export async function translateOffline({
  text,
  sourceAppCode,
  targetAppCode,
}) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return { success: false, error: 'Nothing to translate' };
  }

  if (Platform.OS !== 'android') {
    console.warn('[translationService] ML Kit translate is only wired on Android (iOS native module is not implemented).');
    return {
      success: false,
      error: 'On-device translation (ML Kit) is only available on Android in this build.',
    };
  }

  const sourceMl = appLanguageToMlKit(sourceAppCode);
  const targetMl = appLanguageToMlKit(targetAppCode);

  if (!sourceMl) {
    return {
      success: false,
      error: `Source language "${sourceAppCode}" is not supported for on-device translation. Try another language in Settings.`,
    };
  }
  if (!targetMl) {
    return {
      success: false,
      error: `Target language "${targetAppCode}" is not supported for on-device translation. Try another language in Settings.`,
    };
  }

  if (sourceMl === targetMl) {
    console.log('[translationService] source === target, returning original text');
    return { success: true, translatedText: trimmed };
  }

  const key = pairKey(sourceMl, targetMl);
  const needDownload = !downloadedModelPairs.has(key);

  console.log('[translationService] translate', {
    sourceAppCode,
    targetAppCode,
    sourceMl,
    targetMl,
    needDownload,
    length: trimmed.length,
  });

  try {
    const raw = await TranslateText.translate({
      text: trimmed,
      sourceLanguage: sourceMl,
      targetLanguage: targetMl,
      downloadModelIfNeeded: needDownload,
      requireWifi: false,
      requireCharging: false,
    });

    const translatedText =
      typeof raw === 'string' ? raw : raw != null && typeof raw === 'object' && 'translatedText' in raw ? String(raw.translatedText) : String(raw ?? '');

    if (!translatedText) {
      return { success: false, error: 'Translation returned empty text' };
    }

    downloadedModelPairs.add(key);
    console.log('[translationService] OK, cached pair', key);
    return { success: true, translatedText };
  } catch (e) {
    console.warn('[translationService] ML Kit error', e);
    return { success: false, error: formatMlKitError(e) };
  }
}

/**
 * Voice pipeline: STT is requested in English; result is translated to the selected target.
 */
export function translateEnglishToTarget(englishText, targetAppCode) {
  return translateOffline({
    text: englishText,
    sourceAppCode: 'en',
    targetAppCode,
  });
}

export { isAppLanguageSupportedByMlKit };
