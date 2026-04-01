import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';

const PERMISSION_TYPES = {
  MICROPHONE: Platform.OS === 'ios' ? PERMISSIONS.IOS.MICROPHONE : PERMISSIONS.ANDROID.RECORD_AUDIO,
};

const PERMISSION_NAMES = {
  MICROPHONE: 'Microphone',
};

export const usePermissionsManager = () => {
  const [permissionStatuses, setPermissionStatuses] = useState({
    [PERMISSION_NAMES.MICROPHONE]: RESULTS.UNAVAILABLE,
  });

  const [loading, setLoading] = useState(false);

  // Check permission status
  const checkPermission = useCallback(async (permissionType) => {
    try {
      const permission = PERMISSION_TYPES[permissionType];
      if (!permission) return RESULTS.UNAVAILABLE;

      const result = await check(permission);
      return result;
    } catch (error) {
      console.error(`Error checking ${permissionType} permission:`, error);
      return RESULTS.UNAVAILABLE;
    }
  }, []);

  // Request permission
  const requestPermission = useCallback(async (permissionType) => {
    try {
      setLoading(true);
      const permission = PERMISSION_TYPES[permissionType];
      if (!permission) return RESULTS.UNAVAILABLE;

      const result = await request(permission);
      
      // Update the status in state
      setPermissionStatuses(prev => ({
        ...prev,
        [PERMISSION_NAMES[permissionType]]: result,
      }));

      return result;
    } catch (error) {
      console.error(`Error requesting ${permissionType} permission:`, error);
      return RESULTS.UNAVAILABLE;
    } finally {
      setLoading(false);
    }
  }, []);

  // Check all permissions on mount
  const checkAllPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = {};
      
      for (const [key, name] of Object.entries(PERMISSION_NAMES)) {
        statuses[name] = await checkPermission(key);
      }
      
      setPermissionStatuses(statuses);
    } catch (error) {
      console.error('Error checking all permissions:', error);
    } finally {
      setLoading(false);
    }
  }, [checkPermission]);

  // Open app settings
  const openAppSettings = useCallback(() => {
    openSettings().catch(error => {
      console.error('Error opening app settings:', error);
    });
  }, []);

  // Get permission status with user-friendly text
  const getPermissionStatusText = useCallback((status) => {
    switch (status) {
      case RESULTS.GRANTED:
        return 'Granted';
      case RESULTS.DENIED:
        return 'Denied';
      case RESULTS.BLOCKED:
        return 'Blocked';
      case RESULTS.LIMITED:
        return 'Limited';
      case RESULTS.UNAVAILABLE:
        return 'Unavailable';
      default:
        return 'Unknown';
    }
  }, []);

  // Check if permission is granted
  const isPermissionGranted = useCallback((permissionType) => {
    const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  }, [permissionStatuses]);

  // Check if permission is blocked (needs settings)
  const isPermissionBlocked = useCallback((permissionType) => {
    const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
    return status === RESULTS.BLOCKED;
  }, [permissionStatuses]);

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  return {
    permissionStatuses,
    loading,
    requestPermission,
    checkAllPermissions,
    openAppSettings,
    getPermissionStatusText,
    isPermissionGranted,
    isPermissionBlocked,
    PERMISSION_NAMES,
  };
};
