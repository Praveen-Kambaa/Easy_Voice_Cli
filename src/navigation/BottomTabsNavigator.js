import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Radio, Languages, MessageCircle, Settings } from 'lucide-react-native';

import HomeScreen from '../screens/Home/HomeScreen';
import FloatingMicScreen from '../screens/FloatingMic/FloatingMicScreen';
import TranslatorStack from './TranslatorStack';
import AskQuestionStack from './AskQuestionStack';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { Colors } from '../theme/Colors';
import { Shadows } from '../theme/Shadows';

const Tab = createBottomTabNavigator();

function TabBarBackground() {
  return <View style={styles.tabBarBg} />;
}

function CenterButton({ onPress, accessibilityState }) {
  const selected = !!accessibilityState?.selected;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.centerBtnWrap}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Home"
    >
      <View style={[styles.centerBtn, selected && styles.centerBtnActive]}>
        <Home size={22} color="#FFFFFF" strokeWidth={2.2} />
      </View>
    </TouchableOpacity>
  );
}

function TabIcon({ Icon, focused }) {
  return (
    <View style={styles.iconWrap}>
      <Icon size={22} color={focused ? Colors.primary : Colors.text.light} strokeWidth={2} />
    </View>
  );
}

function makeTabIcon(Icon) {
  return ({ focused }) => <TabIcon Icon={Icon} focused={focused} />;
}

export default function BottomTabsNavigator() {
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(() => {
    const bottomPad = Math.max(insets.bottom, 8);
    return [
      styles.tabBar,
      {
        paddingBottom: bottomPad,
        height: 58 + bottomPad,
      },
    ];
  }, [insets.bottom]);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle,
        tabBarBackground: TabBarBackground,
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* Floating Mic first (left-most) */}
      <Tab.Screen name="FloatingMicTab" component={FloatingMicScreen} options={{ tabBarIcon: makeTabIcon(Radio) }} />
      <Tab.Screen
        name="TranslatorTab"
        component={TranslatorStack}
        options={{ tabBarIcon: makeTabIcon(Languages) }}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <CenterButton accessibilityState={props.accessibilityState} onPress={props.onPress} />
          ),
        }}
      />
      <Tab.Screen
        name="AskQuestionTab"
        component={AskQuestionStack}
        options={{ tabBarIcon: makeTabIcon(MessageCircle) }}
      />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ tabBarIcon: makeTabIcon(Settings) }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    backgroundColor: Colors.surface,
    paddingTop: 8,
    paddingHorizontal: 0,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
  },
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    borderRadius: 0,
  },
  iconWrap: {
    width: 44,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtnWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
    ...Shadows.md,
  },
  centerBtnActive: {
    transform: [{ scale: 1.02 }],
  },
});

