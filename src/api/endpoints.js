/**
 * API Endpoint Constants
 * Centralized endpoint definitions for maintainability
 */

export const VOICE_ENDPOINTS = {
  // Voice transcription endpoints
  TRANSCRIBE: '/voice/transcribe',
  TRANSCRIPT: '/voice/transcript',
  EXECUTE: '/voice/execute',
  
  // Additional voice endpoints (for future use)
  HISTORY: '/voice/history',
  DELETE: '/voice/delete',
  STATS: '/voice/stats',
};

export const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  VERIFY: '/auth/verify',
};

export const USER_ENDPOINTS = {
  PROFILE: '/user/profile',
  SETTINGS: '/user/settings',
  PREFERENCES: '/user/preferences',
};

export const HEALTH_ENDPOINTS = {
  PING: '/health/ping',
  STATUS: '/health/status',
};

// Export all endpoints as a single object for convenience
export const API_ENDPOINTS = {
  VOICE: VOICE_ENDPOINTS,
  AUTH: AUTH_ENDPOINTS,
  USER: USER_ENDPOINTS,
  HEALTH: HEALTH_ENDPOINTS,
};

// Default export for backward compatibility
export default VOICE_ENDPOINTS;
