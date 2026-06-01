import axios from 'axios';
import { API_SERVERS } from '../config/api';
import logger from '../utils/logger';

const API_CONFIG = {
  baseURL: API_SERVERS.EASY_VOICE,
  timeout: 30000,
};

const apiClient = axios.create(API_CONFIG);

apiClient.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: Date.now() };
    const url = `${config.baseURL || ''}${config.url || ''}`;
    logger.apiRequest(config.method, url, config.data);
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    logger.apiError('?', '?', error);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    const started = response.config.metadata?.startTime;
    const durationMs = started ? Date.now() - started : undefined;
    const url = `${response.config.baseURL || ''}${response.config.url || ''}`;
    logger.apiResponse(response.config.method, url, response.status, response.data, durationMs);
    return response;
  },
  (error) => {
    const cfg = error.config || {};
    const started = cfg.metadata?.startTime;
    const durationMs = started ? Date.now() - started : undefined;
    const url = `${cfg.baseURL || ''}${cfg.url || ''}`;
    logger.apiError(cfg.method, url, error, durationMs);
    return Promise.reject(transformApiError(error));
  },
);

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

  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      customError.message = 'Request timed out. Please try again.';
      customError.type = 'TIMEOUT';
    } else if (error.message?.includes('Network Error')) {
      customError.message = 'Cannot connect to server. Check internet or server URL.';
      customError.type = 'NETWORK';
    } else {
      customError.message = 'Unable to connect to the server. Please try again later.';
      customError.type = 'NETWORK';
    }
    return customError;
  }

  const { status, data } = error.response;
  customError.statusCode = status;
  customError.type = status >= 500 ? 'SERVER' : 'UNKNOWN';

  switch (status) {
    case 400:
      customError.message = data?.message || 'Invalid audio file.';
      break;
    case 401:
      customError.message = 'Unauthorized.';
      break;
    case 403:
      customError.message = 'Access denied.';
      break;
    case 404:
      customError.message = 'The requested resource was not found.';
      break;
    case 413:
      customError.message = 'File too large.';
      break;
    case 422:
      customError.message = data?.message || 'Invalid data provided.';
      break;
    case 429:
      customError.message = 'Too many requests. Please wait and try again.';
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
  }

  return customError;
};

export const apiUtils = {
  createCancelToken: () => axios.CancelToken.source(),
  isCancel: (error) => axios.isCancel(error),
  setAuthToken: (token) => {
    if (token) {
      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common.Authorization;
    }
  },
  clearAuthToken: () => {
    delete apiClient.defaults.headers.common.Authorization;
  },
};

export default apiClient;
