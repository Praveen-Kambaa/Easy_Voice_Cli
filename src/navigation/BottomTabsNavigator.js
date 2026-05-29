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
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../theme/Shadows';

const Tab = createBottomTabNavigator();

function TabBarBackground({ backgroundColor }) {
  return <View style={[StyleSheet.absoluteFillObject, { backgroundColor }]} />;
}

function CenterButton({ onPress, accessibilityState, styles }) {
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

function TabIcon({ Icon, focused, colors }) {
  return (
    <View style={stylesStatic.iconWrap}>
      <Icon size={22} color={focused ? colors.primary : colors.text.light} strokeWidth={2} />
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  iconWrap: {
    width: 44,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function BottomTabsNavigator() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createTabStyles(colors), [colors]);

  const makeTabIcon = (Icon) => ({ focused }) => <TabIcon Icon={Icon} focused={focused} colors={colors} />;

  const tabBarStyle = useMemo(() => {
    const bottomPad = Math.max(insets.bottom, 8);
    return [
      styles.tabBar,
      {
        paddingBottom: bottomPad,
        height: 58 + bottomPad,
      },
    ];
  }, [insets.bottom, styles.tabBar]);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle,
        tabBarBackground: () => <TabBarBackground backgroundColor={colors.tabBar.background} />,
        tabBarHideOnKeyboard: true,
      }}
    >
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
            <CenterButton
              accessibilityState={props.accessibilityState}
              onPress={props.onPress}
              styles={styles}
            />
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

function createTabStyles(colors) {
  return StyleSheet.create({
    tabBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.tabBar.border,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      backgroundColor: colors.tabBar.background,
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
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
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
}
