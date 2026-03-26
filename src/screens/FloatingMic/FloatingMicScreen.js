import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  NativeModules,
  DeviceEventEmitter,
  TouchableOpacity,
} from 'react-native';
import { History, ChevronRight } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useFloatingMic } from '../../hooks/useFloatingMic';
import { Colors } from '../../theme/Colors';

const { FloatingMicModule } = NativeModules;

const FloatingMicScreen = ({ navigation }) => {
  const [lastTranscription, setLastTranscription] = useState('');

  const {
    isServiceActive,
    permissions,
    recordingState,
    toggleFloatingMic,
    checkPermissions,
    handleMissingPermissions,
    needsPermissions,
  } = useFloatingMic();

  useEffect(() => {
    const listeners = [
      DeviceEventEmitter.addListener('FloatingMic_onAudioRecorded', (audioPath) => {
        console.log('Audio recorded:', audioPath);
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onTranscriptionComplete', (text) => {
        setLastTranscription(typeof text === 'string' ? text : String(text ?? ''));
      }),
    ];
    return () => listeners.forEach(l => l.remove());
  }, []);

  const permissionRows = [
    { label: 'Overlay Permission', value: permissions.overlay },
    { label: 'Record Audio', value: permissions.recordAudio },
    { label: 'Accessibility Service', value: permissions.accessibility, labels: ['Enabled', 'Disabled'] },
    { label: 'All Permissions', value: permissions.allGranted, labels: ['Ready', 'Setup Required'] },
  ];

  return (
    <ScreenContainer>
      <AppHeader title="Floating Mic" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Status */}
        <AppCard>
          <Text style={styles.sectionTitle}>Permissions Status</Text>
          {permissionRows.map((row, idx) => (
            <View key={idx} style={[styles.statusRow, idx < permissionRows.length - 1 && styles.rowDivider]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <StatusBadge
                status={row.value ? 'granted' : 'blocked'}
                label={row.value ? (row.labels?.[0] ?? 'Granted') : (row.labels?.[1] ?? 'Denied')}
              />
            </View>
          ))}
        </AppCard>

        {/* Service Status */}
        <AppCard>
          <Text style={styles.sectionTitle}>Service Status</Text>
          <View style={[styles.statusRow, styles.rowDivider]}>
            <Text style={styles.rowLabel}>Floating Mic Service</Text>
            <StatusBadge
              status={isServiceActive ? 'granted' : 'denied'}
              label={isServiceActive ? 'Active' : 'Inactive'}
            />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.rowLabel}>Recording State</Text>
            <StatusBadge
              status={
                recordingState.state === 'RECORDING' ? 'blocked' :
                recordingState.state === 'PAUSED' ? 'denied' : 'granted'
              }
              label={
                recordingState.state === 'RECORDING' ? 'Recording' :
                recordingState.state === 'PAUSED' ? 'Paused' :
                recordingState.state === 'STOPPED' ? 'Stopped' : 'Idle'
              }
            />
          </View>

          {recordingState.lastResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Last Result</Text>
              <Text style={styles.resultText}>{recordingState.lastResult}</Text>
            </View>
          ) : null}

          {recordingState.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Error</Text>
              <Text style={styles.errorText}>{recordingState.error}</Text>
            </View>
          ) : null}

          {lastTranscription ? (
            <View style={styles.transcriptionBox}>
              <Text style={styles.transcriptionLabel}>Last Transcription</Text>
              <Text style={styles.transcriptionText}>{lastTranscription}</Text>
            </View>
          ) : null}
        </AppCard>

        <TouchableOpacity
          style={styles.historyRow}
          onPress={() => navigation.navigate('FloatingMicHistory')}
          activeOpacity={0.7}
        >
          <History size={20} color={Colors.primary} strokeWidth={1.8} />
          <View style={styles.historyRowText}>
            <Text style={styles.historyRowTitle}>Speech history</Text>
            <Text style={styles.historyRowSub}>Transcripts from the floating mic</Text>
          </View>
          <ChevronRight size={18} color={Colors.text.light} strokeWidth={2} />
        </TouchableOpacity>

        {/* Controls */}
        <AppCard>
          <Text style={styles.sectionTitle}>Controls</Text>

          <PrimaryButton
            title={isServiceActive ? 'Stop Floating Mic' : 'Start Floating Mic'}
            onPress={toggleFloatingMic}
            disabled={needsPermissions}
            variant={isServiceActive ? 'danger' : 'primary'}
            style={styles.mainControlBtn}
          />

          {needsPermissions && (
            <PrimaryButton
              title="Setup Permissions"
              onPress={handleMissingPermissions}
              variant="outline"
              style={styles.secondaryControlBtn}
            />
          )}

          <PrimaryButton
            title="Refresh Permissions"
            onPress={checkPermissions}
            variant="ghost"
            style={styles.refreshBtn}
          />
        </AppCard>

        {/* Instructions */}
        <AppCard>
          <Text style={styles.sectionTitle}>How to Use</Text>
          {[
            'Ensure all permissions are granted (green status)',
            'Tap "Start Floating Mic" to activate the service',
            'A floating microphone icon will appear on your screen',
            'Drag the icon to position it anywhere on screen',
            'Tap the microphone to start/stop voice recording',
            'Speech results will show in the "Last Result" field',
            'The service works even when the app is in the background',
          ].map((text, idx) => (
            <View key={idx} style={styles.instructionRow}>
              <Text style={styles.instructionNumber}>{idx + 1}</Text>
              <Text style={styles.instructionText}>{text}</Text>
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

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  historyRowText: {
    flex: 1,
  },
  historyRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  historyRowSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
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

  resultBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.status.grantedBg,
    borderRadius: 8,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.status.granted,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  resultText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },

  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.status.blockedBg,
    borderRadius: 8,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.status.blocked,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  errorText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },

  transcriptionBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transcriptionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  transcriptionText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },

  mainControlBtn: {
    marginBottom: 10,
  },
  secondaryControlBtn: {
    marginBottom: 10,
  },
  refreshBtn: {
    marginBottom: 0,
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
});

export default FloatingMicScreen;
