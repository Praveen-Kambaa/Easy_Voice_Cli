import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Menu, ChevronLeft } from 'lucide-react-native';
import { Colors } from '../../theme/Colors';

const APP_DRAWER_ID = 'AppDrawer';

/** Known drawer route names from DrawerNavigator (subset to avoid false positives). */
const DRAWER_ROUTE_MARKERS = ['Home', 'Settings', 'Translator', 'VoiceRecorder', 'FloatingMic'];

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

/** Walk root navigation state to the drawer and return the focused drawer screen name (e.g. Translator, Home). */
function selectDrawerFocusedRouteName(rootState) {
  if (!rootState) return null;
  const visit = (s) => {
    if (!s?.routes?.length) return null;
    if (s.type === 'drawer' || looksLikeAppDrawerState(s)) {
      const i = s.index ?? 0;
      return s.routes[i]?.name ?? null;
    }
    const r = s.routes[s.index ?? 0];
    return r?.state ? visit(r.state) : null;
  };
  return visit(rootState);
}

export const AppHeader = ({
  title,
  showMenuButton = true,
  rightComponent,
  /** Dark bar for Translator and similar screens */
  dark = false,
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
  const drawerFocusedRouteName = useNavigationState(selectDrawerFocusedRouteName);
  const isDrawerHome = drawerFocusedRouteName === 'Home';

  const openDrawer = useCallback(() => {
    (drawerNav ?? navigation).openDrawer?.();
  }, [drawerNav, navigation]);

  /** Pop inner stack / drawer history first; only then exit module to Home. */
  const handleModuleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (drawerNav) {
      drawerNav.navigate('Home');
      return;
    }
    let n = navigation;
    for (let i = 0; i < 10 && n; i += 1) {
      const st = n.getState?.();
      if (st?.type === 'drawer' || looksLikeAppDrawerState(st)) {
        n.navigate('Home');
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
  } else if (isDrawerHome && showMenuButton) {
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
  } else if (!isDrawerHome && drawerFocusedRouteName) {
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
  } else if (!drawerFocusedRouteName && navigation.canGoBack()) {
    /* Drawer not resolved (edge case) but stack has history — still show back, not menu. */
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
