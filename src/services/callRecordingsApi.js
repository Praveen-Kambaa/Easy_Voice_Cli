import { Platform } from 'react-native';
import apiClient from '../api/apiClient';
import { API_ENDPOINTS } from '../config/api';

/**
 * Upload a call recording file with metadata. Backend should accept multipart/form-data.
 *
 * Expected server fields (adjust to match your API):
 * - `audio` or `file`: audio/m4a
 * - `metadata`: JSON string with phoneNumber, contactName, direction, durationMs, recordedAt
 */
export async function uploadCallRecording({ filePath, metadata }) {
  const uri = Platform.OS === 'android' && filePath && !filePath.startsWith('file:')
    ? `file://${filePath}`
    : filePath;

  const isWav = typeof filePath === 'string' && /\.wav$/i.test(filePath);
  const formData = new FormData();
  formData.append('audio', {
    uri,
    type: isWav ? 'audio/wav' : 'audio/mp4',
    name: isWav ? 'call-recording.wav' : 'call-recording.m4a',
  });
  formData.append('metadata', JSON.stringify(metadata || {}));

  const response = await apiClient.post(API_ENDPOINTS.CALLS.RECORDINGS, formData, {
    timeout: 120000,
  });
  return response.data;
}
