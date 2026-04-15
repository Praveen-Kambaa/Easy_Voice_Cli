import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../theme/Colors';

/**
 * Drawer alias screen that redirects into MainTabs.
 * Used to support navigation.navigate('Settings') etc. while keeping tabs as the real UI.
 *
 * Params:
 * - tab: one of the BottomTabs route names (e.g. 'SettingsTab')
 */
export default function TabRedirectScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  useEffect(() => {
    // Ensure we navigate on the Drawer navigator, not a nested child.
    let nav = navigation;
    try {
      const parent = navigation.getParent?.('AppDrawer');
      if (parent) nav = parent;
    } catch {
      // ignore
    }
    const routeName = route?.name;
    const tab =
      route?.params?.tab ||
      (routeName === 'FloatingMic'
        ? 'FloatingMicTab'
        : routeName === 'Translator'
          ? 'TranslatorTab'
          : routeName === 'AskQuestion'
            ? 'AskQuestionTab'
            : routeName === 'Settings'
              ? 'SettingsTab'
              : null);
    if (!tab) {
      nav.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }
    nav.navigate('MainTabs', { screen: tab });
  }, [navigation, route?.name, route?.params?.tab]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundAlt,
  },
});

