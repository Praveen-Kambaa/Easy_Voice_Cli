import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Menu, ChevronLeft, Mic } from 'lucide-react-native';
import { AskAiIcon } from '../common/AskAiIcon';
import { useTheme } from '../../context/ThemeContext';

const APP_DRAWER_ID = 'AppDrawer';

/** Known drawer route names from DrawerNavigator (subset to avoid false positives). */
const DRAWER_ROUTE_MARKERS = [
  'MainTabs',
  'VoiceRecorder',
  'VoiceRecorderHistory',
  'RecordedAudio',
  'VoiceReminders',
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
  subtitle,
  showMenuButton = true,
  rightComponent,
  /** Dark bar override */
  dark = false,
  /** Force hamburger menu (Home only). */
  forceMenu = false,
  /** Show app icon badge next to title on Home */
  showHomeBrand = false,
  /** Optional custom brand icon in the badge */
  brandIcon,
  /** Optional override for the leading control */
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  const drawerNav = useMemo(() => resolveDrawerNavigation(navigation), [navigation]);
  const drawerFocusedRouteName = getDrawerFocusedName(drawerNav, navigation);

  const openDrawer = useCallback(() => {
    (drawerNav ?? navigation).openDrawer?.();
  }, [drawerNav, navigation]);

  const handleModuleBack = useCallback(() => {
    const st = navigation.getState?.();
    if (st?.type === 'stack' && typeof st.index === 'number' && st.index > 0) {
      navigation.goBack();
      return;
    }

    if (drawerNav && drawerFocusedRouteName && drawerFocusedRouteName !== 'HomeTab') {
      drawerNav.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (drawerNav) {
      drawerNav.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }
    let n = navigation;
    for (let i = 0; i < 10 && n; i += 1) {
      const state = n.getState?.();
      if (state?.type === 'drawer' || looksLikeAppDrawerState(state)) {
        n.navigate('MainTabs', { screen: 'HomeTab' });
        return;
      }
      n = n.getParent?.();
    }
  }, [navigation, drawerNav, drawerFocusedRouteName]);

  const barBg = dark ? '#0f1419' : colors.header.background;
  const barBorder = dark ? 'rgba(255,255,255,0.08)' : colors.header.border;
  const titleColor = dark ? '#f1f5f9' : colors.header.title;
  const iconColor = dark ? '#e2e8f0' : colors.header.icon;

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
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: barBg,
          borderBottomColor: barBorder,
        },
      ]}
    >
      <View style={styles.headerRow}>
        {leftContent}

        <View style={styles.titleWrap}>
          {showHomeBrand ? (
            <View style={styles.brandRow}>
              <View
                style={[
                  styles.brandBadge,
                  {
                    backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
                    borderColor: colors.border,
                  },
                ]}
              >
                {brandIcon ? (
                  brandIcon
                ) : title === 'Ask Ai' || title === 'Ask Question' ? (
                  <AskAiIcon size={16} />
                ) : (
                  <Mic size={14} color={colors.primary} strokeWidth={2.4} />
                )}
              </View>
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
          ) : subtitle ? (
            <View style={styles.titleCol}>
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                {title}
              </Text>
              <View style={styles.subtitleRow}>
                {subtitle.startsWith('•') ? <View style={styles.greenHeaderDot} /> : null}
                <Text style={[styles.subtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                  {subtitle.startsWith('•') ? subtitle.slice(1).trim() : subtitle}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        <View style={styles.rightSlot}>
          {rightComponent ? rightComponent : <View style={styles.menuPlaceholder} />}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 52,
  },
  menuButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  menuPlaceholder: {
    width: 38,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  greenHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  rightSlot: {
    minWidth: 38,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
