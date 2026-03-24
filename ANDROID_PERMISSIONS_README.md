# Android Overlay & Accessibility Permissions

This React Native implementation provides a production-ready solution for requesting Android overlay and accessibility permissions with Google Play compliance.

## Features

- ✅ **Overlay Permission (Draw over other apps)**
- ✅ **Accessibility Service Permission**
- ✅ **Google Play Compliant** - Clear user explanations before redirecting to settings
- ✅ **Reusable Modal Component** - Consistent UI for all permission requests
- ✅ **Clean Architecture** - Modular code with separation of concerns
- ✅ **Android Version Compatibility** - Works with target SDK 33+
- ✅ **Error Handling** - Comprehensive error states and fallbacks
- ✅ **TypeScript Support** - Full type safety

## File Structure

```
src/
├── components/
│   ├── PermissionModal.js          # Reusable permission modal component
│   └── PermissionDashboard.js       # Existing standard permissions dashboard
├── hooks/
│   ├── useAndroidPermissions.js     # Custom hook for Android permissions
│   └── usePermissionsManager.js    # Existing standard permissions hook
├── screens/
│   └── AndroidPermissionsScreen.js # Example screen demonstrating usage
├── utils/
│   └── AndroidPermissions.js       # Permission helper utilities
└── App.tsx                         # Main app with navigation demo

android/app/src/main/java/com/evcli/
├── AndroidPermissionsModule.java   # Native Android module
├── AndroidPermissionsPackage.java  # Native package registration
├── MainApplication.kt              # Updated to include native module
└── MainActivity.kt                 # Existing main activity
```

## Setup Instructions

### 1. Native Module Integration

The native Android module is already created and registered. The files include:

- `AndroidPermissionsModule.java` - Core permission checking and settings navigation
- `AndroidPermissionsPackage.java` - Package registration for React Native
- `MainApplication.kt` - Updated to include the package

### 2. Android Manifest Permissions

Add these permissions to your `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Overlay Permission -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

<!-- Accessibility Permission (if implementing accessibility service) -->
<uses-permission android:name="android.permission.BIND_ACCESSIBILITY_SERVICE" />
```

### 3. Accessibility Service (Optional)

If you're implementing an actual accessibility service, create:

`android/app/src/main/res/xml/accessibility_service_config.xml`:

```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault"
    android:canRetrieveWindowContent="true"
    android:description="@string/accessibility_service_description" />
```

And add to your manifest:

```xml
<service
    android:name=".YourAccessibilityService"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

## Usage Examples

### Basic Usage with Hook

```javascript
import React from 'react';
import { View, Button, Alert } from 'react-native';
import { useAndroidPermissions } from '../hooks/useAndroidPermissions';

const MyComponent = () => {
  const {
    permissionStates,
    requestPermission,
    isPermissionGranted,
    PERMISSION_NAMES,
  } = useAndroidPermissions();

  const handleOverlayRequest = async () => {
    const granted = await requestPermission(PERMISSION_NAMES.OVERLAY);
    if (granted) {
      Alert.alert('Success', 'Overlay permission granted!');
    }
  };

  return (
    <View>
      <Button
        title="Request Overlay Permission"
        onPress={handleOverlayRequest}
        disabled={isPermissionGranted(PERMISSION_NAMES.OVERLAY)}
      />
    </View>
  );
};
```

### Using the Modal Directly

```javascript
import React, { useState } from 'react';
import PermissionModal from '../components/PermissionModal';
import { PERMISSION_NAMES } from '../utils/AndroidPermissions';

