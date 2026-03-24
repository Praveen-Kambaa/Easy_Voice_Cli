/**
 * Centralized Error Handling Utility
 * Provides consistent error handling across the application
 */

// Error categories for better handling
export const ERROR_CATEGORIES = {
  NETWORK: 'NETWORK',
  PERMISSION: 'PERMISSION',
  AUDIO: 'AUDIO',
  API: 'API',
  VALIDATION: 'VALIDATION',
  STORAGE: 'STORAGE',
  UNKNOWN: 'UNKNOWN',
};

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

/**
 * Categorize error based on error properties
 */
export const categorizeError = (error) => {
  if (!error) return ERROR_CATEGORIES.UNKNOWN;

  // Network errors
  if (error.code === 'NETWORK_ERROR' || 
      error.code === 'TIMEOUT_ERROR' || 
      error.code === 'CONNECTION_ERROR' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout')) {
    return ERROR_CATEGORIES.NETWORK;
  }

  // Permission errors
  if (error.message?.includes('permission') ||
      error.message?.includes('denied') ||
      error.code === 'PERMISSION_DENIED') {
    return ERROR_CATEGORIES.PERMISSION;
  }

  // Audio recording errors
  if (error.message?.includes('recording') ||
      error.message?.includes('microphone') ||
      error.message?.includes('audio') ||
      error.code?.includes('AUDIO')) {
    return ERROR_CATEGORIES.AUDIO;
  }

  // API errors
  if (error.status || error.code === 'HTTP_ERROR') {
    return ERROR_CATEGORIES.API;
  }

  // Validation errors
  if (error.code === 'VALIDATION_ERROR' ||
      error.message?.includes('invalid') ||
      error.message?.includes('required')) {
    return ERROR_CATEGORIES.VALIDATION;
  }

  // Storage errors
  if (error.message?.includes('storage') ||
      error.message?.includes('file') ||
      error.code?.includes('STORAGE')) {
    return ERROR_CATEGORIES.STORAGE;
  }

  return ERROR_CATEGORIES.UNKNOWN;
};

/**
 * Determine error severity
 */
export const getErrorSeverity = (error, category) => {
  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      return error.code === 'SERVICE_UNAVAILABLE' ? ERROR_SEVERITY.HIGH : ERROR_SEVERITY.MEDIUM;
    
    case ERROR_CATEGORIES.PERMISSION:
      return ERROR_SEVERITY.HIGH;
    
    case ERROR_CATEGORIES.AUDIO:
      return error.message?.includes('microphone') ? ERROR_SEVERITY.HIGH : ERROR_SEVERITY.MEDIUM;
    
    case ERROR_CATEGORIES.API:
      if (error.status >= 500) return ERROR_SEVERITY.HIGH;
      if (error.status >= 400) return ERROR_SEVERITY.MEDIUM;
      return ERROR_SEVERITY.LOW;
    
    case ERROR_CATEGORIES.VALIDATION:
      return ERROR_SEVERITY.LOW;
    
    case ERROR_CATEGORIES.STORAGE:
      return ERROR_SEVERITY.MEDIUM;
    
    default:
      return ERROR_SEVERITY.MEDIUM;
  }
};

/**
 * Get user-friendly error message
 */
