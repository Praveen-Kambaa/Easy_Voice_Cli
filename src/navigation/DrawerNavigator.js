import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DrawerContent } from '../components/Drawer/DrawerContent';

import PermissionDashboard from '../components/PermissionDashboard';
import AndroidPermissionsScreen from '../screens/AndroidPermissionsScreen';
import FloatingMicScreen from '../screens/FloatingMicScreen';
import VoiceRecorderScreen from '../screens/VoiceRecorderScreen';
import RecordedAudioScreen from '../screens/RecordedAudioScreen';

const Drawer = createDrawerNavigator();

const screenOptions = {
  headerShown: false,
  drawerType: 'front',
  drawerPosition: 'left',
  swipeEnabled: true,
  gestureEnabled: true,
  drawerActiveTintColor: '#FFFFFF',
  drawerInactiveTintColor: '#4B5563',
  drawerActiveBackgroundColor: '#3B82F6',
  drawerInactiveBackgroundColor: 'transparent',
  drawerStyle: {
    width: 320,
    backgroundColor: '#F9FAFB',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  drawerLabelStyle: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: -8,
  },
  drawerItemStyle: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 8,
  },
};

export const AppNavigator = () => {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={screenOptions}
    >
      <Drawer.Screen
        name="Dashboard"
        component={PermissionDashboard}
        options={{
          drawerLabel: '📊 Dashboard',
        }}
      />
      <Drawer.Screen
        name="VoiceRecorder"
        component={VoiceRecorderScreen}
        options={{
          drawerLabel: '🎙️ Voice Recorder',
        }}
      />
      <Drawer.Screen
        name="RecordedAudio"
        component={RecordedAudioScreen}
        options={{
          drawerLabel: '🎵 My Recordings',
        }}
      />
      <Drawer.Screen
        name="AndroidPermissions"
        component={AndroidPermissionsScreen}
        options={{
          drawerLabel: '🔐 Permissions',
        }}
      />
      <Drawer.Screen
        name="FloatingMic"
        component={FloatingMicScreen}
        options={{
          drawerLabel: '🎤 Floating Mic',
        }}
      />
    </Drawer.Navigator>
  );
};

export default AppNavigator;
