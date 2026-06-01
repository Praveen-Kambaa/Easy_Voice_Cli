/**
 * voiceApi.js — Easy Voice server: transcribe, transcript update, execute, history.
 */
import { FileSystem } from 'react-native-file-access';
import { apiUtils } from './apiClient';
import { VOICE_ENDPOINTS } from './endpoints';
import { buildEasyVoiceUrl } from '../config/api';
import { apiFetch } from './httpClient';
import logger from '../utils/logger';

const createResponse = (success = false, data = null, error = null) => ({ success, data, error });

const toLocalFsPath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return filePath;
  return filePath.startsWith('file://') ? filePath.replace(/^file:\/\//, '') : filePath;
};

const toFileUri = (filePath) => {
  if (!filePath) return filePath;
  if (filePath.startsWith('file://') || filePath.startsWith('content://')) return filePath;
  return `file://${filePath}`;
};

const getMimeType = (filePath) => {
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
};

/**
 * Upload audio as multipart/form-data using a native file URI (required on React Native).
 */
const uploadAudio = async (filePath, options = {}) => {
  if (!filePath) {
    return createResponse(false, null, 'Audio file path is required');
  }

  const fsPath = toLocalFsPath(filePath);
  const exists = await FileSystem.exists(fsPath);
  if (!exists) {
    return createResponse(false, null, `Audio file not found: ${fsPath}`);
  }

  const stat = await FileSystem.stat(fsPath);
  if (stat.size === 0) {
    return createResponse(false, null, 'Audio file is empty (0 bytes). Recording may have failed.');
  }

  try {
    const mimeType = getMimeType(fsPath);
    const fileName = fsPath.split(/[/\\]/).pop() || `recording_${Date.now()}.m4a`;
    const uploadUri = toFileUri(fsPath);

    const formData = new FormData();
    formData.append('file', {
      uri: uploadUri,
      type: mimeType,
      name: fileName,
    });
    formData.append('language', options.language || 'en-US');
    formData.append('enablePunctuation', String(options.enablePunctuation !== false));
    formData.append('enableTimestamps', String(options.enableTimestamps === true));

    const url = buildEasyVoiceUrl(VOICE_ENDPOINTS.TRANSCRIBE);
    const responseData = await apiFetch(
      url,
      {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      },
      180000,
    );

    return createResponse(true, responseData);
  } catch (error) {
    if (error.name === 'AbortError') {
      return createResponse(false, null, 'Request timed out. Please try again.');
    }
    const msg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Network error – cannot reach voice server.';
    return createResponse(false, null, msg);
  }
};

export const transcribeAudio = async (fileUri, options = {}) => {
  if (!fileUri) {
    return createResponse(false, null, 'Audio file path is required');
  }
  const result = await uploadAudio(fileUri, options);
  if (!result.success) {
    return createResponse(false, null, result.error);
  }
  return createResponse(true, normalizeTranscribeServerPayload(result.data));
};

function normalizeTranscribeServerPayload(raw) {
  const ts = new Date().toISOString();
  if (raw == null) {
    return { rawTranscript: '', refinedTranscript: '', voiceAssetId: null, timestamp: ts };
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    return { rawTranscript: t, refinedTranscript: t, voiceAssetId: null, timestamp: ts };
  }
  if (typeof raw !== 'object') {
    return { rawTranscript: '', refinedTranscript: '', voiceAssetId: null, timestamp: ts };
  }

  const d = raw;
  const inner = d.data && typeof d.data === 'object' ? d.data : null;
  const pickFirst = (...candidates) => {
    for (const c of candidates) {
      if (c == null || typeof c === 'object') continue;
      const s = String(c).trim();
      if (s) return s;
    }
    return '';
  };

  const coarse = pickFirst(
    d.refinedTranscript,
    d.rawTranscript,
    d.transcript,
    d.text,
    typeof d.result === 'string' ? d.result : '',
    inner?.refinedTranscript,
    inner?.rawTranscript,
    inner?.transcript,
    inner?.text,
  );

  const refined = pickFirst(
    d.refinedTranscript,
    d.rawTranscript,
    d.transcript,
    d.text,
    coarse,
    inner?.transcript,
    inner?.text,
  );
  const rawT = pickFirst(
    d.rawTranscript,
    d.transcript,
    d.text,
    coarse,
    inner?.rawTranscript,
    inner?.transcript,
  );

  const voiceAssetId =
    d.voiceAssetId ?? d.easyVoiceAssetId ?? d.id ?? inner?.voiceAssetId ?? inner?.id ?? null;

  return {
    rawTranscript: rawT || coarse,
    refinedTranscript: refined || coarse,
    voiceAssetId,
    timestamp: ts,
  };
}

