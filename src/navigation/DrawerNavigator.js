import React, { useMemo } from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DrawerContent } from '../components/Drawer/DrawerContent';
import { useTheme } from '../context/ThemeContext';

import VoiceRecorderScreen from '../screens/VoiceRecorder/VoiceRecorderScreen';
import VoiceRecorderHistoryScreen from '../screens/VoiceRecorder/VoiceRecorderHistoryScreen';
import RecordedAudioScreen from '../screens/Recordings/RecordedAudioScreen';
import FloatingMicHistoryScreen from '../screens/FloatingMic/FloatingMicHistoryScreen';
import CallLogsScreen from '../screens/CallLogs/CallLogsScreen';
import VoiceRemindersScreen from '../screens/VoiceReminders/VoiceRemindersScreen';
import BottomTabsNavigator from './BottomTabsNavigator';
import TabRedirectScreen from './TabRedirectScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import GrammarCheckStack from './GrammarCheckStack';

const Drawer = createDrawerNavigator();

export const AppNavigator = () => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      drawerType: 'front',
      drawerPosition: 'left',
      swipeEnabled: true,
      gestureEnabled: true,
      drawerActiveTintColor: colors.text.white,
      drawerInactiveTintColor: colors.drawer.inactive,
      drawerActiveBackgroundColor: colors.drawer.active,
      drawerInactiveBackgroundColor: 'transparent',
      drawerStyle: {
        width: 300,
        backgroundColor: colors.drawer.background,
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
    }),
    [colors],
  );

  return (
    <Drawer.Navigator
      id="AppDrawer"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={screenOptions}
      initialRouteName="MainTabs"
    >
      <Drawer.Screen
        name="MainTabs"
        component={BottomTabsNavigator}
        options={{ drawerLabel: 'Home' }}
      />

      <Drawer.Screen
        name="FloatingMic"
        component={TabRedirectScreen}
        initialParams={{ tab: 'FloatingMicTab' }}
        options={{ drawerLabel: 'Floating Mic' }}
      />
      <Drawer.Screen
        name="Translator"
        component={TabRedirectScreen}
        initialParams={{ tab: 'TranslatorTab' }}
        options={{ drawerLabel: 'Translator' }}
      />
      <Drawer.Screen
        name="AskQuestion"
        component={TabRedirectScreen}
        initialParams={{ tab: 'AskQuestionTab' }}
        options={{ drawerLabel: 'Ask Question' }}
      />
      <Drawer.Screen
        name="Settings"
        component={TabRedirectScreen}
        initialParams={{ tab: 'SettingsTab' }}
        options={{ drawerLabel: 'Settings' }}
      />

      <Drawer.Screen
        name="VoiceRecorder"
        component={VoiceRecorderScreen}
        options={{ drawerLabel: 'Voice Command' }}
      />
      <Drawer.Screen
        name="VoiceRecorderHistory"
        component={VoiceRecorderHistoryScreen}
        options={{
          drawerLabel: () => null,
          drawerItemStyle: { height: 0, margin: 0, padding: 0, overflow: 'hidden' },
        }}
      />
      <Drawer.Screen
        name="RecordedAudio"
        component={RecordedAudioScreen}
        options={{ drawerLabel: 'My Recordings' }}
      />

      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ drawerLabel: 'Profile' }}
      />

      <Drawer.Screen
        name="FloatingMicHistory"
        component={FloatingMicHistoryScreen}
        options={{ drawerLabel: 'Speech History' }}
      />
      <Drawer.Screen
        name="CallLogs"
        component={CallLogsScreen}
        options={{ drawerLabel: 'Calls' }}
      />
      <Drawer.Screen
        name="VoiceReminders"
        component={VoiceRemindersScreen}
        options={{ drawerLabel: 'Voice Reminders' }}
      />
      <Drawer.Screen
        name="GrammarCheck"
        component={GrammarCheckStack}
        options={{ drawerLabel: 'Grammar Check' }}
      />
    </Drawer.Navigator>
  );
};

export default AppNavigator;
