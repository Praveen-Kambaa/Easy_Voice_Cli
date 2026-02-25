import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { NativeModules, DeviceEventEmitter } from 'react-native';
import { useFloatingMic } from '../hooks/useFloatingMic';
import { AppHeader } from '../components/Header/AppHeader';
import { ScreenContainer } from '../components/ScreenContainer';

const { FloatingMicModule } = NativeModules;

const FloatingMicScreen = () => {
  const [audioRecordings, setAudioRecordings] = useState([]);
  const [lastTranscription, setLastTranscription] = useState('');
  
  const {
    isServiceActive,
    permissions,
    recordingState,
    startFloatingMic,
    stopFloatingMic,
    toggleFloatingMic,
    checkPermissions,
    handleMissingPermissions,
    openRequiredSettings,
    canStart,
    needsPermissions,
  } = useFloatingMic();

  useEffect(() => {
    // Listen for audio recording events
    const eventListeners = [
      DeviceEventEmitter.addListener('FloatingMic_onAudioRecorded', async (audioPath) => {
        console.log('Audio recorded:', audioPath);
        // AsyncStorage functionality temporarily disabled
        // await AudioStorage.saveRecording(audioPath);
      }),
      
      DeviceEventEmitter.addListener('FloatingMic_onSpeechResult', (text) => {
        console.log('Speech transcribed:', text);
        setLastTranscription(text);
      }),
    ];

    return () => {
      eventListeners.forEach(listener => listener.remove());
    };
  }, []);

  const loadAudioRecordings = async () => {
    // AsyncStorage functionality temporarily disabled
    // try {
    //   const recordings = await AudioStorage.getRecordings();
    //   setAudioRecordings(recordings);
    // } catch (error) {
    //   console.error('Failed to load audio recordings:', error);
    // }
  };

  const renderPermissionStatus = () => {
    return (
      <View style={styles.permissionSection}>
        <Text style={styles.sectionTitle}>Permissions Status</Text>
        
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Overlay Permission:</Text>
          <Text style={[
            styles.permissionValue,
            { color: permissions.overlay ? '#4CAF50' : '#F44336' }
          ]}>
            {permissions.overlay ? 'Granted' : 'Denied'}
          </Text>
        </View>

        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Record Audio:</Text>
          <Text style={[
            styles.permissionValue,
            { color: permissions.recordAudio ? '#4CAF50' : '#F44336' }
          ]}>
            {permissions.recordAudio ? 'Granted' : 'Denied'}
          </Text>
        </View>

        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Accessibility Service:</Text>
          <Text style={[
            styles.permissionValue,
            { color: permissions.accessibility ? '#4CAF50' : '#F44336' }
          ]}>
            {permissions.accessibility ? 'Enabled' : 'Disabled'}
          </Text>
        </View>

        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>All Permissions:</Text>
          <Text style={[
            styles.permissionValue,
            { color: permissions.allGranted ? '#4CAF50' : '#F44336' }
          ]}>
            {permissions.allGranted ? 'Ready' : 'Setup Required'}
          </Text>
        </View>
      </View>
    );
  };

  const renderServiceStatus = () => {
    return (
      <View style={styles.serviceSection}>
        <Text style={styles.sectionTitle}>Service Status</Text>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Floating Mic Service:</Text>
          <Text style={[
            styles.statusValue,
            { color: isServiceActive ? '#4CAF50' : '#FF9800' }
          ]}>
            {isServiceActive ? 'Active' : 'Inactive'}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Recording State:</Text>
          <Text style={[
            styles.statusValue,
            { color: recordingState.state === 'RECORDING' ? '#F44336' : '#4CAF50' }
          ]}>
            {recordingState.state === 'RECORDING' ? 'Recording' : 
             recordingState.state === 'PAUSED' ? 'Paused' :
             recordingState.state === 'STOPPED' ? 'Stopped' : 'Idle'}
          </Text>
        </View>

        {recordingState.lastResult && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultLabel}>Last Result:</Text>
            <Text style={styles.resultText}>{recordingState.lastResult}</Text>
          </View>
        )}

        {recordingState.error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorLabel}>Error:</Text>
            <Text style={styles.errorText}>{recordingState.error}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderControls = () => {
    return (
      <View style={styles.controlSection}>
        <Text style={styles.sectionTitle}>Controls</Text>
        
        <TouchableOpacity
          style={[
            styles.mainButton,
            isServiceActive ? styles.stopButton : styles.startButton
          ]}
          onPress={toggleFloatingMic}
          disabled={needsPermissions}
        >
          <Text style={styles.mainButtonText}>
            {isServiceActive ? 'Stop Floating Mic' : 'Start Floating Mic'}
          </Text>
        </TouchableOpacity>

        {needsPermissions && (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={handleMissingPermissions}
          >
            <Text style={styles.permissionButtonText}>Setup Permissions</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkPermissions}
        >
          <Text style={styles.refreshButtonText}>Refresh Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderInstructions = () => {
    return (
      <View style={styles.instructionSection}>
        <Text style={styles.sectionTitle}>Instructions</Text>
        
        <Text style={styles.instructionText}>
          1. Ensure all permissions are granted (green status)
        </Text>
        <Text style={styles.instructionText}>
          2. Tap "Start Floating Mic" to activate the service
        </Text>
        <Text style={styles.instructionText}>
          3. A floating microphone icon will appear on your screen
        </Text>
        <Text style={styles.instructionText}>
          4. Drag the icon to position it anywhere on screen
        </Text>
        <Text style={styles.instructionText}>
          5. Tap the microphone to start/stop voice recording
        </Text>
        <Text style={styles.instructionText}>
          6. Speech results will be shown in the "Last Result" field
        </Text>
        <Text style={styles.instructionText}>
          7. The service works even when the app is in background
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <AppHeader title="Floating Mic" />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {renderPermissionStatus()}
        {renderServiceStatus()}
        {renderControls()}
        {renderInstructions()}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  permissionSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  permissionValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  serviceSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E8F5E8',
    borderRadius: 6,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 4,
  },
  resultText: {
    fontSize: 14,
    color: '#333',
  },
  errorContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C62828',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#333',
  },
  controlSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mainButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionButton: {
    backgroundColor: '#FF9800',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  instructionSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
});

export default FloatingMicScreen;
