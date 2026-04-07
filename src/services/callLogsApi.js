import apiClient from '../api/apiClient';
import { API_ENDPOINTS } from '../config/api';

/**
 * Push call log rows to the backend (no audio).
 *
 * Expected server: POST JSON with an `entries` array. Adjust the server route to match.
 * Each entry mirrors the native module: id, phoneNumber, contactName, callType, timestamp, durationSec.
 */
export async function syncCallLogsToBackend(entries) {
  if (!entries?.length) {
    return { synced: 0 };
  }
  const response = await apiClient.post(API_ENDPOINTS.CALLS.CALL_LOGS, { entries }, {
    timeout: 60000,
  });
  return response.data;
}
