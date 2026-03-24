import axios from 'axios';
import { Platform } from 'react-native';

// Environment-Safe Base URL Configuration
const getBaseURL = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      if (Platform.isEmulator) {
        return 'https://st0x556n-4000.inc1.devtunnels.ms/api';
      } else {
        return 'https://st0x556n-4000.inc1.devtunnels.ms/api';
      }
    } else if (Platform.OS === 'ios') {
      return 'https://st0x556n-4000.inc1.devtunnels.ms/api';
    }
  }
  
  // Production
  return 'https://st0x556n-4000.inc1.devtunnels.ms/api';
};

const API_CONFIG = {
  baseURL: getBaseURL(),
  timeout: 30000, // 30 seconds
  // SSL and network settings for Android
  // Note: Using HTTP so no SSL configuration needed
  // httpsAgent: Platform.OS === 'android' ? {
  //   rejectUnauthorized: false, // Only for development - handle SSL issues
  // } : undefined,
  // No default headers - each request will set its own headers
};

// Create axios instance
const apiClient = axios.create(API_CONFIG);

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add request timestamp for debugging
    config.metadata = { startTime: new Date() };
    
    // Handle FormData - remove Content-Type to let Axios set it with boundary automatically
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Transform error to user-friendly format
    const userError = transformApiError(error);
    return Promise.reject(userError);
  }
);

// Error transformation utility
const transformApiError = (error) => {
  const customError = {
    success: false,
    message: 'An unexpected error occurred',
    statusCode: null,
    type: 'UNKNOWN',
    originalError: error,
    config: {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers,
    },
  };

  // Network errors
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      customError.message = 'Request timed out. Please try again.';
      customError.type = 'TIMEOUT';
    } else if (error.message.includes('Network Error')) {
      customError.message = 'Cannot connect to server. Check internet or server URL.';
      customError.type = 'NETWORK';
    } else {
      customError.message = 'Unable to connect to the server. Please try again later.';
      customError.type = 'NETWORK';
    }
    return customError;
  }

  // HTTP Status errors
  const { status, data } = error.response;
  customError.statusCode = status;
  customError.type = status >= 500 ? 'SERVER' : 'UNKNOWN';

  switch (status) {
    case 400:
      customError.message = data?.message || 'Invalid audio file.';
      customError.type = 'UNKNOWN';
      break;

    case 401:
      customError.message = 'Unauthorized.';
      customError.type = 'UNKNOWN';
      break;

    case 403:
      customError.message = 'Access denied. You don\'t have permission for this action.';
      customError.type = 'UNKNOWN';
      break;

    case 404:
      customError.message = 'The requested resource was not found.';
      customError.type = 'UNKNOWN';
      break;

    case 413:
      customError.message = 'File too large. Please upload a smaller audio file.';
      customError.type = 'UNKNOWN';
      break;

    case 422:
      customError.message = data?.message || 'Invalid data provided.';
      customError.type = 'UNKNOWN';
      break;

    case 429:
      customError.message = 'Too many requests. Please wait and try again.';
      customError.type = 'UNKNOWN';
      break;

    case 500:
      customError.message = 'Server error. Try again later.';
      customError.type = 'SERVER';
      break;

    case 502:
    case 503:
    case 504:
      customError.message = 'Service temporarily unavailable. Please try again later.';
      customError.type = 'SERVER';
      break;

    default:
      customError.message = data?.message || `Request failed with status ${status}.`;
      customError.type = 'UNKNOWN';
  }

  return customError;
};

// Utility methods
export const apiUtils = {
  // Cancel token for request cancellation
  createCancelToken: () => axios.CancelToken.source(),

  // Check if error is cancellation
  isCancel: (error) => axios.isCancel(error),

  // Set auth token
  setAuthToken: (token) => {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  },

  // Remove auth token
  clearAuthToken: () => {
    delete apiClient.defaults.headers.common['Authorization'];
  },
};

export default apiClient;
