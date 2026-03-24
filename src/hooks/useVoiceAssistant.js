import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import { NativeModules, PermissionsAndroid } from 'react-native';

const { VoiceAssistantModule } = NativeModules;

/**
 * React Native Hook for Voice Assistant
 * Manages floating overlay and permissions for voice assistant feature
 */
export const useVoiceAssistant = () => {
  const [permissions, setPermissions] = useState({
    overlay: false,
    accessibility: false,
    recordAudio: false,
    speechRecognition: false,
  });
  
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const [loading, setLoading] = useState({
    overlay: false,
    permissions: false,
  });

  /**
   * Check all permissions
   */
  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    setLoading(prev => ({ ...prev, permissions: true }));
    
    try {
      const result = await VoiceAssistantModule.checkAllPermissions();
      setPermissions(result);
    } catch (error) {
      console.error('Error checking permissions:', error);
      Alert.alert('Error', 'Failed to check permissions');
    } finally {
      setLoading(prev => ({ ...prev, permissions: false }));
    }
  }, []);

  /**
   * Start floating overlay service
   */
  const startOverlay = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'Voice assistant is only available on Android');
      return;
    }

    setLoading(prev => ({ ...prev, overlay: true }));
    
    try {
      await VoiceAssistantModule.startFloatingOverlay();
      setIsOverlayActive(true);
    } catch (error) {
      console.error('Error starting overlay:', error);
      
      if (error.message.includes('OVERLAY_PERMISSION_DENIED')) {
        Alert.alert(
          'Overlay Permission Required',
          'Please enable overlay permission to use voice assistant.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => VoiceAssistantModule.openOverlaySettings() 
            },
          ]
        );
      } else if (error.message.includes('AUDIO_PERMISSION_DENIED')) {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone permission to use voice assistant.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => requestRecordAudioPermission() 
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to start voice assistant');
      }
    } finally {
      setLoading(prev => ({ ...prev, overlay: false }));
    }
  }, []);

  /**
   * Stop floating overlay service
   */
  const stopOverlay = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    setLoading(prev => ({ ...prev, overlay: true }));
    
    try {
      await VoiceAssistantModule.stopFloatingOverlay();
      setIsOverlayActive(false);
    } catch (error) {
      console.error('Error stopping overlay:', error);
      Alert.alert('Error', 'Failed to stop voice assistant');
    } finally {
      setLoading(prev => ({ ...prev, overlay: false }));
    }
  }, []);

  /**
   * Request record audio permission
   */
  const requestRecordAudioPermission = useCallback(async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONSPECORD_AUDIO
      );
      
      if (granted) {
        // Permission granted, check all permissions again
        checkPermissions();
      } else {
        Alert.alert('Permission Denied', 'Microphone permission is required for voice input');
      }
    } catch (error) {
      console.error('Error requesting audio permission:', error);
      Alert.alert('Error', 'Failed to request microphone permission');
    }
  }, [checkPermissions]);

  /**
   * Open overlay permission settings
   */
  const openOverlaySettings = useCallback(() => {
    if (Platform.OS === 'android') {
      VoiceAssistantModule.openOverlaySettings();
    }
  }, []);

  /**
   * Open accessibility settings
   */
  const openAccessibilitySettings = useCallback(() => {
    if (Platform.OS === 'android') {
      VoiceAssistantModule.openAccessibilitySettings();
    }
  }, []);

  /**
   * Get missing permissions
   */
  const getMissingPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return [];
    }

    try {
      const missing = await VoiceAssistantModule.getMissingPermissions();
      return missing;
    } catch (error) {
      console.error('Error getting missing permissions:', error);
      return [];
    }
  }, []);

  /**
   * Check if all permissions are granted
   */
  const areAllPermissionsGranted = useCallback(() => {
    return permissions.overlay && 
           permissions.accessibility && 
           permissions.recordAudio && 
           permissions.speechRecognition;
  }, [permissions]);

  /**
   * Check if voice assistant is ready to start
   */
  const isReadyToStart = useCallback(() => {
    return Platform.OS === 'android' && areAllPermissionsGranted();
  }, [areAllPermissionsGranted]);

  // Check permissions on mount
  useEffect(() => {
    if (Platform.OS === 'android') {
      checkPermissions();
    }
  }, [checkPermissions]);

  return {
    // Permission states
    permissions,
    isOverlayActive,
    loading,
    
    // Permission checks
    checkPermissions,
    areAllPermissionsGranted,
    isReadyToStart,
    getMissingPermissions,
    
    // Overlay control
    startOverlay,
    stopOverlay,
    
    // Settings navigation
    openOverlaySettings,
    openAccessibilitySettings,
    
    // Permission requests
    requestRecordAudioPermission,
  };
};
