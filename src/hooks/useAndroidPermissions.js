import { useState, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import {
  checkOverlayPermission,
  checkAccessibilityPermission,
  openOverlaySettings,
  openAccessibilitySettings,
  requestOverlayPermission,
  requestAccessibilityPermission,
  supportsOverlayPermission,
  supportsAccessibilityService,
  PERMISSION_NAMES,
} from '../utils/AndroidPermissions';

/**
 * Custom hook for managing Android overlay and accessibility permissions
 * Provides clean API for checking, requesting, and monitoring permissions
 */
export const useAndroidPermissions = () => {
  // Permission states
  const [permissionStates, setPermissionStates] = useState({
    [PERMISSION_NAMES.OVERLAY]: false,
    [PERMISSION_NAMES.ACCESSIBILITY]: false,
  });

  // Loading states
  const [loading, setLoading] = useState({
    [PERMISSION_NAMES.OVERLAY]: false,
    [PERMISSION_NAMES.ACCESSIBILITY]: false,
  });

  // Modal visibility states
  const [modalVisible, setModalVisible] = useState({
    [PERMISSION_NAMES.OVERLAY]: false,
    [PERMISSION_NAMES.ACCESSIBILITY]: false,
  });

  // Error states
  const [errors, setErrors] = useState({
    [PERMISSION_NAMES.OVERLAY]: null,
    [PERMISSION_NAMES.ACCESSIBILITY]: null,
  });

  /**
   * Check a specific permission status
   */
  const checkPermission = useCallback(async (permissionType) => {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      setLoading(prev => ({ ...prev, [permissionType]: true }));
      setErrors(prev => ({ ...prev, [permissionType]: null }));

      let hasPermission = false;
      
      switch (permissionType) {
        case PERMISSION_NAMES.OVERLAY:
          hasPermission = await checkOverlayPermission();
          break;
        case PERMISSION_NAMES.ACCESSIBILITY:
          hasPermission = await checkAccessibilityPermission();
          break;
        default:
          throw new Error(`Unknown permission type: ${permissionType}`);
      }

      setPermissionStates(prev => ({ ...prev, [permissionType]: hasPermission }));
      return hasPermission;
    } catch (error) {
      console.error(`Error checking ${permissionType} permission:`, error);
      setErrors(prev => ({ ...prev, [permissionType]: error.message }));
      return false;
    } finally {
      setLoading(prev => ({ ...prev, [permissionType]: false }));
    }
  }, []);

  /**
   * Check all permissions
   */
  const checkAllPermissions = useCallback(async () => {
    const results = {};
    
    for (const permissionType of Object.values(PERMISSION_NAMES)) {
      results[permissionType] = await checkPermission(permissionType);
    }
    
    return results;
  }, [checkPermission]);

  /**
   * Request a specific permission with proper flow
   */
  const requestPermission = useCallback(async (permissionType) => {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      // Check if permission is already granted
      const hasPermission = await checkPermission(permissionType);
      if (hasPermission) {
        return true;
      }

      // Show modal for user confirmation
      setModalVisible(prev => ({ ...prev, [permissionType]: true }));
      return false;
    } catch (error) {
      console.error(`Error requesting ${permissionType} permission:`, error);
      setErrors(prev => ({ ...prev, [permissionType]: error.message }));
      return false;
    }
  }, [checkPermission]);

  /**
   * Handle modal confirmation - open settings
   */
  const handleModalConfirm = useCallback(async (permissionType) => {
    try {
      setLoading(prev => ({ ...prev, [permissionType]: true }));
      setModalVisible(prev => ({ ...prev, [permissionType]: false }));

      switch (permissionType) {
        case PERMISSION_NAMES.OVERLAY:
          await openOverlaySettings();
          break;
        case PERMISSION_NAMES.ACCESSIBILITY:
          await openAccessibilitySettings();
          break;
        default:
          throw new Error(`Unknown permission type: ${permissionType}`);
      }
    } catch (error) {
      console.error(`Error opening settings for ${permissionType}:`, error);
      setErrors(prev => ({ ...prev, [permissionType]: error.message }));
    } finally {
      setLoading(prev => ({ ...prev, [permissionType]: false }));
    }
  }, []);

  /**
   * Handle modal cancellation
   */
  const handleModalCancel = useCallback((permissionType) => {
    setModalVisible(prev => ({ ...prev, [permissionType]: false }));
  }, []);

  /**
   * Check if permission is supported on this device
   */
  const isPermissionSupported = useCallback((permissionType) => {
    switch (permissionType) {
      case PERMISSION_NAMES.OVERLAY:
        return supportsOverlayPermission();
      case PERMISSION_NAMES.ACCESSIBILITY:
        return supportsAccessibilityService();
      default:
        return false;
    }
  }, []);

  /**
   * Get permission status text
   */
  const getPermissionStatusText = useCallback((permissionType) => {
    const hasPermission = permissionStates[permissionType];
    const isLoading = loading[permissionType];
    const hasError = errors[permissionType];
    const isSupported = isPermissionSupported(permissionType);

    if (!isSupported) {
      return 'Not Supported';
    }
    
    if (isLoading) {
      return 'Checking...';
    }
    
    if (hasError) {
      return 'Error';
    }
    
    return hasPermission ? 'Granted' : 'Not Granted';
  }, [permissionStates, loading, errors, isPermissionSupported]);

  /**
   * Get permission status color
   */
  const getPermissionStatusColor = useCallback((permissionType) => {
    const hasPermission = permissionStates[permissionType];
    const isLoading = loading[permissionType];
    const hasError = errors[permissionType];
    const isSupported = isPermissionSupported(permissionType);

    if (!isSupported) {
      return '#9E9E9E'; // Gray
    }
    
    if (isLoading) {
      return '#2196F3'; // Blue
    }
    
    if (hasError) {
      return '#F44336'; // Red
    }
    
    return hasPermission ? '#4CAF50' : '#FF9800'; // Green or Orange
  }, [permissionStates, loading, errors, isPermissionSupported]);

  /**
   * Check if permission is granted
   */
  const isPermissionGranted = useCallback((permissionType) => {
    return permissionStates[permissionType] === true;
  }, [permissionStates]);

  /**
   * Check if permission is loading
   */
  const isPermissionLoading = useCallback((permissionType) => {
    return loading[permissionType] === true;
  }, [loading]);

  /**
   * Get permission error
   */
  const getPermissionError = useCallback((permissionType) => {
    return errors[permissionType];
  }, [errors]);

  /**
   * Clear permission error
   */
  const clearPermissionError = useCallback((permissionType) => {
    setErrors(prev => ({ ...prev, [permissionType]: null }));
  }, []);

  /**
   * Refresh permission status (useful after returning from settings)
   */
  const refreshPermission = useCallback(async (permissionType) => {
    return await checkPermission(permissionType);
  }, [checkPermission]);

  /**
   * Handle app state changes to refresh permissions when app resumes
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground, refresh permissions
        checkAllPermissions();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [checkAllPermissions]);

  /**
   * Check permissions on mount
   */
  useEffect(() => {
    if (Platform.OS === 'android') {
      checkAllPermissions();
    }
  }, [checkAllPermissions]);

  return {
    // Permission states
    permissionStates,
    loading,
    modalVisible,
    errors,
    
    // Permission checking
    checkPermission,
    checkAllPermissions,
    refreshPermission,
    
    // Permission requesting
    requestPermission,
    
    // Modal handling
    handleModalConfirm,
    handleModalCancel,
    
    // Permission utilities
    isPermissionSupported,
    isPermissionGranted,
    isPermissionLoading,
    getPermissionStatusText,
    getPermissionStatusColor,
    getPermissionError,
    clearPermissionError,
    
    // Constants
    PERMISSION_NAMES,
  };
};