export const getUserFriendlyMessage = (error, category) => {
  // If error already has a user-friendly message, use it
  if (error.message && !error.message.includes('Error:') && !error.message.includes('Failed:')) {
    return error.message;
  }

  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      if (error.code === 'TIMEOUT_ERROR') {
        return 'Request timed out. Please check your internet connection and try again.';
      }
      if (error.code === 'CONNECTION_ERROR') {
        return 'No internet connection. Please check your network settings.';
      }
      return 'Network error. Please check your connection and try again.';

    case ERROR_CATEGORIES.PERMISSION:
      return 'Permission required. Please grant the necessary permissions in your device settings.';

    case ERROR_CATEGORIES.AUDIO:
      if (error.message?.includes('microphone')) {
        return 'Microphone access is required for recording. Please enable microphone permissions.';
      }
      if (error.message?.includes('already in progress')) {
        return 'Recording is already in progress. Please stop the current recording first.';
      }
      return 'Audio recording failed. Please check your microphone and try again.';

    case ERROR_CATEGORIES.API:
      if (error.status === 413) {
        return 'Audio file is too large. Please record a shorter audio clip.';
      }
      if (error.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      if (error.status >= 500) {
        return 'Server is temporarily unavailable. Please try again later.';
      }
      return 'Request failed. Please try again.';

    case ERROR_CATEGORIES.VALIDATION:
      return 'Invalid input. Please check your data and try again.';

    case ERROR_CATEGORIES.STORAGE:
      return 'Storage error. Please check your device storage and try again.';

    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Get suggested actions for error recovery
 */
export const getRecoveryActions = (error, category) => {
  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      return [
        { label: 'Check Connection', action: 'check_network' },
        { label: 'Retry', action: 'retry' },
      ];

    case ERROR_CATEGORIES.PERMISSION:
      return [
        { label: 'Open Settings', action: 'open_settings' },
        { label: 'Retry', action: 'retry' },
      ];

    case ERROR_CATEGORIES.AUDIO:
      return [
        { label: 'Check Microphone', action: 'check_mic' },
        { label: 'Retry', action: 'retry' },
      ];

    case ERROR_CATEGORIES.API:
      if (error.status >= 500) {
        return [
          { label: 'Try Later', action: 'retry_later' },
          { label: 'Contact Support', action: 'contact_support' },
        ];
      }
      return [
        { label: 'Retry', action: 'retry' },
        { label: 'Check Data', action: 'check_data' },
      ];

    case ERROR_CATEGORIES.VALIDATION:
      return [
        { label: 'Fix Input', action: 'fix_input' },
        { label: 'Get Help', action: 'get_help' },
      ];

    case ERROR_CATEGORIES.STORAGE:
      return [
        { label: 'Free Space', action: 'free_space' },
        { label: 'Retry', action: 'retry' },
      ];

    default:
      return [
        { label: 'Retry', action: 'retry' },
        { label: 'Restart App', action: 'restart_app' },
      ];
  }
};

/**
 * Process error and return standardized error object
 */
export const processError = (error) => {
  const category = categorizeError(error);
  const severity = getErrorSeverity(error, category);
  const userMessage = getUserFriendlyMessage(error, category);
  const recoveryActions = getRecoveryActions(error, category);

  return {
    originalError: error,
    category,
    severity,
    userMessage,
    recoveryActions,
    timestamp: new Date().toISOString(),
    context: {
      code: error.code,
      status: error.status,
      message: error.message,
    },
  };
};

/**
 * Error logging utility
 */
export const logError = (processedError, context = {}) => {
  const logEntry = {
    ...processedError,
    context: {
      ...processedError.context,
      ...context,
    },
  };

  // In development, log to console
  if (__DEV__) {
    console.group(`🚨 ${processedError.category} Error`);
    console.error('Message:', processedError.userMessage);
    console.error('Severity:', processedError.severity);
    console.error('Original Error:', processedError.originalError);
    console.error('Context:', logEntry.context);
    console.groupEnd();
  }

  // In production, send to error tracking service
  // TODO: Integrate with error tracking service like Sentry
  // if (!__DEV__) {
  //   ErrorTrackingService.captureException(logEntry);
  // }

  return logEntry;
};

/**
 * Handle error with user feedback
 */
export const handleError = (error, context = {}, options = {}) => {
  const processedError = processError(error);
  const loggedError = logError(processedError, context);

  // Show user feedback based on severity
  if (options.showAlert !== false) {
    const title = getErrorTitle(processedError.category, processedError.severity);
    const message = processedError.userMessage;
    const buttons = processedError.recoveryActions.map(action => ({
      text: action.label,
      style: action.action === 'retry' ? 'default' : 'cancel',
      onPress: () => {
        if (options.onAction) {
          options.onAction(action.action, processedError);
        }
      },
    }));

    // Import Alert dynamically to avoid circular dependencies
    import('react-native').then(({ Alert }) => {
      Alert.alert(title, message, buttons, { cancelable: true });
    });
  }

  return loggedError;
};

/**
 * Get error title based on category and severity
 */
const getErrorTitle = (category, severity) => {
  switch (severity) {
    case ERROR_SEVERITY.CRITICAL:
      return '⚠️ Critical Error';
    case ERROR_SEVERITY.HIGH:
      return '❌ Error';
    case ERROR_SEVERITY.MEDIUM:
      return '⚠️ Warning';
    case ERROR_SEVERITY.LOW:
      return 'ℹ️ Notice';
    default:
      return 'ℹ️ Information';
  }
};

/**
 * Error boundary for React components
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const processedError = processError(error);
    logError(processedError, { errorInfo, component: 'ErrorBoundary' });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {getUserFriendlyMessage(this.state.error, categorizeError(this.state.error))}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = {
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
};

export default {
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  categorizeError,
  getErrorSeverity,
  getUserFriendlyMessage,
  getRecoveryActions,
  processError,
  logError,
  handleError,
  ErrorBoundary,
};
