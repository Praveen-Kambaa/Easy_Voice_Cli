import { FileSystem } from 'react-native-file-access';
import { createResponse } from '../utils/apiResponse';
import {
  ELEVENLABS_API_KEY_PLACEHOLDER,
  getElevenLabsApiKey,
} from './floatingMicConfig';

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const DEFAULT_MODEL_ID = 'scribe_v2';

function getMimeType(filePath) {
  if (!filePath) return 'audio/mp4';
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = {
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };
  return map[ext] || 'audio/mp4';
}

function toLanguageCode(language) {
  if (!language || typeof language !== 'string') return null;
  const l = language.trim();
  if (l.length === 2) return l.toLowerCase();
  const code = l.split(/[-_]/)[0];
  return code && code.length >= 2 ? code.toLowerCase().slice(0, 2) : null;
}

function extractTranscriptText(json) {
  if (!json || typeof json !== 'object') return '';
  if (Array.isArray(json.transcripts) && json.transcripts.length > 0) {
    return json.transcripts[0]?.text || '';
  }
  return json.text || '';
}

/**
 * Speech-to-text via ElevenLabs (same contract as voiceApi.transcribeAudio when internal transcribe is off).
 *
 * @param {string} fileUri – absolute path or file:// URI
 * @param {Object} options – { language } (e.g. en-US → language_code en)
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function transcribeWithElevenLabs(fileUri, options = {}) {
  const apiKey = await getElevenLabsApiKey();
  if (!apiKey || apiKey === ELEVENLABS_API_KEY_PLACEHOLDER) {
    return createResponse(
      false,
      null,
      'Set your ElevenLabs API key in Settings (Floating mic) to use cloud transcription.',
    );
  }

  if (!fileUri) {
    return createResponse(false, null, 'Audio file path is required');
  }

  const localPath = fileUri.replace(/^file:\/\//, '');
  try {
    const exists = await FileSystem.exists(localPath);
    if (!exists) {
      return createResponse(false, null, `Audio file not found: ${fileUri}`);
    }
    const stat = await FileSystem.stat(localPath);
    if (stat.size === 0) {
      return createResponse(false, null, 'Audio file is empty (0 bytes).');
    }
  } catch (e) {
    return createResponse(false, null, e?.message || 'Could not read audio file');
  }

  const mimeType = getMimeType(localPath);
  const fileName = localPath.split(/[/\\]/).pop() || `recording_${Date.now()}.m4a`;
  const uploadUri = fileUri.startsWith('file://') ? fileUri : `file://${localPath}`;

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
    type: mimeType,
    name: fileName,
  });
  formData.append('model_id', DEFAULT_MODEL_ID);

  const langCode = toLanguageCode(options.language);
  if (langCode) {
    formData.append('language_code', langCode);
  }

  try {
    const response = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        Accept: 'application/json',
      },
      body: formData,
    });

    const textBody = await response.text();
    let data;
    try {
      data = textBody ? JSON.parse(textBody) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const detailMsg = Array.isArray(data?.detail)
        ? data.detail.map((d) => d?.msg).filter(Boolean).join('; ')
        : '';
      const msg =
        data?.message ||
        data?.error ||
        detailMsg ||
        `ElevenLabs error ${response.status}`;
      return createResponse(false, null, msg);
    }

    const transcript = extractTranscriptText(data);
    if (!transcript.trim()) {
      return createResponse(false, null, 'Empty transcript from ElevenLabs');
    }

    const normalizedData = {
      rawTranscript: transcript,
      refinedTranscript: transcript,
      voiceAssetId: null,
      timestamp: new Date().toISOString(),
      provider: 'elevenlabs',
    };

    return createResponse(true, normalizedData);
  } catch (error) {
    return createResponse(false, null, error?.message || 'ElevenLabs transcription failed');
  }
}
