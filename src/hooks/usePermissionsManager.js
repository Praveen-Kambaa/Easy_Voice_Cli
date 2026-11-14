import logger from '../utils/logger';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  check,
  request,
  requestMultiple,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';

const PERMISSION_TYPES = {
  MICROPHONE:
    Platform.OS === 'ios'
      ? PERMISSIONS.IOS.MICROPHONE
      : PERMISSIONS.ANDROID.RECORD_AUDIO,
  ...(Platform.OS === 'android'
    ? {
        CALL_LOG: PERMISSIONS.ANDROID.READ_CALL_LOG,
        PHONE: PERMISSIONS.ANDROID.READ_PHONE_STATE,
        CONTACTS: PERMISSIONS.ANDROID.READ_CONTACTS,
        STORAGE:
          Platform.Version >= 33
            ? PERMISSIONS.ANDROID.READ_MEDIA_AUDIO
            : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        ...(Platform.Version >= 33
          ? { NOTIFICATIONS: PERMISSIONS.ANDROID.POST_NOTIFICATIONS }
          : {}),
      }
    : {}),
};

const PERMISSION_NAMES = {
  MICROPHONE: 'Microphone',
  ...(Platform.OS === 'android'
    ? {
        CALL_LOG: 'Call Logs',
        PHONE: 'Phone State',
        CONTACTS: 'Contacts',
        STORAGE: 'Audio & Storage',
        ...(Platform.Version >= 33
          ? { NOTIFICATIONS: 'Notifications' }
          : {}),
      }
    : {}),
};

export const usePermissionsManager = () => {
  const [permissionStatuses, setPermissionStatuses] = useState(() => {
    const initial = {};
    for (const name of Object.values(PERMISSION_NAMES)) {
      initial[name] = RESULTS.UNAVAILABLE;
    }
    return initial;
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
      logger.error(`Error checking ${permissionType} permission:`, error);
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
      setPermissionStatuses((prev) => ({
        ...prev,
        [PERMISSION_NAMES[permissionType]]: result,
      }));

      return result;
    } catch (error) {
      logger.error(`Error requesting ${permissionType} permission:`, error);
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
      logger.error('Error checking all permissions:', error);
    } finally {
      setLoading(false);
    }
  }, [checkPermission]);

  // Request all pending or denied permissions at once
  const requestAllPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const permsToRequest = Object.values(PERMISSION_TYPES).filter(Boolean);
      if (permsToRequest.length > 0) {
        await requestMultiple(permsToRequest);
      }
      await checkAllPermissions();
    } catch (error) {
      logger.error('Error requesting all permissions:', error);
    } finally {
      setLoading(false);
    }
  }, [checkAllPermissions]);

  // Open app settings
  const openAppSettings = useCallback(() => {
    openSettings().catch((error) => {
      logger.error('Error opening app settings:', error);
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
  const isPermissionGranted = useCallback(
    (permissionType) => {
      const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
      return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
    },
    [permissionStatuses],
  );

  // Check if permission is blocked (needs settings)
  const isPermissionBlocked = useCallback(
    (permissionType) => {
      const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
      return status === RESULTS.BLOCKED;
    },
    [permissionStatuses],
  );

  // Check if permission is denied
  const isPermissionDenied = useCallback(
    (permissionType) => {
      const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
      return status === RESULTS.DENIED;
    },
    [permissionStatuses],
  );

  // Check whether any permission is currently blocked or denied
  const hasBlockedOrDeniedPermissions = useMemo(() => {
    return Object.values(permissionStatuses).some(
      (status) => status === RESULTS.BLOCKED || status === RESULTS.DENIED,
    );
  }, [permissionStatuses]);

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  return {
    permissionStatuses,
    loading,
    requestPermission,
    requestAllPermissions,
    checkAllPermissions,
    openAppSettings,
    getPermissionStatusText,
    isPermissionGranted,
    isPermissionBlocked,
    isPermissionDenied,
    hasBlockedOrDeniedPermissions,
    PERMISSION_NAMES,
  };
};
