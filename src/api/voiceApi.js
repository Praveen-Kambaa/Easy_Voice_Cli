/**
 * voiceApi.js
 *
 * Audio upload to backend via multipart/form-data with binary file.
 * Works on Android physical device with React Native Community CLI.
 *
 * Key points:
 *  - Read file as binary data using FileSystem.readFile
 *  - Send as raw binary in FormData
 *  - Use proper headers for binary upload
 *  - Handle network connectivity issues
 */

import { Platform } from 'react-native';
import { FileSystem } from 'react-native-file-access';
import { apiUtils } from './apiClient';
import apiClient from './apiClient';
import { VOICE_ENDPOINTS } from './endpoints';
import { buildEasyVoiceUrl } from '../config/api';

// Helper function for fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeout = 120000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Helper function to handle fetch responses
const handleFetchResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw {
      response: {
        status: response.status,
        data: errorData,
      },
      message: errorData.message || errorData.error || `HTTP ${response.status}`,
    };
  }
  return await response.json();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a proper file:// URI that Android FormData can read.
 * Paths returned by react-native-audio-recorder-player on Android are absolute
 * (e.g. /data/user/0/com.app/cache/recording_xxx.mp4).
 * Adding "file://" prefix is required for the native HTTP layer.
 */
const toFileUri = (filePath) => {
  console.log('[voiceApi] toFileUri – input filePath:', filePath);
  if (!filePath) {
    console.log('[voiceApi] toFileUri – no filePath provided, returning as-is');
    return filePath;
  }
  if (filePath.startsWith('file://') || filePath.startsWith('content://')) {
    console.log('[voiceApi] toFileUri – filePath already has proper prefix, returning:', filePath);
    return filePath;
  }
  const result = `file://${filePath}`;
  console.log('[voiceApi] toFileUri – added file:// prefix, result:', result);
  return result;
};

/**
 * Guess MIME type from file extension.
 */
const getMimeType = (filePath) => {
  if (!filePath) {
    return 'audio/mp4';
  }
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = {
    mp4: 'audio/mp4',
    m4a: 'audio/m4a',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };
  return map[ext] || 'audio/mp4';
};

// ─── Standardised response factory ────────────────────────────────────────────
const createResponse = (success = false, data = null, error = null) => {
  return { success, data, error };
};

/** Paths from native may be `/sdcard/...` or `file:///...` — FileSystem helpers need no scheme. */
const toLocalFsPath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return filePath;
  return filePath.startsWith('file://') ? filePath.replace(/^file:\/\//, '') : filePath;
};

// ─── Core upload function ─────────────────────────────────────────────────────

/**
 * Upload an audio file to the backend as multipart/form-data.
 *
 * @param {string} filePath  – absolute path OR file:// URI to the audio file
 * @param {Object} options   – { language, enablePunctuation, enableTimestamps }
 */
const uploadAudio = async (filePath, options = {}) => {
  // 1. Validate input
  if (!filePath) {
    return createResponse(false, null, 'Audio file path is required');
  }

  const fsPath = toLocalFsPath(filePath);

  // 2. Verify file exists and get file info
  const exists = await FileSystem.exists(fsPath);
  if (!exists) {
    return createResponse(false, null, `Audio file not found: ${fsPath}`);
  }

  const stat = await FileSystem.stat(fsPath);
  if (stat.size === 0) {
    return createResponse(false, null, 'Audio file is empty (0 bytes). Recording may have failed.');
  }

  // 3. Read file as binary data
  try {
    const fileData = await FileSystem.readFile(fsPath, 'base64');

    // 4. Build FormData with binary data
    const mimeType = getMimeType(fsPath);
    const fileName = fsPath.split('/').pop() || `recording_${Date.now()}.m4a`;

    const formData = new FormData();

    // Convert base64 to blob for proper binary upload
    const blob = `data:${mimeType};base64,${fileData}`;
    formData.append('file', {
      uri: blob,
      type: mimeType,
      name: fileName,
    });

    // Optional fields your backend might use
    const language = options.language || 'en-US';
    const enablePunctuation = String(options.enablePunctuation !== false);
    const enableTimestamps = String(options.enableTimestamps === true);

    formData.append('language', language);
    formData.append('enablePunctuation', enablePunctuation);
    formData.append('enableTimestamps', enableTimestamps);

    // 5. POST file with proper headers
    const response = await fetchWithTimeout(
      buildEasyVoiceUrl('/voice/transcribe'),
      {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
          // Note: Don't set Content-Type for FormData - browser sets it with boundary
        },
      },
      180000 // 3 minutes
    );

    const responseData = await handleFetchResponse(response);
    return createResponse(true, responseData);
  } catch (error) {
    if (error.response) {
      // Server replied with an error status
      const msg = error.response.data?.message
        || error.response.data?.error
        || `Server error: ${error.response.status}`;
      return createResponse(false, null, msg);
    }

    if (error.name === 'AbortError') {
      return createResponse(false, null, 'Request timed out. Please try again.');
    }

    // Network issue or other error
    return createResponse(
      false,
      null,
      `Network error – cannot reach backend.\n\nError details: ${error.message}\n\nCheck:\n1. Backend is running on st0x556n-4000.inc1.devtunnels.ms\n2. Device has internet connection\n3. SSL certificate is valid\n4. CORS is properly configured\n5. DNS resolution works`,
    );
  }
};

