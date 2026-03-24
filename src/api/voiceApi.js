/**
 * voiceApi.js
 *
 * Audio upload to backend via multipart/form-data with binary file.
 * Works on Android physical device with React Native Community CLI.
 *
 * Key points:
 *  - Read file as binary data using RNFS.readFile
 *  - Send as raw binary in FormData
 *  - Use proper headers for binary upload
 *  - Handle network connectivity issues
 */

import axios from 'axios';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { apiUtils } from './apiClient';
import apiClient from './apiClient';
import { VOICE_ENDPOINTS } from './endpoints';

// ─── API base URL ─────────────────────────────────────────────────────────────
// Use the devtunnels URL that works in Postman
const BACKEND_BASE_URL = 'https://st0x556n-4000.inc1.devtunnels.ms/api';

// Dedicated axios instance for multipart audio upload with better error handling
const uploadClient = axios.create({
  baseURL: BACKEND_BASE_URL,
  timeout: 120000, // 2 minutes – audio upload can be slow on LAN
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Add request interceptor for better debugging
uploadClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better debugging
uploadClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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

  // 2. Verify file exists and get file info
  const exists = await RNFS.exists(filePath);
  if (!exists) {
    return createResponse(false, null, `Audio file not found: ${filePath}`);
  }

  const stat = await RNFS.stat(filePath);
  if (stat.size === 0) {
    return createResponse(false, null, 'Audio file is empty (0 bytes). Recording may have failed.');
  }

  // 3. Read file as binary data
  try {
    const fileData = await RNFS.readFile(filePath, 'base64');
    
    // 4. Build FormData with binary data
    const mimeType = getMimeType(filePath);
    const fileName = filePath.split('/').pop() || `recording_${Date.now()}.m4a`;

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

    // 5. POST the file with proper headers
    const response = await uploadClient.post('/voice/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Accept': 'application/json',
      },
      timeout: 180000, // 3 minutes
    });

    return createResponse(true, response.data);
  } catch (error) {
    if (error.response) {
      // Server replied with an error status
      const msg = error.response.data?.message
        || error.response.data?.error
        || `Server error: ${error.response.status}`;
      return createResponse(false, null, msg);
    }

    if (error.request) {
      // Request made but no response received – network issue
      return createResponse(
        false,
        null,
        `Network error – cannot reach backend.\n\nError details: ${error.message}\n\nCheck:\n1. Backend is running on st0x556n-4000.inc1.devtunnels.ms\n2. Device has internet connection\n3. SSL certificate is valid\n4. CORS is properly configured\n5. DNS resolution works`,
      );
    }

    return createResponse(false, null, error.message || 'Unknown upload error');
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

  // Normalise response – handle different backend shapes
  const data = result.data || {};
  
  const normalizedData = {
    rawTranscript: data.rawTranscript || data.transcript || data.text || '',
    refinedTranscript: data.refinedTranscript || data.rawTranscript || data.transcript || data.text || '',
    voiceAssetId: data.voiceAssetId || data.id || null,
    timestamp: new Date().toISOString(),
  };
  
  return createResponse(true, normalizedData);
};

// ─── Other voice API endpoints ────────────────────────────────────────────────

export const updateTranscript = async (voiceAssetId, finalTranscript) => {
  try {
    if (!voiceAssetId) {
      return createResponse(false, null, 'Voice asset ID is required');
    }
    if (!finalTranscript?.trim()) {
      return createResponse(false, null, 'Transcript text cannot be empty');
    }

    const response = await apiClient.put(
      VOICE_ENDPOINTS.TRANSCRIPT,
      { 
        finalTranscript: finalTranscript.trim(),
        voiceAssetId: voiceAssetId
      },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 30000 },
    );

    const { data } = response;
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

    const response = await apiClient.post(
      VOICE_ENDPOINTS.EXECUTE,
      { easyVoiceAssetId: voiceAssetId, executeAt: new Date().toISOString(), ...options },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 45000 },
    );

    const { data } = response;
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
    const response = await apiClient.get(VOICE_ENDPOINTS.HISTORY, {
      headers: { Accept: 'application/json' },
      params: {
        limit: filters.limit || 20,
        offset: filters.offset || 0,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      timeout: 30000,
    });

    const { data } = response;
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

    await apiClient.delete(`${VOICE_ENDPOINTS.DELETE}/${voiceAssetId}`, {
      headers: { Accept: 'application/json' },
      timeout: 30000,
    });

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
    const response = await uploadClient.get('/health', {
      timeout: 10000,
    });
    
    return createResponse(true, response.data);
  } catch (error) {
    let errorMessage = 'Backend connectivity test failed';
    if (error.response) {
      errorMessage = `Backend responded with error: ${error.response.status}`;
    } else if (error.request) {
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
