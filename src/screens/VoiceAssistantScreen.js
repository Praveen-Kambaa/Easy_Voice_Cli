import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';

/**
 * Voice Assistant Screen
 * Controls floating voice assistant overlay and manages permissions
 */
const VoiceAssistantScreen = () => {
  const {
    permissions,
    isOverlayActive,
    loading,
    checkPermissions,
    areAllPermissionsGranted,
    isReadyToStart,
    getMissingPermissions,
    startOverlay,
    stopOverlay,
    openOverlaySettings,
    openAccessibilitySettings,
    requestRecordAudioPermission,
  } = useVoiceAssistant();

  /**
   * Handle start overlay button press
   */
  const handleStartOverlay = async () => {
    if (!areAllPermissionsGranted()) {
      const missing = await getMissingPermissions();
      showPermissionAlert(missing);
      return;
    }

    startOverlay();
  };

  /**
   * Show permission alert with options
   */
  const showPermissionAlert = (missingPermissions) => {
    const permissionList = missingPermissions.join(', ');
    
    Alert.alert(
      'Permissions Required',
      `The following permissions are required for voice assistant:\n\n${permissionList}\n\nPlease enable them to continue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => openSettingsForMissing(missingPermissions) },
      ]
    );
  };

  /**
   * Open appropriate settings based on missing permissions
   */
  const openSettingsForMissing = (missingPermissions) => {
    if (missingPermissions.includes('Overlay')) {
      openOverlaySettings();
    } else if (missingPermissions.includes('Accessibility')) {
      openAccessibilitySettings();
    } else if (missingPermissions.includes('Record Audio')) {
      requestRecordAudioPermission();
    }
  };

  /**
   * Render permission status card
   */
  const renderPermissionCard = (title, key, granted, description) => (
    <View key={key} style={styles.permissionCard}>
      <View style={styles.permissionHeader}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: granted ? '#4CAF50' : '#FF9800' }]}>
          <Text style={[styles.statusText, { color: '#FFFFFF' }]}>
            {granted ? 'Granted' : 'Not Granted'}
          </Text>
        </View>
      </View>
      <Text style={styles.permissionDescription}>{description}</Text>
    </View>
  );

  if (Platform.OS !== 'android') {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Voice Assistant is only available on Android devices.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Voice Assistant</Text>
        <Text style={styles.subtitle}>
          Control floating voice assistant with speech-to-text functionality
        </Text>
      </View>

      {/* Status */}
      <View style={styles.statusContainer}>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Service Status</Text>
          <View style={[styles.statusIndicator, { backgroundColor: isOverlayActive ? '#4CAF50' : '#9E9E9E' }]}>
            <Text style={[styles.statusText, { color: '#FFFFFF' }]}>
              {isOverlayActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      {/* Permissions */}
      <View style={styles.permissionsContainer}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        
        {renderPermissionCard(
          'Overlay Permission',
          'overlay',
          permissions.overlay,
          'Allows app to display floating icon over other apps'
        )}
        
        {renderPermissionCard(
          'Accessibility Service',
          'accessibility',
          permissions.accessibility,
          'Allows app to insert text into other apps'
        )}
        
        {renderPermissionCard(
          'Microphone',
          'recordAudio',
          permissions.recordAudio,
          'Allows app to record voice input'
        )}
        
        {renderPermissionCard(
          'Speech Recognition',
          'speechRecognition',
          permissions.speechRecognition,
          'Device supports offline speech recognition'
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            isOverlayActive && styles.activeButton,
            loading.overlay && styles.disabledButton,
          ]}
          onPress={handleStartOverlay}
          disabled={loading.overlay || isOverlayActive}
        >
          <Text style={styles.primaryButtonText}>
            {loading.overlay ? 'Loading...' : isOverlayActive ? 'Stop Assistant' : 'Start Assistant'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, loading.permissions && styles.disabledButton]}
          onPress={checkPermissions}
          disabled={loading.permissions}
        >
          <Text style={styles.secondaryButtonText}>
            {loading.permissions ? 'Checking...' : 'Refresh Permissions'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>How to Use</Text>
        <View style={styles.instructionList}>
          <Text style={styles.instructionItem}>
            1. Enable all required permissions
          </Text>
          <Text style={styles.instructionItem}>
            2. Tap "Start Assistant" to show floating icon
          </Text>
          <Text style={styles.instructionItem}>
            3. Tap floating icon to start voice recording
          </Text>
          <Text style={styles.instructionItem}>
            4. Speak your message
          </Text>
          <Text style={styles.instructionItem}>
            5. Text will be inserted into focused field automatically
          </Text>
        </View>
      </View>

      {/* Warning */}
      <View style={styles.warningContainer}>
        <Text style={styles.warningTitle}>Important Notes</Text>
        <Text style={styles.warningText}>
          • Voice assistant works with Android SpeechRecognizer (offline)
        </Text>
        <Text style={styles.warningText}>
          • Accessibility service must be enabled for text insertion
        </Text>
        <Text style={styles.warningText}>
          • Overlay permission required for floating icon
        </Text>
        <Text style={styles.warningText}>
          • Works with WhatsApp, Instagram, Messages and other apps
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 22,
  },
  statusContainer: {
    marginBottom: 24,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  statusIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  permissionsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 16,
  },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  permissionDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
  },
  actionsContainer: {
    marginBottom: 24,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: '#F44336',
  },
  disabledButton: {
    backgroundColor: '#BDC3C7',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  instructionsContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 12,
  },
  instructionList: {
    gap: 8,
  },
  instructionItem: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  warningContainer: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#7F6000',
    lineHeight: 20,
    marginBottom: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#D32F2F',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default VoiceAssistantScreen;
