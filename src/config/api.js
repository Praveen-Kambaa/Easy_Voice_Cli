/**
 * API Configuration — server base URLs and endpoint paths.
 * Voice command paths live in api/endpoints.js (single source of truth).
 */
import { VOICE_ENDPOINTS } from '../api/endpoints';

export const API_SERVERS = {
  TYPE_EASY: 'https://easyvoice.kambaaincorporation.in/apiv2',
  EASY_VOICE: 'https://easy-voice-api.kambaaincorporation.in/api',
};

export const API_ENDPOINTS = {
  TRANSLATE: '/translate',
  GRAMMAR_CHECK: '/grammar-check',

  AUTH: {
    LOGIN: '/auth/user-login',
    REGISTER: '/auth/register',
    SEND_OTP: '/auth/send-otp',
    VERIFY_OTP: '/auth/verify-otp',
    COMPLETE_REGISTRATION: '/auth/complete-registration',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    REQUEST_RESET: '/auth/request-reset-password',
    RESET_PASSWORD: '/auth/reset-password',
    GOOGLE_SIGNIN: '/auth/google-signin',
  },

  /** Easy Voice server — paths from api/endpoints.js */
  VOICE: {
    ...VOICE_ENDPOINTS,
    TEXT_TRANSLATE: '/voice/translate-text',
  },

  CALLS: {
    RECORDINGS: '/calls/recordings',
    CALL_LOGS: '/calls/logs',
  },

  USER: {
    PROFILE: '/user/profile',
    UPDATE: '/user/update',
  },
};

export const buildTypeEasyUrl = (endpoint) => `${API_SERVERS.TYPE_EASY}${endpoint}`;

export const buildEasyVoiceUrl = (endpoint) => `${API_SERVERS.EASY_VOICE}${endpoint}`;

export const buildApiUrl = (endpoint) => {
  const authEndpoints = Object.values(API_ENDPOINTS.AUTH);
  if (authEndpoints.includes(endpoint)) {
    return buildTypeEasyUrl(endpoint);
  }
  return buildEasyVoiceUrl(endpoint);
};

/** Re-export voice paths for callers that import from config */
export { VOICE_ENDPOINTS } from '../api/endpoints';
