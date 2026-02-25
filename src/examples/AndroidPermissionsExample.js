import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import {
  checkOverlayPermission,
  checkAccessibilityPermission,
  openOverlaySettings,
  openAccessibilitySettings,
  PERMISSION_NAMES,
} from '../utils/AndroidPermissions';

/**
 * Example component demonstrating proper Android permissions usage
 * This shows the correct way to use the native module without Linking.openSettings()
 */
const AndroidPermissionsExample = () => {
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);
  const [loading, setLoading] = useState({
    overlay: false,
    accessibility: false,
  });

  // Check overlay permission status
  const checkOverlayStatus = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'This feature is only available on Android');
      return;
    }

    setLoading(prev => ({ ...prev, overlay: true }));
    try {
      const granted = await checkOverlayPermission();
      setOverlayGranted(granted);
    } catch (error) {
      console.error('Error checking overlay permission:', error);
      Alert.alert('Error', 'Failed to check overlay permission');
    } finally {
      setLoading(prev => ({ ...prev, overlay: false }));
    }
  };

  // Check accessibility permission status
  const checkAccessibilityStatus = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'This feature is only available on Android');
      return;
    }

    setLoading(prev => ({ ...prev, accessibility: true }));
    try {
      const granted = await checkAccessibilityPermission();
      setAccessibilityGranted(granted);
    } catch (error) {
      console.error('Error checking accessibility permission:', error);
      Alert.alert('Error', 'Failed to check accessibility permission');
    } finally {
      setLoading(prev => ({ ...prev, accessibility: false }));
    }
  };

  // Request overlay permission - opens specific overlay settings screen
  const requestOverlayPermission = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'This feature is only available on Android');
      return;
    }

    try {
      // First check if already granted
      const granted = await checkOverlayPermission();
      if (granted) {
        Alert.alert('Already Granted', 'Overlay permission is already granted');
        setOverlayGranted(true);
        return;
      }

      // Open overlay settings using ACTION_MANAGE_OVERLAY_PERMISSION
      // This opens the specific "Display over other apps" screen
      // NOT the generic app info screen
      await openOverlaySettings();
      
      Alert.alert(
        'Settings Opened',
        'Please enable "Display over other apps" permission for this app, then return to check status.'
      );
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
      Alert.alert('Error', `Failed to open overlay settings: ${error.message}`);
    }
  };

  // Request accessibility permission - opens specific accessibility settings screen
  const requestAccessibilityPermission = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'This feature is only available on Android');
      return;
    }

    try {
      // First check if already granted
      const granted = await checkAccessibilityPermission();
      if (granted) {
        Alert.alert('Already Enabled', 'Accessibility service is already enabled');
        setAccessibilityGranted(true);
        return;
      }

      // Open accessibility settings using ACTION_ACCESSIBILITY_SETTINGS
      // This opens the specific accessibility services screen
      // NOT the generic app info screen
      await openAccessibilitySettings();
      
      Alert.alert(
        'Settings Opened',
        'Please find this app in the accessibility services list and enable it, then return to check status.'
      );
    } catch (error) {
      console.error('Error requesting accessibility permission:', error);
      Alert.alert('Error', `Failed to open accessibility settings: ${error.message}`);
    }
  };

  // Check all permissions on component mount
  React.useEffect(() => {
    if (Platform.OS === 'android') {
      checkOverlayStatus();
      checkAccessibilityStatus();
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Android Permissions Example</Text>
      <Text style={styles.subtitle}>
        Demonstrates proper native module usage without Linking.openSettings()
      </Text>

      {/* Overlay Permission Section */}
      <View style={styles.permissionSection}>
        <Text style={styles.sectionTitle}>Overlay Permission</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[
            styles.statusValue,
            { color: overlayGranted ? '#4CAF50' : '#FF9800' }
          ]}>
            {overlayGranted ? 'Granted' : 'Not Granted'}
          </Text>
        </View>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.checkButton]}
            onPress={checkOverlayStatus}
            disabled={loading.overlay}
          >
            <Text style={styles.buttonText}>
              {loading.overlay ? 'Checking...' : 'Check Status'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, overlayGranted ? styles.grantedButton : styles.requestButton]}
            onPress={requestOverlayPermission}
            disabled={loading.overlay || overlayGranted}
          >
            <Text style={styles.buttonText}>
              {overlayGranted ? 'Granted' : 'Request'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Accessibility Permission Section */}
      <View style={styles.permissionSection}>
        <Text style={styles.sectionTitle}>Accessibility Service</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[
            styles.statusValue,
            { color: accessibilityGranted ? '#4CAF50' : '#FF9800' }
          ]}>
            {accessibilityGranted ? 'Enabled' : 'Not Enabled'}
          </Text>
        </View>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.checkButton]}
            onPress={checkAccessibilityStatus}
            disabled={loading.accessibility}
          >
            <Text style={styles.buttonText}>
              {loading.accessibility ? 'Checking...' : 'Check Status'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, accessibilityGranted ? styles.grantedButton : styles.requestButton]}
            onPress={requestAccessibilityPermission}
            disabled={loading.accessibility || accessibilityGranted}
          >
            <Text style={styles.buttonText}>
              {accessibilityGranted ? 'Enabled' : 'Request'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Important Notes */}
      <View style={styles.notesSection}>
        <Text style={styles.notesTitle}>Important Notes:</Text>
        <Text style={styles.noteText}>
          • This implementation uses native Android intents, NOT Linking.openSettings()
        </Text>
        <Text style={styles.noteText}>
          • ACTION_MANAGE_OVERLAY_PERMISSION opens the specific overlay permission screen
        </Text>
        <Text style={styles.noteText}>
          • ACTION_ACCESSIBILITY_SETTINGS opens the accessibility services screen
        </Text>
        <Text style={styles.noteText}>
          • Both methods open the correct settings screens, NOT the generic app info page
        </Text>
        <Text style={styles.noteText}>
          • After enabling permissions, return to app and check status to verify
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  permissionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    color: '#5A6C7D',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 44,
  },
  checkButton: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  requestButton: {
    backgroundColor: '#3498DB',
  },
  grantedButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  notesSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#7F6000',
    lineHeight: 18,
    marginBottom: 4,
  },
});

export default AndroidPermissionsExample;
