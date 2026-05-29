import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenContainer } from '../common/ScreenContainer';
import { AppHeader } from '../Header/AppHeader';
import { PrimaryButton } from '../common/PrimaryButton';
import { useTheme } from '../../context/ThemeContext';

function resolveDrawerNav(navigation) {
  try {
    const byId = navigation.getParent?.('AppDrawer');
    if (byId) return byId;
  } catch {
    // ignore
  }
  let n = navigation;
  for (let i = 0; i < 10 && n; i += 1) {
    const st = n.getState?.();
    if (st?.type === 'drawer') return n;
    n = n.getParent?.();
  }
  return navigation;
}

/**
 * Shown when Ask Question is unavailable on Android: Ask Question must be enabled under Settings.
 */
export default function AskQuestionAccessBlocked({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const drawerNav = resolveDrawerNav(navigation);
  return (
    <ScreenContainer>
      <AppHeader title="Ask Question" />
      <View style={styles.body}>
        <Text style={styles.title}>Ask Question is not available</Text>
        <Text style={[styles.text, styles.textGap]}>
          In <Text style={styles.em}>Settings</Text>, under{' '}
          <Text style={styles.em}>Floating mic → Overlay actions</Text>, turn on{' '}
          <Text style={styles.em}>Ask Question</Text> (Ask AI). Then return to this tab.
        </Text>
        <View style={styles.buttons}>
          <PrimaryButton
            title="Open Settings"
            onPress={() => drawerNav.navigate('MainTabs', { screen: 'SettingsTab' })}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  text: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  textGap: {
    marginBottom: 24,
  },
  em: {
    fontWeight: '700',
    color: colors.text.primary,
  },
  buttons: {
    gap: 12,
  },
  });
}