function extractExecuteResultText(data) {
  if (!data || typeof data !== 'object') return '';
  const direct = data.result?.trim?.() || data.message?.trim?.();
  if (direct) return direct;
  const inner = data.data;
  if (inner && typeof inner === 'object') {
    return (
      inner.result?.trim?.() ||
      inner.message?.trim?.() ||
      inner.text?.trim?.() ||
      ''
    );
  }
  return '';
}

export const updateTranscript = async (voiceAssetId, finalTranscript) => {
  try {
    if (!voiceAssetId) {
      return createResponse(false, null, 'Voice asset ID is required');
    }
    if (!finalTranscript?.trim()) {
      return createResponse(false, null, 'Transcript text cannot be empty');
    }

    const url = buildEasyVoiceUrl(VOICE_ENDPOINTS.TRANSCRIPT);
    const data = await apiFetch(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          finalTranscript: finalTranscript.trim(),
          voiceAssetId,
        }),
      },
      30000,
    );

    if (!data?.voiceAssetId) {
      return createResponse(false, null, 'Invalid response from server');
    }

    return createResponse(true, {
      voiceAssetId: data.voiceAssetId,
      transcript: finalTranscript,
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Update was cancelled');
    }
    return createResponse(false, null, error.message || 'Failed to update transcript');
  }
};

export const executeVoiceCommand = async (voiceAssetId, options = {}) => {
  try {
    if (!voiceAssetId) {
      return createResponse(false, null, 'Voice asset ID is required');
    }

    const url = buildEasyVoiceUrl(VOICE_ENDPOINTS.EXECUTE);
    const data = await apiFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          easyVoiceAssetId: voiceAssetId,
          executeAt: options.executeAt || new Date().toISOString(),
        }),
      },
      45000,
    );

    if (!data || typeof data !== 'object') {
      return createResponse(false, null, 'Invalid response from server');
    }

    const resultText = extractExecuteResultText(data);

    return createResponse(true, {
      executionId: data.executionId,
      status: data.status,
      result: resultText || data.result,
      executedAt: data.executedAt || new Date().toISOString(),
    });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Execution was cancelled');
    }
    logger.error('executeVoiceCommand failed', error.message);
    return createResponse(false, null, error.message || 'Failed to execute voice command');
  }
};

export const getVoiceHistory = async (filters = {}) => {
  try {
    const params = new URLSearchParams({
      limit: filters.limit || 20,
      offset: filters.offset || 0,
      startDate: filters.startDate || '',
      endDate: filters.endDate || '',
    });

    const url = `${buildEasyVoiceUrl(VOICE_ENDPOINTS.HISTORY)}?${params.toString()}`;
    const data = await apiFetch(url, { method: 'GET', headers: { Accept: 'application/json' } }, 30000);

    if (!Array.isArray(data?.records)) {
      return createResponse(false, null, 'Invalid response from server');
    }

    return createResponse(true, {
      records: data.records,
      total: data.total || data.records.length,
      hasMore: data.hasMore || false,
    });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Request was cancelled');
    }
    return createResponse(false, null, error.message || 'Failed to fetch voice history');
  }
};

export const deleteVoiceRecording = async (voiceAssetId) => {
  try {
    if (!voiceAssetId) {
      return createResponse(false, null, 'Voice asset ID is required');
    }

    const url = `${buildEasyVoiceUrl(VOICE_ENDPOINTS.DELETE)}/${voiceAssetId}`;
    await apiFetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } }, 30000);
    return createResponse(true, { deleted: true, deletedAt: new Date().toISOString() });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Deletion was cancelled');
    }
    return createResponse(false, null, error.message || 'Failed to delete voice recording');
  }
};

export const testBackendConnectivity = async () => {
  try {
    const data = await apiFetch(
      buildEasyVoiceUrl('/health'),
      { method: 'GET', headers: { Accept: 'application/json' } },
      10000,
    );
    return createResponse(true, data);
  } catch (error) {
    let errorMessage = 'Backend connectivity test failed';
    if (error.response) {
      errorMessage = `Backend responded with error: ${error.response.status}`;
    } else if (error.name === 'AbortError') {
      errorMessage = 'Backend connectivity test timed out';
    } else {
      errorMessage = `Cannot reach backend: ${error.message}`;
    }
    return createResponse(false, null, errorMessage);
  }
};

export const voiceApi = {
  testBackendConnectivity,
  transcribeAudio,
  updateTranscript,
  executeVoiceCommand,
  getVoiceHistory,
  deleteVoiceRecording,
};

export default voiceApi;