const MyScreen = () => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleConfirm = () => {
    // Open settings logic here
    setModalVisible(false);
  };

  return (
    <PermissionModal
      visible={modalVisible}
      permissionType={PERMISSION_NAMES.OVERLAY}
      onConfirm={handleConfirm}
      onCancel={() => setModalVisible(false)}
    />
  );
};
```

## API Reference

### useAndroidPermissions Hook

#### Returns

```javascript
{
  // States
  permissionStates: object,    // Current permission states
  loading: object,            // Loading states for each permission
  modalVisible: object,       // Modal visibility states
  errors: object,             // Error states

  // Methods
  checkPermission: function,  // Check specific permission
  checkAllPermissions: function, // Check all permissions
  requestPermission: function,   // Request permission with modal
  refreshPermission: function,   // Refresh permission status
  handleModalConfirm: function, // Handle modal confirm
  handleModalCancel: function,   // Handle modal cancel

  // Utilities
  isPermissionSupported: function, // Check if permission is supported
  isPermissionGranted: function,   // Check if permission is granted
  isPermissionLoading: function,   // Check if permission is loading
  getPermissionStatusText: function, // Get status text
  getPermissionStatusColor: function, // Get status color
  getPermissionError: function,      // Get permission error
  clearPermissionError: function,   // Clear permission error

  // Constants
  PERMISSION_NAMES: object, // Permission name constants
}
```

#### Permission Types

```javascript
PERMISSION_NAMES = {
  OVERLAY: 'Overlay',
  ACCESSIBILITY: 'Accessibility',
}
```

### AndroidPermissions Utils

#### Functions

- `checkOverlayPermission()` - Check overlay permission status
- `checkAccessibilityPermission()` - Check accessibility permission status
- `openOverlaySettings()` - Open overlay permission settings
- `openAccessibilitySettings()` - Open accessibility settings
- `supportsOverlayPermission()` - Check if device supports overlay
- `supportsAccessibilityService()` - Check if device supports accessibility
- `getOverlayExplanation()` - Get overlay permission explanation
- `getAccessibilityExplanation()` - Get accessibility permission explanation

## Google Play Compliance

This implementation follows Google Play policies:

1. **Clear Purpose**: Each permission request includes clear explanations of why the permission is needed
2. **User Control**: Users can deny permissions and continue using the app
3. **Settings Redirect**: Direct navigation to appropriate settings screens
4. **No Deception**: Honest and transparent permission requests
5. **Privacy First**: Minimal data collection and clear privacy notices

## Android Version Compatibility

- **Minimum SDK**: Android 6.0 (API 23) for overlay permissions
- **Target SDK**: Tested with API 33+
- **Accessibility**: Supported on all Android versions
- **Overlay**: Automatic grant on Android < 6.0

## Error Handling

The implementation includes comprehensive error handling:

- **Native Module Errors**: Graceful fallbacks when native module is unavailable
- **Settings Navigation**: Fallback to app settings if specific settings fail
- **Permission Checks**: Proper error states and retry mechanisms
- **User Experience**: Clear error messages and recovery options

## Testing

To test the implementation:

1. **Overlay Permission**:
   - Install app on Android device
   - Request overlay permission
   - Verify settings navigation
   - Test permission state after enabling

2. **Accessibility Permission**:
   - Request accessibility permission
   - Verify navigation to accessibility settings
   - Test permission state after enabling service

3. **Edge Cases**:
   - Test on different Android versions
   - Test with permissions denied
   - Test with permissions blocked
   - Test app resume after settings changes

## Troubleshooting

### Common Issues

1. **Native Module Not Found**:
   - Rebuild the app: `npx react-native run-android`
   - Clean build: `cd android && ./gradlew clean`

2. **Permission Always False**:
   - Check if native module is properly registered
   - Verify Android manifest permissions
   - Test on physical device (not emulator)

3. **Settings Not Opening**:
   - Check Android version compatibility
   - Verify package name resolution
   - Test fallback to app settings

### Debug Logging

Enable debug logging to troubleshoot:

```javascript
// In development, add logging to see permission states
console.log('Permission states:', permissionStates);
console.log('Loading states:', loading);
console.log('Error states:', errors);
```

## Contributing

When contributing to this implementation:

1. Follow the existing code style and patterns
2. Add comprehensive error handling
3. Update documentation for any API changes
4. Test on multiple Android versions
5. Ensure Google Play compliance

## License

This implementation follows the same license as the main project.
