import logger from '../utils/logger';
import { useState, useEffect, useRef, useCallback } from 'react';
import { NativeModules, DeviceEventEmitter, Platform, AppState, Linking } from 'react-native';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { syncFloatingMicSettingsToNative } from '../services/floatingMicConfig';
import { logActivity, ActivityCategory } from '../services/appActivityHistoryService';
import { useAlert } from '../context/AlertContext';
import NativeAudioService from '../services/NativeAudioService';

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
        let micGranted = false;
        try {
          const status = await check(PERMISSIONS.IOS.MICROPHONE);
          micGranted = status === RESULTS.GRANTED || status === RESULTS.LIMITED;
        } catch {
          micGranted = true;
        }
        setPermissions({
          overlay: true,
          accessibility: true,
          recordAudio: micGranted,
          allGranted: micGranted,
        });
        return;
      }

      if (typeof FloatingMicModule?.checkPermissions === 'function') {
        const perms = await FloatingMicModule.checkPermissions();
        setPermissions(perms);
      }
    } catch (error) {
      logger.error('Failed to check permissions:', error);
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
        logger.debug('🎤 Recording Started');
      }
    );

    const recordingStoppedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingStopped',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'STOPPED', error: null }));
        logger.debug('🛑 Recording Stopped');
      }
    );

    const recordingFileReadyListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onPartialResult',
      (partialText) => {
        logger.debug('🔄 Partial result:', partialText);
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
        logger.debug('Overlay created');
      }
    );

    const transcriptionCompleteListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionComplete',
      (transcribedText) => {
        logger.debug('✅ Transcription completed:', transcribedText);
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
        logger.error('❌ Transcription error:', errorMessage);
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          error: `Transcription failed: ${errorMessage}`
        }));
      }
    );

    const serviceStoppedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onServiceStopped',
      () => {
        setIsServiceActive(false);
        setRecordingState({
          state: 'IDLE',
          lastResult: null,
          error: null,
        });
      }
    );

    const voiceCommandExecutedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onVoiceCommandExecuted',
      (result) => {
        setRecordingState(prev => ({
          ...prev,
          state: 'IDLE',
          lastResult: typeof result === 'string' ? result : String(result ?? ''),
          error: null,
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
      serviceStoppedListener,
      voiceCommandExecutedListener,
    ];

    return () => {
      eventListeners.current.forEach(listener => listener.remove());
    };
  }, [refreshFloatingMicSnapshot]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshFloatingMicSnapshot();
      }
    });
    return () => sub.remove();
  }, [refreshFloatingMicSnapshot]);

  const startFloatingMic = async () => {
    try {
      if (Platform.OS !== 'android') {
        showAlert(
          'TypeEasy on iOS',
          'Floating overlay bubbles are an Android-specific feature. On iOS and Mac, use the TypeEasy Keyboard extension to dictate and translate inside any app.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Keyboard Settings',
              onPress: () => {
                if (typeof NativeModules.KeyboardModule?.openKeyboardSettings === 'function') {
                  NativeModules.KeyboardModule.openKeyboardSettings();
                } else {
                  Linking.openSettings().catch(() => {});
                }
              },
            },
          ]
        );
        return;
      }

      // Check permissions first
      await checkPermissions();
      
      if (!permissions.allGranted) {
        await handleMissingPermissions();
        return;
      }

      await syncFloatingMicSettingsToNative();
      if (typeof FloatingMicModule?.startFloatingMic === 'function') {
        const result = await FloatingMicModule.startFloatingMic();
        setIsServiceActive(true);
        logger.debug('Floating mic started:', result);
      }
      await logActivity(ActivityCategory.FLOATING_MIC, 'service_started', {
        label: 'Floating mic overlay started',
      });
    } catch (error) {
      logger.error('Failed to start floating mic:', error);
      showAlert('Error', error.message || 'Failed to start floating microphone');
    }
  };

  const stopFloatingMic = async () => {
    try {
      if (Platform.OS !== 'android') {
        setIsServiceActive(false);
        return;
      }

      if (typeof FloatingMicModule?.stopFloatingMic === 'function') {
        const result = await FloatingMicModule.stopFloatingMic();
        logger.debug('Floating mic stopped:', result);
      }
      setIsServiceActive(false);
      setRecordingState({
        state: 'IDLE',
        lastResult: null,
        error: null,
      });
      await logActivity(ActivityCategory.FLOATING_MIC, 'service_stopped', {
        label: 'Floating mic overlay stopped',
      });
    } catch (error) {
      logger.error('Failed to stop floating mic:', error);
      showAlert('Error', error.message || 'Failed to stop floating microphone');
    }
  };

  const handleMissingPermissions = async () => {
    if (Platform.OS !== 'android') {
      if (!permissions.recordAudio) {
        showAlert(
          'Microphone Permission Required',
          'Please enable microphone access in settings to use voice features.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch(() => {});
              },
            },
          ]
        );
      } else {
        showAlert(
          'TypeEasy on iOS',
          'Floating overlay bubbles are an Android-specific feature. On iOS and Mac, use the TypeEasy Keyboard extension to dictate and translate in any app.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Keyboard Settings',
              onPress: () => {
                if (typeof NativeModules.KeyboardModule?.openKeyboardSettings === 'function') {
                  NativeModules.KeyboardModule.openKeyboardSettings();
                } else {
                  Linking.openSettings().catch(() => {});
                }
              },
            },
          ]
        );
      }
      return;
    }

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
      if (Platform.OS !== 'android') {
        if (typeof NativeModules.KeyboardModule?.openKeyboardSettings === 'function') {
          NativeModules.KeyboardModule.openKeyboardSettings();
        } else {
          Linking.openSettings().catch(() => {});
        }
        return;
      }

      if (FloatingMicModule?.openOverlaySettings && !permissions.overlay) {
        await FloatingMicModule.openOverlaySettings();
        showAlert(
          'Overlay Permission',
          'Please enable "Display over other apps" permission for this app, then return to the app.'
        );
      } else if (FloatingMicModule?.openAccessibilitySettings && !permissions.accessibility) {
        await FloatingMicModule.openAccessibilitySettings();
        showAlert(
          'Accessibility Service',
          'Please enable the accessibility service for this app, then return to the app.'
        );
      } else {
        Linking.openSettings().catch(() => {});
      }
    } catch (error) {
      logger.error('Failed to open settings:', error);
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
      if (Platform.OS === 'android' && typeof FloatingMicModule?.startRecording === 'function') {
        await FloatingMicModule.startRecording();
      } else {
        await NativeAudioService.startRecording('floating_mic_recording.m4a');
      }
    } catch (error) {
      logger.error('Failed to start recording:', error);
      throw error;
    }
  };

  const stopRecording = async () => {
    try {
      if (Platform.OS === 'android' && typeof FloatingMicModule?.stopRecording === 'function') {
        await FloatingMicModule.stopRecording();
      } else {
        await NativeAudioService.stopRecording();
      }
    } catch (error) {
      logger.error('Failed to stop recording:', error);
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
