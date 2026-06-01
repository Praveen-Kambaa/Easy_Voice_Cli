import logger from '../utils/logger';
import { useState, useEffect, useRef } from 'react';
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { showGlobalAlert } from '../utils/alertPresenter';

const { FloatingMicModule } = NativeModules;

export const useFloatingMic = () => {
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

  useEffect(() => {
    checkPermissions();
    
    // Set up event listeners
    const recordingStartedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingStarted',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'RECORDING', error: null }));
        logger.debug('🎤 Mic Pressed → Recording Started');
      }
    );

    const recordingPausedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingPaused',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'PAUSED', error: null }));
        logger.debug('⏸️ Pause Pressed → Recording Paused');
      }
    );

    const recordingResumedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingResumed',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'RECORDING', error: null }));
        logger.debug('▶️ Resume Pressed → Recording Resumed');
      }
    );

    const recordingStoppedListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingStopped',
      () => {
        setRecordingState(prev => ({ ...prev, state: 'STOPPED', error: null }));
        logger.debug('🛑 Stop Pressed → Recording Stopped');
      }
    );

    
    const transcriptionResultListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionResult',
      (result) => {
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          lastResult: result,
          error: null 
        }));
        logger.debug('📝 Text Pasted:', result);
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

    const recordingFileReadyListener = DeviceEventEmitter.addListener(
      'FloatingMicService_onRecordingFileReady',
      async (filePath) => {
        logger.debug('Recording file ready:', filePath);
        setRecordingState(prev => ({ 
          ...prev, 
          state: 'IDLE',
          lastResult: 'Transcribing...',
          error: null 
        }));
        
        // Auto-trigger transcription
        try {
          const { transcribeAudio } = await import('../api/voiceApi');
          const response = await transcribeAudio(filePath);
          
          if (response.success) {
            const transcribedText = response.data.transcription || response.data.text;
            logger.debug('✅ Transcription successful:', transcribedText);
            
            // Send text to accessibility service for injection
            if (Platform.OS === 'android') {
              try {
                await FloatingMicModule.injectText(transcribedText);
                logger.debug('✅ Text injected successfully');
              } catch (error) {
                logger.error('❌ Text injection failed:', error);
              }
            }
            
            setRecordingState(prev => ({ 
              ...prev, 
              lastResult: transcribedText,
              error: null 
            }));
          } else {
            logger.error('❌ Transcription failed:', response.message);
            setRecordingState(prev => ({ 
              ...prev, 
              error: `Transcription failed: ${response.message}`
            }));
          }
        } catch (error) {
          logger.error('❌ Transcription error:', error);
          setRecordingState(prev => ({ 
            ...prev, 
            error: `Transcription error: ${error.message}`
          }));
        }
      }
    );

    eventListeners.current = [
      recordingStartedListener,
      recordingPausedListener,
      recordingResumedListener,
      recordingStoppedListener,
      transcriptionResultListener,
      errorListener,
      overlayCreatedListener,
      recordingFileReadyListener,
    ];

    return () => {
      eventListeners.current.forEach(listener => listener.remove());
    };
  }, []);

  const checkPermissions = async () => {
    try {
      if (Platform.OS !== 'android') {
        logger.warn('FloatingMic is only available on Android');
        return;
      }
      
      const perms = await FloatingMicModule.checkPermissions();
      setPermissions(perms);
    } catch (error) {
      logger.error('Failed to check permissions:', error);
    }
  };

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

      const result = await FloatingMicModule.startFloatingMic();
      setIsServiceActive(true);
      logger.debug('Floating mic started:', result);
    } catch (error) {
      logger.error('Failed to start floating mic:', error);
      showGlobalAlert('Error', error.message || 'Failed to start floating microphone');
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
      logger.debug('Floating mic stopped:', result);
    } catch (error) {
      logger.error('Failed to stop floating mic:', error);
      showGlobalAlert('Error', error.message || 'Failed to stop floating microphone');
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
      showGlobalAlert(
        'Permissions Required',
        `The following permissions are required:\n${missingPermissions.map(p => `• ${p}`).join('\n')}`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: () => openRequiredSettings(),
          },
        ]
      );
    }
  };

  const openRequiredSettings = async () => {
    try {
      if (!permissions.overlay) {
        await FloatingMicModule.openOverlaySettings();
        showGlobalAlert(
          'Overlay Permission',
          'Please enable "Display over other apps" permission for this app, then return to the app.'
        );
      } else if (!permissions.accessibility) {
        await FloatingMicModule.openAccessibilitySettings();
        showGlobalAlert(
          'Accessibility Service',
          'Please enable the accessibility service for this app, then return to the app.'
        );
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
      await FloatingMicModule.startRecording();
    } catch (error) {
      logger.error('Failed to start recording:', error);
      throw error;
    }
  };

  const stopRecording = async () => {
    try {
      await FloatingMicModule.stopRecording();
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
    handleMissingPermissions,
    openRequiredSettings,
    
    // Computed
    canStart: permissions.allGranted,
    needsPermissions: !permissions.allGranted,
  };
};

export default useFloatingMic;
