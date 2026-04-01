import { useState, useEffect, useRef, useCallback } from 'react';
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { syncFloatingMicSettingsToNative } from '../services/floatingMicConfig';
import { logActivity, ActivityCategory } from '../services/appActivityHistoryService';
import { useAlert } from '../context/AlertContext';

const { FloatingMicModule } = NativeModules;

export const useFloatingMic = () => {
  const showAlert = useAlert();
  const [isServiceActive, setIsServiceActive] = useState(false);
  const [permissions, setPermissions] = useState({
    overlay: false,
    recordAudio: false,
    accessibility: false,
    allGranted: false,
  });
  const [recordingState, setRecordingState] = useState({
    state: 'IDLE', // IDLE, RECORDING, PAUSED, STOPPED
    lastResult: null,
    error: null,
  });

  const eventListeners = useRef([]);

  const checkPermissions = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') {
        console.warn('FloatingMic is only available on Android');
        return;
      }

      const perms = await FloatingMicModule.checkPermissions();
      setPermissions(perms);
    } catch (error) {
      console.error('Failed to check permissions:', error);
    }
  }, []);

  const refreshFloatingMicSnapshot = useCallback(async () => {
    await checkPermissions();
    if (Platform.OS === 'android' && typeof FloatingMicModule?.isFloatingMicServiceRunning === 'function') {
      try {
        const running = await FloatingMicModule.isFloatingMicServiceRunning();
        setIsServiceActive(!!running);
      } catch {
        // ignore
      }
    }
  }, [checkPermissions]);

  useEffect(() => {
    refreshFloatingMicSnapshot();

    // Set up event listeners
    const recordingStartedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingStarted',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'RECORDING', error: null }));
        console.log('🎤 Recording Started');
      }
    );

    const recordingStoppedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingStopped',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'STOPPED', error: null }));
        console.log('🛑 Recording Stopped');
      }
    );

    const recordingFileReadyListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onPartialResult',
      (partialText) => {
        console.log('🔄 Partial result:', partialText);
        setRecordingState(prev => ({ 
          ...prev, 
          lastResult: partialText,
          error: null 
        }));
      }
    );

    const errorListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onError',
      (error) => {
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          error 
        }));
      }
    );

    const overlayCreatedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onOverlayCreated',
      () => {
        console.log('Overlay created');
      }
    );

    const transcriptionCompleteListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionComplete',
      (transcribedText) => {
        console.log('✅ Transcription completed:', transcribedText);
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          lastResult: transcribedText,
          error: null 
        }));
      }
    );

    const transcriptionErrorListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionError',
      (errorMessage) => {
        console.error('❌ Transcription error:', errorMessage);
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          error: `Transcription failed: ${errorMessage}`
        }));
      }
    );

    eventListeners.current = [
      recordingStartedListener,
      recordingStoppedListener,
      recordingFileReadyListener,
      errorListener,
      overlayCreatedListener,
      transcriptionCompleteListener,
      transcriptionErrorListener,
    ];

    return () => {
      eventListeners.current.forEach(listener => listener.remove());
    };
  }, [refreshFloatingMicSnapshot]);

  const startFloatingMic = async () => {
    try {
      if (Platform.OS !== 'android') {
        throw new Error('FloatingMic is only available on Android');
      }

      // Check permissions first
      await checkPermissions();
      
      if (!permissions.allGranted) {
        await handleMissingPermissions();
        return;
      }

      await syncFloatingMicSettingsToNative();
      const result = await FloatingMicModule.startFloatingMic();
      setIsServiceActive(true);
      console.log('Floating mic started:', result);
      await logActivity(ActivityCategory.FLOATING_MIC, 'service_started', {
        label: 'Floating mic overlay started',
      });
    } catch (error) {
      console.error('Failed to start floating mic:', error);
      showAlert('Error', error.message || 'Failed to start floating microphone');
    }
  };

  const stopFloatingMic = async () => {
    try {
      if (Platform.OS !== 'android') {
        throw new Error('FloatingMic is only available on Android');
      }

      const result = await FloatingMicModule.stopFloatingMic();
      setIsServiceActive(false);
      setRecordingState({
        state: 'IDLE',
        lastResult: null,
        error: null,
      });
      console.log('Floating mic stopped:', result);
      await logActivity(ActivityCategory.FLOATING_MIC, 'service_stopped', {
        label: 'Floating mic overlay stopped',
      });
    } catch (error) {
      console.error('Failed to stop floating mic:', error);
      showAlert('Error', error.message || 'Failed to stop floating microphone');
    }
  };

  const handleMissingPermissions = async () => {
    const missingPermissions = [];
    
    if (!permissions.overlay) {
      missingPermissions.push('overlay');
    }
    if (!permissions.recordAudio) {
      missingPermissions.push('record audio');
    }
    if (!permissions.accessibility) {
      missingPermissions.push('accessibility service');
    }

    if (missingPermissions.length > 0) {
      showAlert(
        'Permissions Required',
        `The following permissions are required:\n${missingPermissions.map(p => `• ${p}`).join('\n')}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => openRequiredSettings() },
        ]
      );
    }
  };

  const openRequiredSettings = async () => {
    try {
      if (!permissions.overlay) {
        await FloatingMicModule.openOverlaySettings();
        showAlert(
          'Overlay Permission',
          'Please enable "Display over other apps" permission for this app, then return to the app.'
        );
      } else if (!permissions.accessibility) {
        await FloatingMicModule.openAccessibilitySettings();
        showAlert(
          'Accessibility Service',
          'Please enable the accessibility service for this app, then return to the app.'
        );
      }
    } catch (error) {
      console.error('Failed to open settings:', error);
    }
  };

  const toggleFloatingMic = () => {
    if (isServiceActive) {
      stopFloatingMic();
    } else {
      startFloatingMic();
    }
  };

  const startRecording = async () => {
    try {
      await FloatingMicModule.startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  };

  const stopRecording = async () => {
    try {
      await FloatingMicModule.stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  };

  return {
    // State
    isServiceActive,
    permissions,
    recordingState,
    
    // Actions
    startFloatingMic,
    stopFloatingMic,
    toggleFloatingMic,
    startRecording,
    stopRecording,
    checkPermissions,
    refreshFloatingMicSnapshot,
    handleMissingPermissions,
    openRequiredSettings,
    
    // Computed
    canStart: permissions.allGranted,
    needsPermissions: !permissions.allGranted,
  };
};

export default useFloatingMic;
