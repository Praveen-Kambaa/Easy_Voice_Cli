import { Platform, Linking, NativeModules } from 'react-native';
import { showGlobalAlert } from './alertPresenter';

const { AndroidPermissionsModule } = NativeModules;

/**
 * Android Permission Helper Utilities
 * Handles overlay and accessibility permissions for Android
 */

// Permission types
export const ANDROID_PERMISSIONS = {
  OVERLAY: 'SYSTEM_ALERT_WINDOW',
  ACCESSIBILITY: 'ACCESSIBILITY_SERVICE',
};

// Permission names for UI display
export const PERMISSION_NAMES = {
  OVERLAY: 'Overlay',
  ACCESSIBILITY: 'Accessibility',
};

/**
 * Check if overlay permission is granted
 * Uses Settings.canDrawOverlays() for Android 6.0+
 */
export const checkOverlayPermission = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    if (AndroidPermissionsModule) {
      return await AndroidPermissionsModule.checkOverlayPermission();
    }
    // Fallback for when native module is not available
    console.warn('AndroidPermissionsModule not available, returning false');
    return false;
  } catch (error) {
    console.error('Error checking overlay permission:', error);
    return false;
  }
};

/**
 * Check if accessibility service is enabled
 */
export const checkAccessibilityPermission = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    if (AndroidPermissionsModule) {
      return await AndroidPermissionsModule.checkAccessibilityPermission();
    }
    // Fallback for when native module is not available
    console.warn('AndroidPermissionsModule not available, returning false');
    return false;
  } catch (error) {
    console.error('Error checking accessibility permission:', error);
    return false;
  }
};

/**
 * Open Android overlay permission settings
 * Uses ACTION_MANAGE_OVERLAY_PERMISSION with package URI
 * Does NOT use Linking.openSettings() which opens wrong screen
 */
export const openOverlaySettings = async () => {
  if (Platform.OS !== 'android') {
    throw new Error('Overlay settings are only available on Android');
  }

  if (!AndroidPermissionsModule) {
    throw new Error('AndroidPermissionsModule not available. Make sure native module is properly linked.');
  }

  try {
    await AndroidPermissionsModule.openOverlaySettings();
  } catch (error) {
    console.error('Error opening overlay settings:', error);
    throw new Error(`Failed to open overlay settings: ${error.message}`);
  }
};

/**
 * Open Android accessibility settings
 * Uses ACTION_ACCESSIBILITY_SETTINGS
 * Does NOT use Linking.openSettings() which opens wrong screen
 */
export const openAccessibilitySettings = async () => {
  if (Platform.OS !== 'android') {
    throw new Error('Accessibility settings are only available on Android');
  }

  if (!AndroidPermissionsModule) {
    throw new Error('AndroidPermissionsModule not available. Make sure native module is properly linked.');
  }

  try {
    await AndroidPermissionsModule.openAccessibilitySettings();
  } catch (error) {
    console.error('Error opening accessibility settings:', error);
    throw new Error(`Failed to open accessibility settings: ${error.message}`);
  }
};

/**
 * Get Android version for compatibility checks
 */
export const getAndroidVersion = () => {
  if (Platform.OS !== 'android') {
    return 0;
  }
  
  return Platform.Version;
};

/**
 * Check if device supports overlay permission (Android 6.0+)
 */
export const supportsOverlayPermission = () => {
  const androidVersion = getAndroidVersion();
  return androidVersion >= 23; // Android 6.0 (Marshmallow)
};

/**
 * Check if device supports accessibility services
 */
export const supportsAccessibilityService = () => {
  // Accessibility services are supported on all Android versions
  return Platform.OS === 'android';
};

/**
 * Get overlay permission explanation text
 */
export const getOverlayExplanation = () => {
  return [
    'This app needs overlay permission to display content over other apps.',
    'This allows us to show important information and controls when you need them.',
    'To enable this permission:',
    '1. Tap "Open Settings" below',
    '2. Find "Display over other apps" or "Draw over other apps"',
    '3. Enable the toggle for this app',
    '4. Return to the app to continue',
  ];
};

/**
 * Get accessibility permission explanation text
 */
export const getAccessibilityExplanation = () => {
  return [
    'This app needs accessibility service permission to provide enhanced functionality.',
    'This allows us to interact with system elements and provide better user experience.',
    'To enable this permission:',
    '1. Tap "Open Settings" below',
    '2. Find "Accessibility" or "Accessibility Services"',
    '3. Locate this app in the services list',
    '4. Enable the toggle for this app',
    '5. Grant the requested permissions',
    '6. Return to the app to continue',
  ];
};

/**
 * Show permission denied dialog with option to open settings
 */
export const showPermissionDeniedDialog = (permissionName, openSettingsCallback) => {
  const explanation = permissionName === PERMISSION_NAMES.OVERLAY 
    ? getOverlayExplanation() 
    : getAccessibilityExplanation();

  showGlobalAlert(`${permissionName} Permission Required`, explanation.join('\n\n'), [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: openSettingsCallback },
  ]);
};

/**
 * Check if we need to show permission rationale
 * Based on Android version and previous denials
 */
export const shouldShowPermissionRationale = (permissionType) => {
  // This would typically track previous denials
  // For now, we'll always show rationale for better UX
  return true;
};

/**
 * Request overlay permission with proper flow
 */
export const requestOverlayPermission = async () => {
  if (!supportsOverlayPermission()) {
    showGlobalAlert(
      'Not Supported',
      'Overlay permission is not supported on this Android version.'
    );
    return false;
  }

  const hasPermission = await checkOverlayPermission();
  if (hasPermission) {
    return true;
  }

  // Show rationale and redirect to settings
  return new Promise((resolve) => {
    showPermissionDeniedDialog(
      PERMISSION_NAMES.OVERLAY,
      async () => {
        await openOverlaySettings();
        // Note: We can't automatically check after returning from settings
        // The app will need to check again when resumed
        resolve(false);
      }
    );
  });
};

/**
 * Request accessibility permission with proper flow
 */
export const requestAccessibilityPermission = async () => {
  if (!supportsAccessibilityService()) {
    showGlobalAlert(
      'Not Supported',
      'Accessibility services are not supported on this platform.'
    );
    return false;
  }

  const hasPermission = await checkAccessibilityPermission();
  if (hasPermission) {
    return true;
  }

  // Show rationale and redirect to settings
  return new Promise((resolve) => {
    showPermissionDeniedDialog(
      PERMISSION_NAMES.ACCESSIBILITY,
      async () => {
        await openAccessibilitySettings();
        // Note: We can't automatically check after returning from settings
        // The app will need to check again when resumed
        resolve(false);
      }
    );
  });
};
