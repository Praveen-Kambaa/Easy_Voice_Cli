import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { AppHeader } from '../components/Header/AppHeader';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { AppCard } from '../components/common/AppCard';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { useAlert } from '../context/AlertContext';
import { Colors } from '../theme/Colors';

const VoiceAssistantScreen = () => {
  const showAlert = useAlert();

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

  const handleStartOverlay = async () => {
    if (!areAllPermissionsGranted()) {
      const missing = await getMissingPermissions();
      showPermissionAlert(missing);
      return;
    }
    startOverlay();
  };

  const showPermissionAlert = (missingPermissions) => {
    const permissionList = missingPermissions.join(', ');
    showAlert(
      'Permissions Required',
      `The following permissions are required:\n\n${permissionList}\n\nPlease enable them to continue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => openSettingsForMissing(missingPermissions),
        },
      ]
    );
  };

  const openSettingsForMissing = (missingPermissions) => {
    if (missingPermissions.includes('Overlay')) {
      openOverlaySettings();
    } else if (missingPermissions.includes('Accessibility')) {
      openAccessibilitySettings();
    } else if (missingPermissions.includes('Record Audio')) {
      requestRecordAudioPermission();
    }
  };

  const permissionRows = [
    {
      label: 'Overlay Permission',
      granted: permissions.overlay,
      description: 'Display floating icon over other apps',
    },
    {
      label: 'Accessibility Service',
      granted: permissions.accessibility,
      description: 'Insert text into other apps',
      labels: ['Enabled', 'Disabled'],
    },
    {
      label: 'Microphone',
      granted: permissions.recordAudio,
      description: 'Record voice input',
    },
    {
      label: 'Speech Recognition',
      granted: permissions.speechRecognition,
      description: 'Offline speech recognition support',
    },
  ];

  if (Platform.OS !== 'android') {
    return (
      <ScreenContainer>
        <AppHeader title="Voice Assistant" />
        <View style={styles.unsupportedWrap}>
          <Text style={styles.unsupportedText}>
            Voice Assistant is only available on Android devices.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader title="Voice Assistant" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Permissions */}
        <AppCard>
          <Text style={styles.sectionTitle}>Permissions Status</Text>
          {permissionRows.map((row, idx) => (
            <View
              key={idx}
              style={[
                styles.statusRow,
                idx < permissionRows.length - 1 && styles.rowDivider,
              ]}
            >
              <Text style={styles.rowLabel}>{row.label}</Text>
              <StatusBadge
                status={row.granted ? 'granted' : 'blocked'}
                label={
                  row.granted
                    ? (row.labels?.[0] ?? 'Granted')
                    : (row.labels?.[1] ?? 'Denied')
                }
              />
            </View>
          ))}
        </AppCard>

        {/* Service Status */}
        <AppCard>
          <Text style={styles.sectionTitle}>Service Status</Text>
          <View style={[styles.statusRow, styles.rowDivider]}>
            <Text style={styles.rowLabel}>Voice Assistant Service</Text>
            <StatusBadge
              status={isOverlayActive ? 'granted' : 'denied'}
              label={isOverlayActive ? 'Active' : 'Inactive'}
            />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.rowLabel}>All Permissions</Text>
            <StatusBadge
              status={areAllPermissionsGranted() ? 'granted' : 'denied'}
              label={areAllPermissionsGranted() ? 'Ready' : 'Setup Required'}
            />
          </View>
        </AppCard>

        {/* Controls */}
        <AppCard>
          <Text style={styles.sectionTitle}>Controls</Text>

          <PrimaryButton
            title={
              loading.overlay
                ? 'Loading...'
                : isOverlayActive
                ? 'Stop Assistant'
                : 'Start Assistant'
            }
            onPress={isOverlayActive ? stopOverlay : handleStartOverlay}
            disabled={loading.overlay}
            loading={loading.overlay}
            variant={isOverlayActive ? 'danger' : 'primary'}
            style={styles.mainBtn}
          />

          <PrimaryButton
            title={loading.permissions ? 'Checking...' : 'Refresh Permissions'}
            onPress={checkPermissions}
            disabled={loading.permissions}
            loading={loading.permissions}
            variant="ghost"
          />
        </AppCard>

        {/* Instructions */}
        <AppCard>
          <Text style={styles.sectionTitle}>How to Use</Text>
          {[
            'Ensure all permissions are granted (green status)',
            'Tap "Start Assistant" to show floating icon',
            'Tap floating icon to start voice recording',
            'Speak your message clearly',
            'Text will be inserted into focused field automatically',
          ].map((text, idx) => (
            <View key={idx} style={styles.instructionRow}>
              <Text style={styles.instructionNumber}>{idx + 1}</Text>
              <Text style={styles.instructionText}>{text}</Text>
            </View>
          ))}
        </AppCard>

        {/* Notes */}
        <AppCard>
          <Text style={styles.sectionTitle}>Important Notes</Text>
          {[
            'Uses Android SpeechRecognizer (offline capable)',
            'Accessibility service required for text insertion',
            'Overlay permission required for floating icon',
            'Works with WhatsApp, Instagram, Messages and more',
          ].map((note, idx) => (
            <View key={idx} style={styles.noteRow}>
              <View style={styles.noteDot} />
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 14,
  },

  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
    flex: 1,
    marginRight: 12,
  },

  mainBtn: {
    marginBottom: 10,
  },

  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  instructionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    flexShrink: 0,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 20,
    flex: 1,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginTop: 7,
    flexShrink: 0,
  },
  noteText: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 20,
    flex: 1,
  },

  unsupportedWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  unsupportedText: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default VoiceAssistantScreen;
