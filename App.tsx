/**
 * Easy Voice - Voice Assistant Control
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { subscribeCallRecordingServiceOnAppActive } from './src/services/callRecordingServiceRunner';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import AuthNavigator from './src/navigation/AuthNavigator';
import { appLinking } from './src/navigation/linking';
import {
  KeyboardPendingLinkHandler,
  useAppNavigationRef,
} from './src/components/KeyboardPendingLinkHandler';
import { AlertProvider } from './src/context/AlertContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { FloatingSpeechHistorySync } from './src/components/FloatingSpeechHistorySync';
import { AiQaHistorySync } from './src/components/AiQaHistorySync';
import {
  syncFloatingMicSettingsToNative,
  syncKeyboardSettingsToNative,
} from './src/services/floatingMicConfig';
import { initVoiceReminderNotifications } from './src/services/voiceReminderService';
import RequiredPermissionsGate from './src/components/RequiredPermissionsGate';

function FloatingMicNativeSync() {
  useEffect(() => {
    syncFloatingMicSettingsToNative();
    // iOS keyboard extension reads userId/languages from the shared app group.
    syncKeyboardSettingsToNative();
  }, []);
  return null;
}

function AppNavigation() {
  const { isDark, navigationTheme, colors } = useTheme();
  const navigationRef = useAppNavigationRef();

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={appLinking}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <KeyboardPendingLinkHandler navigationRef={navigationRef} />
      <FloatingMicNativeSync />
      <FloatingSpeechHistorySync />
      <AiQaHistorySync />
      <AuthNavigator />
    </NavigationContainer>
  );
}

function App() {
  useEffect(() => {
    return subscribeCallRecordingServiceOnAppActive();
  }, []);

  useEffect(() => {
    initVoiceReminderNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RequiredPermissionsGate>
          <AuthProvider>
            <AlertProvider>
              <AppNavigation />
            </AlertProvider>
          </AuthProvider>
        </RequiredPermissionsGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
