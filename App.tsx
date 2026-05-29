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
import { AlertProvider } from './src/context/AlertContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { FloatingSpeechHistorySync } from './src/components/FloatingSpeechHistorySync';
import { AiQaHistorySync } from './src/components/AiQaHistorySync';
import { syncFloatingMicSettingsToNative } from './src/services/floatingMicConfig';
import { initVoiceReminderNotifications } from './src/services/voiceReminderService';
import RequiredPermissionsGate from './src/components/RequiredPermissionsGate';

function FloatingMicNativeSync() {
  useEffect(() => {
    syncFloatingMicSettingsToNative();
  }, []);
  return null;
}

function AppNavigation() {
  const { isDark, navigationTheme, colors } = useTheme();

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
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
