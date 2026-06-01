import { NativeModules, Platform } from 'react-native';
import { transcribeAudio } from '../api/voiceApi';
import { createResponse } from '../utils/apiResponse';
import { transcribeWithElevenLabs } from './elevenlabsService';
import { offlineWhisperService } from './offlineWhisperService';
import {
  getInternalTranscribeEnabled,
  getElevenLabsApiKey,
  ELEVENLABS_API_KEY_PLACEHOLDER,
} from './floatingMicConfig';

function toWhisperLanguage(language) {
  if (!language || String(language).toLowerCase() === 'auto') return 'auto';
  const code = String(language).split(/[-_]/)[0].toLowerCase();
  return code || 'auto';
}

async function prepareAudioForWhisper(fileUri) {
  let path = fileUri;
  if (
    Platform.OS === 'android' &&
    typeof NativeModules.AudioTranscodeModule?.convertToWav16kMono === 'function'
  ) {
    try {
      const wav = await NativeModules.AudioTranscodeModule.convertToWav16kMono(fileUri);
      if (wav) path = wav;
    } catch {
      // use original file
    }
  }
  return path;
}

/**
 * On-device transcription (Whisper). Android only.
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function transcribeOnDevice(fileUri, options = {}) {
  if (Platform.OS !== 'android') {
    return createResponse(
      false,
      null,
      'On-device transcription is only available on Android in this build.',
    );
  }
  try {
    const audioPath = await prepareAudioForWhisper(fileUri);
    const text = String(
      (await offlineWhisperService.transcribeFile(audioPath, {
        language: toWhisperLanguage(options.language),
        onModelDownloadProgress: options.onModelDownloadProgress,
      })) ?? '',
    ).trim();
    if (!text) {
      return createResponse(false, null, 'No speech detected.');
    }
    return createResponse(true, {
      rawTranscript: text,
      refinedTranscript: text,
      voiceAssetId: null,
      provider: 'whisper',
    });
  } catch (e) {
    return createResponse(false, null, e?.message || 'On-device transcription failed');
  }
}

/**
 * Cloud transcription via ElevenLabs (if key set) or Easy Voice /voice/transcribe.
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function transcribeViaCloud(fileUri, options = {}) {
  const key = await getElevenLabsApiKey();
  const useElevenLabs = key && key !== ELEVENLABS_API_KEY_PLACEHOLDER;
  if (useElevenLabs) {
    const eleven = await transcribeWithElevenLabs(fileUri, options);
    if (eleven.success) return eleven;
  }
  return transcribeAudio(fileUri, {
    language: 'en-US',
    enablePunctuation: true,
    enableTimestamps: false,
    ...options,
  });
}

/**
 * Routes to on-device Whisper or cloud API based on Settings → Internal Transcribe.
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function transcribeBySettings(fileUri, options = {}) {
  const internal = await getInternalTranscribeEnabled();
  if (internal) {
    return transcribeOnDevice(fileUri, options);
  }
  return transcribeViaCloud(fileUri, options);
}
