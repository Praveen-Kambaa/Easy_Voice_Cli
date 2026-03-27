// API Configuration - Multiple Servers
export const API_SERVERS = {
  TYPE_EASY: 'https://easyvoice.kambaaincorporation.in/apiv2',  // Authentication server
  EASY_VOICE: 'http://192.168.0.231:4000/api',               // Local development server
};

// API Endpoints - Organized by server
export const API_ENDPOINTS = {
  // Authentication Server Endpoints
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
  
  // Local Server Endpoints  
  VOICE: {
    TRANSCRIBE: '/voice/transcribe',
    HISTORY: '/voice/history',
    /** Text translation (POST). Body/response shape can be adjusted when your API is ready. */
    TEXT_TRANSLATE: '/voice/translate-text',
  },
  USER: {
    PROFILE: '/user/profile',
    UPDATE: '/user/update',
  },
};

// Helper functions to build URLs for different servers
export const buildTypeEasyUrl = (endpoint) => {
  return `${API_SERVERS.TYPE_EASY}${endpoint}`;
};

export const buildEasyVoiceUrl = (endpoint) => {
  return `${API_SERVERS.EASY_VOICE}${endpoint}`;
};

// Main builder function - determines server based on endpoint
export const buildApiUrl = (endpoint) => {
  // Check if it's an auth endpoint
  const authEndpoints = Object.values(API_ENDPOINTS.AUTH);
  if (authEndpoints.includes(endpoint)) {
    return buildTypeEasyUrl(endpoint);
  }
  
  // Default to Easy Voice server for other endpoints
  return buildEasyVoiceUrl(endpoint);
};
