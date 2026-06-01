import logger from '../utils/logger';
import NativeAudioService from './NativeAudioService';
import { transcribeBySettings } from './transcribeService';

/**
 * Translator mic: start native recording (same stack as Voice Command).
 * @returns {Promise<{ success: boolean, filePath?: string, error?: string }>}
 */
export async function startTranslatorRecording() {
  logger.debug('[speechService] startTranslatorRecording');
  try {
    if (NativeAudioService.isRecording) {
      return { success: false, error: 'Already recording' };
    }
    const result = await NativeAudioService.startRecording();
    if (!result.success) {
      return { success: false, error: result.error || 'Could not start recording' };
    }
    return { success: true, filePath: result.filePath };
  } catch (e) {
    logger.warn('[speechService] start failed', e);
    return { success: false, error: e?.message || 'Recording failed to start' };
  }
}

/**
 * Stop recording and transcribe. Requests English transcript for the ML Kit voice pipeline.
 *
 * @param {object} [opts]
 * @param {string} [opts.language='en-US'] - BCP-47 tag passed to your transcribe backend
 * @returns {Promise<{ success: boolean, transcript?: string, error?: string }>}
 */
export async function stopTranslatorRecordingAndTranscribe(opts = {}) {
  const language = opts.language ?? 'en-US';
  logger.debug('[speechService] stop + transcribe, language=', language);

  try {
    if (!NativeAudioService.isRecording) {
      return { success: false, error: 'No active recording' };
    }

    const stop = await NativeAudioService.stopRecording();
    if (!stop.success || !stop.filePath) {
      return { success: false, error: stop.error || 'Failed to stop recording' };
    }

    const filePath = stop.filePath;
    logger.debug('[speechService] transcribe file', filePath);

    const tx = await transcribeBySettings(filePath, {
      language,
      enablePunctuation: true,
      enableTimestamps: false,
    });

    if (!tx.success) {
      return { success: false, error: tx.error || 'Transcription failed' };
    }

    const transcript =
      (tx.data?.refinedTranscript || tx.data?.rawTranscript || '').trim();
    if (!transcript) {
      return { success: false, error: 'No speech detected. Try again.' };
    }

    logger.debug('[speechService] transcript length=', transcript.length);
    return { success: true, transcript };
  } catch (e) {
    logger.warn('[speechService] stop/transcribe error', e);
    return { success: false, error: e?.message || 'Transcription failed' };
  }
}
