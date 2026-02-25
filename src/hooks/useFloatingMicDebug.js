import { NativeModules, Platform, Alert, Linking } from 'react-native';

const { FloatingMicModule } = NativeModules;

export const debugFloatingOverlay = async () => {
  console.log('=== FLOATING OVERLAY DEBUG ===');
  
  if (Platform.OS !== 'android') {
    console.error('Floating overlay only works on Android');
    return;
  }

  try {
    // Check permissions
    const permissions = await FloatingMicModule.checkPermissions();
    console.log('Permissions:', permissions);
    
    // Detailed permission checks
    console.log('\n=== DETAILED PERMISSION ANALYSIS ===');
    
    // 1. Overlay Permission Check
    if (!permissions.overlay) {
      console.error('❌ OVERLAY PERMISSION NOT GRANTED');
      Alert.alert(
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
      console.log('✅ Overlay permission granted');
    }

    // 2. Record Audio Permission Check
    if (!permissions.recordAudio) {
      console.error('❌ RECORD AUDIO PERMISSION NOT GRANTED');
      Alert.alert(
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
      console.log('✅ Record audio permission granted');
    }

    // 3. Accessibility Service Check
    if (!permissions.accessibility) {
      console.error('❌ ACCESSIBILITY SERVICE NOT ENABLED');
      Alert.alert(
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
      console.log('✅ Accessibility service enabled');
    }

    console.log('\n=== STARTING SERVICE DEBUG ===');
    
    // Try to start the service
    try {
      const result = await FloatingMicModule.startFloatingMic();
      console.log('✅ Service started successfully:', result);
      
      Alert.alert(
        'Service Started',
        'Floating mic service started successfully!\n\nIf you still cannot see the floating icon:\n\n1. Check notification panel for service notification\n2. Try restarting your phone\n3. Check battery optimization settings\n4. Make sure no other overlay apps are blocking',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('❌ Failed to start service:', error);
      
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
      
      Alert.alert(
        'Service Start Failed',
        `Error: ${errorMessage}\n\nSuggestions:\n${suggestions.map(s => `• ${s}`).join('\n')}`,
        [{ text: 'OK' }]
      );
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    Alert.alert('Debug Error', error.message);
  }
  
  console.log('=== END DEBUG ===');
};

export const checkBatteryOptimization = async () => {
  console.log('=== BATTERY OPTIMIZATION CHECK ===');
  
  // This would need to be implemented in native module
  Alert.alert(
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
  console.log('Android Version:', androidVersion);
  
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
    Alert.alert(
      'Android Version Specific Issues',
      `Issues:\n${issues.map(i => `• ${i}`).join('\n')}\n\nSolutions:\n${solutions.map(s => `• ${s}`).join('\n')}`,
      [{ text: 'OK' }]
    );
  }
};
