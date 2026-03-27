/**
 * Easy Voice - Voice Assistant Control
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import AuthNavigator from './src/navigation/AuthNavigator';
import { AlertProvider } from './src/context/AlertContext';
import { AuthProvider } from './src/context/AuthContext';
import { FloatingSpeechHistorySync } from './src/components/FloatingSpeechHistorySync';
import { syncFloatingMicSettingsToNative } from './src/services/floatingMicConfig';

function FloatingMicNativeSync() {
  useEffect(() => {
    syncFloatingMicSettingsToNative();
  }, []);
  return null;
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AlertProvider>
          <NavigationContainer>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <FloatingMicNativeSync />
            <FloatingSpeechHistorySync />
            <AuthNavigator />
          </NavigationContainer>
        </AlertProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
