import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DrawerContent } from '../components/Drawer/DrawerContent';
import { Colors } from '../theme/Colors';

import HomeScreen from '../screens/Home/HomeScreen';
import VoiceRecorderScreen from '../screens/VoiceRecorder/VoiceRecorderScreen';
import RecordedAudioScreen from '../screens/Recordings/RecordedAudioScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import FloatingMicScreen from '../screens/FloatingMic/FloatingMicScreen';

const Drawer = createDrawerNavigator();

const screenOptions = {
  headerShown: false,
  drawerType: 'front',
  drawerPosition: 'left',
  swipeEnabled: true,
  gestureEnabled: true,
  drawerActiveTintColor: Colors.text.white,
  drawerInactiveTintColor: Colors.drawer.inactive,
  drawerActiveBackgroundColor: Colors.drawer.active,
  drawerInactiveBackgroundColor: 'transparent',
  drawerStyle: {
    width: 300,
    backgroundColor: Colors.drawer.background,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  drawerLabelStyle: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: -8,
  },
  drawerItemStyle: {
    borderRadius: 10,
    marginHorizontal: 12,
    marginVertical: 3,
    paddingVertical: 4,
  },
};

export const AppNavigator = () => {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={screenOptions}
      initialRouteName="Home"
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ drawerLabel: 'Home' }}
      />
      <Drawer.Screen
        name="VoiceRecorder"
        component={VoiceRecorderScreen}
        options={{ drawerLabel: 'Voice Recorder' }}
      />
      <Drawer.Screen
        name="RecordedAudio"
        component={RecordedAudioScreen}
        options={{ drawerLabel: 'My Recordings' }}
      />
      <Drawer.Screen
        name="FloatingMic"
        component={FloatingMicScreen}
        options={{ drawerLabel: 'Floating Mic' }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ drawerLabel: 'Settings' }}
      />
    </Drawer.Navigator>
  );
};

export default AppNavigator;
