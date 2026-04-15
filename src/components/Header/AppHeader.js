import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Menu, ChevronLeft } from 'lucide-react-native';
import { Colors } from '../../theme/Colors';

const APP_DRAWER_ID = 'AppDrawer';

/** Known drawer route names from DrawerNavigator (subset to avoid false positives). */
const DRAWER_ROUTE_MARKERS = [
  'MainTabs',
  'VoiceRecorder',
  'VoiceRecorderHistory',
  'RecordedAudio',
  'FloatingMicHistory',
  'CallLogs',
];

function looksLikeAppDrawerState(state) {
  if (!state?.routeNames || !Array.isArray(state.routeNames)) return false;
  const names = state.routeNames;
  return DRAWER_ROUTE_MARKERS.every((m) => names.includes(m));
}

function resolveDrawerNavigation(navigation) {
  try {
    const byId = navigation.getParent(APP_DRAWER_ID);
    if (byId) return byId;
  } catch {
    // getParent(id) unsupported
  }

  let n = navigation;
  for (let i = 0; i < 12 && n; i += 1) {
    const state = n.getState?.();
    if (state?.type === 'drawer' || looksLikeAppDrawerState(state)) {
      return n;
    }
    n = n.getParent?.();
  }

  return null;
}

function getFocusedTabNameFromTabNav(tabNav) {
  const st = tabNav?.getState?.();
  const idx = st?.index ?? 0;
  return st?.routes?.[idx]?.name ?? null;
}

function getDrawerFocusedName(drawerNav, tabNav) {
  const drawerState = drawerNav?.getState?.();
  const i = drawerState?.index ?? 0;
  const drawerRoute = drawerState?.routes?.[i];
  const drawerName = drawerRoute?.name ?? null;
  if (!drawerName) return null;

  if (drawerName === 'MainTabs') {
    const tabState = drawerRoute?.state;
    const tabIdx = tabState?.index ?? 0;
    const tabName = tabState?.routes?.[tabIdx]?.name;
    return tabName ?? getFocusedTabNameFromTabNav(tabNav) ?? null;
  }

  return drawerName;
}

export const AppHeader = ({
  title,
  showMenuButton = true,
  rightComponent,
  /** Dark bar for Translator and similar screens */
  dark = false,
  /** Force hamburger menu (Home only). */
  forceMenu = false,
  /**
   * Optional override for the leading control. If omitted, behavior is:
   * - Drawer route Home → hamburger (open drawer)
   * - Other drawer routes → back: goBack() when possible, else navigate('Home')
   */
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const drawerNav = useMemo(() => resolveDrawerNavigation(navigation), [navigation]);
  const drawerFocusedRouteName = getDrawerFocusedName(drawerNav, navigation);
  const isDrawerHome = drawerFocusedRouteName === 'HomeTab';

  const openDrawer = useCallback(() => {
    (drawerNav ?? navigation).openDrawer?.();
  }, [drawerNav, navigation]);

  /** Pop inner stack / drawer history first; only then exit module to Home. */
  const handleModuleBack = useCallback(() => {
    // If we're inside a stack (History/Saved/etc.), prefer normal goBack.
    const st = navigation.getState?.();
    if (st?.type === 'stack' && typeof st.index === 'number' && st.index > 0) {
      navigation.goBack();
      return;
    }

    // If we're on a tab root screen, never "goBack" to previous tab (e.g., Translator -> FloatingMic).
    if (drawerNav && drawerFocusedRouteName && drawerFocusedRouteName !== 'HomeTab') {
      drawerNav.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (drawerNav) {
      // Return to the Home tab inside MainTabs.
      drawerNav.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }
    let n = navigation;
    for (let i = 0; i < 10 && n; i += 1) {
      const st = n.getState?.();
      if (st?.type === 'drawer' || looksLikeAppDrawerState(st)) {
        n.navigate('MainTabs', { screen: 'HomeTab' });
        return;
      }
      n = n.getParent?.();
    }
  }, [navigation, drawerNav]);

  const barBg = dark ? '#0f1419' : Colors.surface;
  const barBorder = dark ? 'rgba(255,255,255,0.08)' : Colors.border;
  const titleColor = dark ? '#f1f5f9' : Colors.text.primary;
  const iconColor = dark ? '#e2e8f0' : Colors.text.primary;

  let leftContent;
  if (onBack) {
    leftContent = (
      <TouchableOpacity
        style={styles.menuButton}
        onPress={onBack}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={24} color={iconColor} strokeWidth={2} />
      </TouchableOpacity>
    );
  } else if (forceMenu && showMenuButton) {
    leftContent = (
      <TouchableOpacity
        style={styles.menuButton}
        onPress={openDrawer}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Menu size={22} color={iconColor} strokeWidth={2} />
      </TouchableOpacity>
    );
  } else if (showMenuButton) {
    // Everywhere else: show Back (Home uses forceMenu).
    leftContent = (
      <TouchableOpacity
        style={styles.menuButton}
        onPress={handleModuleBack}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={24} color={iconColor} strokeWidth={2} />
      </TouchableOpacity>
    );
  } else {
    leftContent = <View style={styles.menuPlaceholder} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: barBg, borderBottomColor: barBorder }]}>
      <View style={styles.headerRow}>
        {leftContent}

        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.rightSlot}>
          {rightComponent ? rightComponent : <View style={styles.menuPlaceholder} />}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 56,
  },
  menuButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuPlaceholder: {
    width: 36,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
