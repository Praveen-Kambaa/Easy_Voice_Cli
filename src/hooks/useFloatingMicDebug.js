import logger from '../utils/logger';
import { NativeModules, Platform, Linking } from 'react-native';
import { showGlobalAlert } from '../utils/alertPresenter';

const { FloatingMicModule } = NativeModules;

export const debugFloatingOverlay = async () => {
  logger.debug('=== FLOATING OVERLAY DEBUG ===');
  
  if (Platform.OS !== 'android') {
    logger.error('Floating overlay only works on Android');
    return;
  }

  try {
    // Check permissions
    const permissions = await FloatingMicModule.checkPermissions();
    logger.debug('Permissions:', permissions);
    
    // Detailed permission checks
    logger.debug('\n=== DETAILED PERMISSION ANALYSIS ===');
    
    // 1. Overlay Permission Check
    if (!permissions.overlay) {
      logger.error('❌ OVERLAY PERMISSION NOT GRANTED');
      showGlobalAlert(
        'Overlay Permission Required',
        'Please enable "Display over other apps" permission:\n\n1. Go to Settings\n2. Apps -> Your App\n3. Permissions -> Display over other apps\n4. Enable it',
        [
          { text: 'Cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => FloatingMicModule.openOverlaySettings() 
          }
        ]
      );
      return;
    } else {
      logger.debug('✅ Overlay permission granted');
    }

    // 2. Record Audio Permission Check
    if (!permissions.recordAudio) {
      logger.error('❌ RECORD AUDIO PERMISSION NOT GRANTED');
      showGlobalAlert(
        'Microphone Permission Required',
        'Please enable microphone permission for voice recording.',
        [
          { text: 'Cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => Linking.openSettings() 
          }
        ]
      );
      return;
    } else {
      logger.debug('✅ Record audio permission granted');
    }

    // 3. Accessibility Service Check
    if (!permissions.accessibility) {
      logger.error('❌ ACCESSIBILITY SERVICE NOT ENABLED');
      showGlobalAlert(
        'Accessibility Service Required',
        'Please enable accessibility service:\n\n1. Go to Settings\n2. Accessibility\n3. Your App Service\n4. Enable it',
        [
          { text: 'Cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => FloatingMicModule.openAccessibilitySettings() 
          }
        ]
      );
      return;
    } else {
      logger.debug('✅ Accessibility service enabled');
    }

    logger.debug('\n=== STARTING SERVICE DEBUG ===');
    
    // Try to start the service
    try {
      const result = await FloatingMicModule.startFloatingMic();
      logger.debug('✅ Service started successfully:', result);
      
      showGlobalAlert(
        'Service Started',
        'Floating mic service started successfully!\n\nIf you still cannot see the floating icon:\n\n1. Check notification panel for service notification\n2. Try restarting your phone\n3. Check battery optimization settings\n4. Make sure no other overlay apps are blocking',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      logger.error('❌ Failed to start service:', error);
      
      let errorMessage = error.message || 'Unknown error';
      let suggestions = [];
      
      if (errorMessage.includes('OVERLAY_PERMISSION_DENIED')) {
        suggestions.push('Re-enable overlay permission');
      } else if (errorMessage.includes('RECORD_AUDIO_PERMISSION_DENIED')) {
        suggestions.push('Re-enable microphone permission');
      } else if (errorMessage.includes('ACCESSIBILITY_SERVICE_DISABLED')) {
        suggestions.push('Re-enable accessibility service');
      } else if (errorMessage.includes('SERVICE_START_ERROR')) {
        suggestions.push('Check if service is already running');
        suggestions.push('Restart your phone');
        suggestions.push('Check battery optimization');
      }
      
      showGlobalAlert(
        'Service Start Failed',
        `Error: ${errorMessage}\n\nSuggestions:\n${suggestions.map(s => `• ${s}`).join('\n')}`,
        [{ text: 'OK' }]
      );
    }
    
  } catch (error) {
    logger.error('❌ Debug failed:', error);
    showGlobalAlert('Debug Error', error.message);
  }
  
  logger.debug('=== END DEBUG ===');
};

export const checkBatteryOptimization = async () => {
  logger.debug('=== BATTERY OPTIMIZATION CHECK ===');
  
  // This would need to be implemented in native module
  showGlobalAlert(
    'Battery Optimization',
    'For reliable floating overlay service:\n\n1. Go to Settings\n2. Battery -> Battery Optimization\n3. Apps -> Your App\n4. Set to "Not optimized"\n5. Also check Background activity',
    [
      { text: 'OK' },
      { 
        text: 'Open Settings', 
        onPress: () => Linking.openSettings() 
      }
    ]
  );
};

export const checkAndroidVersionIssues = () => {
  const androidVersion = Platform.Version;
  logger.debug('Android Version:', androidVersion);
  
  let issues = [];
  let solutions = [];
  
  if (androidVersion >= 30) { // Android 11+
    issues.push('Android 11+ has stricter overlay permissions');
    solutions.push('Ensure overlay permission is granted for "Display over other apps"');
  }
  
  if (androidVersion >= 31) { // Android 12+
    issues.push('Android 12+ has new privacy indicators');
    solutions.push('Check for privacy indicators when overlay is active');
  }
  
  if (androidVersion >= 33) { // Android 13+
    issues.push('Android 13+ has notification permission changes');
    solutions.push('Ensure notification permission is granted');
  }
  
  if (issues.length > 0) {
    showGlobalAlert(
      'Android Version Specific Issues',
      `Issues:\n${issues.map(i => `• ${i}`).join('\n')}\n\nSolutions:\n${solutions.map(s => `• ${s}`).join('\n')}`,
      [{ text: 'OK' }]
    );
  }
};