// ─── Public transcribeAudio (called by VoiceRecorderScreen) ───────────────────

/**
 * Transcribe an audio file.
 * Returns a standardised { success, data: { rawTranscript, refinedTranscript, voiceAssetId } }
 */
export const transcribeAudio = async (fileUri, options = {}) => {
  if (!fileUri) {
    return createResponse(false, null, 'Audio file path is required');
  }

  const result = await uploadAudio(fileUri, options);

  if (!result.success) {
    return createResponse(false, null, result.error);
  }

  const normalizedData = normalizeTranscribeServerPayload(result.data);

  return createResponse(true, normalizedData);
};

/**
 * Map /voice/transcribe JSON into { rawTranscript, refinedTranscript, voiceAssetId }.
 * Handles plain string bodies, nested `data`, and common key names.
 */
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
      if (c == null) continue;
      if (typeof c === 'object') continue;
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

  const refined = pickFirst(d.refinedTranscript, d.rawTranscript, d.transcript, d.text, coarse, inner?.transcript, inner?.text);
  const rawT = pickFirst(d.rawTranscript, d.transcript, d.text, coarse, inner?.rawTranscript, inner?.transcript);

  const voiceAssetId =
    d.voiceAssetId ?? d.easyVoiceAssetId ?? d.id ?? inner?.voiceAssetId ?? inner?.id ?? null;

  return {
    rawTranscript: rawT || coarse,
    refinedTranscript: refined || coarse,
    voiceAssetId,
    timestamp: ts,
  };
}

// ─── Other voice API endpoints ────────────────────────────────────────────────

export const updateTranscript = async (voiceAssetId, finalTranscript) => {
  try {
    if (!voiceAssetId) {
      return createResponse(false, null, 'Voice asset ID is required');
    }
    if (!finalTranscript?.trim()) {
      return createResponse(false, null, 'Transcript text cannot be empty');
    }

    const response = await fetchWithTimeout(
      buildEasyVoiceUrl(VOICE_ENDPOINTS.TRANSCRIPT),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          finalTranscript: finalTranscript.trim(),
          voiceAssetId: voiceAssetId
        }),
      },
      30000
    );

    const data = await handleFetchResponse(response);
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

    const response = await fetchWithTimeout(
      buildEasyVoiceUrl(VOICE_ENDPOINTS.EXECUTE),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          easyVoiceAssetId: voiceAssetId,
          executeAt: new Date().toISOString(),
          ...options
        }),
      },
      45000
    );

    const data = await handleFetchResponse(response);
    if (!data || typeof data !== 'object') {
      return createResponse(false, null, 'Invalid response from server');
    }

    return createResponse(true, {
      executionId: data.executionId,
      status: data.status,
      result: data.result,
      executedAt: data.executedAt || new Date().toISOString(),
    });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Execution was cancelled');
    }
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

    const response = await fetchWithTimeout(
      `${buildEasyVoiceUrl(VOICE_ENDPOINTS.HISTORY)}?${params.toString()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      30000
    );

    const data = await handleFetchResponse(response);
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

    const response = await fetchWithTimeout(
      `${buildEasyVoiceUrl(VOICE_ENDPOINTS.DELETE)}/${voiceAssetId}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      },
      30000
    );

    await handleFetchResponse(response);
    return createResponse(true, { deleted: true, deletedAt: new Date().toISOString() });
  } catch (error) {
    if (apiUtils.isCancel(error)) {
      return createResponse(false, null, 'Deletion was cancelled');
    }
    return createResponse(false, null, error.message || 'Failed to delete voice recording');
  }
};

const testAPI = async () => {
  try {
    const response = await fetch('https://slender-loris.kambaaincorporation.in/api/home-screen');
    const data = await response.json();

    return createResponse(true, data);
  } catch (error) {
    return createResponse(false, null, error.message || 'Failed to test API');
  }
};
// Test connectivity to the backend
export const testBackendConnectivity = async () => {
  try {
    const response = await fetchWithTimeout(
      buildEasyVoiceUrl('/health'),
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      10000
    );

    const data = await handleFetchResponse(response);
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

// Named export grouping (matches existing import pattern in screens)

export const voiceApi = {
  testAPI,
  testBackendConnectivity,
  transcribeAudio,
  updateTranscript,
  executeVoiceCommand,
  getVoiceHistory,
  deleteVoiceRecording,
};

export default voiceApi;
