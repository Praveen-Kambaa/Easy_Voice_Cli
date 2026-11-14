import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, Languages, Home, SlidersHorizontal } from 'lucide-react-native';

import HomeScreen from '../screens/Home/HomeScreen';
import FloatingMicScreen from '../screens/FloatingMic/FloatingMicScreen';
import TranslatorStack from './TranslatorStack';
import AskQuestionStack from './AskQuestionStack';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { AskAiIcon } from '../components/common/AskAiIcon';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

function TabIcon({ Icon, focused, colors, isDark }) {
  const activePillBg = isDark ? 'rgba(0, 229, 146, 0.22)' : '#DCEBFE';
  return (
    <View
      style={[
        styles.iconCapsule,
        focused && { backgroundColor: activePillBg },
      ]}
    >
      <Icon
        size={20}
        color={focused ? colors.primary : colors.text.secondary}
        strokeWidth={focused ? 2.3 : 1.9}
        focused={focused}
      />
    </View>
  );
}

export default function BottomTabsNavigator() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const bottomPad = Math.max(insets.bottom, 8);
  const tabHeight = 58 + bottomPad;

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: colors.tabBar.background,
      borderTopColor: colors.tabBar.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 4,
      paddingBottom: bottomPad,
      height: tabHeight,
      ...Platform.select({
        android: { elevation: 10 },
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
      }),
    }),
    [colors.tabBar.background, colors.tabBar.border, bottomPad, tabHeight],
  );

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="FloatingMicTab"
        component={FloatingMicScreen}
        options={{
          tabBarLabel: 'Mic',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Mic} focused={focused} colors={colors} isDark={isDark} />
          ),
        }}
      />
      <Tab.Screen
        name="TranslatorTab"
        component={TranslatorStack}
        options={{
          tabBarLabel: 'Translator',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Languages} focused={focused} colors={colors} isDark={isDark} />
          ),
        }}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Home} focused={focused} colors={colors} isDark={isDark} />
          ),
        }}
      />
      <Tab.Screen
        name="AskQuestionTab"
        component={AskQuestionStack}
        options={{
          tabBarLabel: 'Ask AI',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={AskAiIcon} focused={focused} colors={colors} isDark={isDark} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={SlidersHorizontal} focused={focused} colors={colors} isDark={isDark} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconCapsule: {
    width: 54,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
    marginTop: -2,
    marginBottom: 2,
  },
});
