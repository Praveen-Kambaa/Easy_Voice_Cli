import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  X,
  LogOut,
  History,
  Phone,
  Mic,
  Music,
  User,
  Bell,
  SpellCheck,
  CheckCircle,
} from 'lucide-react-native';
import { APP_NAME, APP_TAGLINE } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { useAppVersion } from '../../hooks/useAppVersion';
import { useTheme } from '../../context/ThemeContext';

const MENU_ITEMS = [
  { title: 'Home', description: 'Dashboard & overview', Icon: Home, screen: 'MainTabs', tab: 'HomeTab' },
  { title: 'Voice Command', description: 'Record your voice', Icon: Mic, screen: 'VoiceRecorder' },
  { title: 'Calls', description: 'Call log & recordings', Icon: Phone, screen: 'CallLogs' },
  { title: 'My Recordings', description: 'View saved audio', Icon: Music, screen: 'RecordedAudio' },
  { title: 'Voice Reminders', description: 'Voice note & time alarm', Icon: Bell, screen: 'VoiceReminders' },
  { title: 'Speech History', description: 'Floating mic transcripts', Icon: History, screen: 'FloatingMicHistory' },
  { title: 'Grammar Check', description: 'Fix grammar instantly', Icon: SpellCheck, screen: 'GrammarCheck', hasBadge: true },
  { title: 'Profile', description: 'Account & usage', Icon: User, screen: 'Profile' },
];

export const DrawerContent = (props) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const showAlert = useAlert();
  const { version: appVersion } = useAppVersion();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createDrawerStyles(colors, isDark), [colors, isDark]);

  const focusedDrawerRoute = props.state?.routes?.[props.state?.index];
  const currentRouteName = focusedDrawerRoute?.name;
  const currentTabName =
    focusedDrawerRoute?.name === 'MainTabs'
      ? focusedDrawerRoute?.state?.routes?.[focusedDrawerRoute?.state?.index ?? 0]?.name
      : null;

  const handleNav = (item) => {
    if (item.screen === 'MainTabs') {
      props.navigation.navigate('MainTabs', item.tab ? { screen: item.tab } : undefined);
    } else {
      props.navigation.navigate(item.screen);
    }
    props.navigation.closeDrawer();
  };

  const handleLogout = () => {
    showAlert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: logout }],
    );
  };

  const displayName = user?.displayName || user?.name || 'Praveen Kambaa';
  const username = user?.username || 'praveen';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'PK';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.brandGroup}>
            <View style={styles.appLogoWrap}>
              <Mic size={22} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.appName}>{APP_NAME}</Text>
              <Text style={styles.appTagline}>{APP_TAGLINE}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => props.navigation.closeDrawer()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* User Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.proBadge}>
                <CheckCircle size={11} color={colors.primary} strokeWidth={2.6} />
                <Text style={styles.proBadgeText}>Pro</Text>
              </View>
            </View>
            <Text style={styles.userUsername} numberOfLines={1}>
              @{username}
            </Text>
          </View>
        </View>
      </View>

      {/* Navigation items */}
      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.groupCard}>
          {MENU_ITEMS.map((item, idx) => {
            const isActive =
              item.screen === 'MainTabs'
                ? currentRouteName === 'MainTabs' && currentTabName === item.tab
                : currentRouteName === item.screen;
            const isLast = idx === MENU_ITEMS.length - 1;

            return (
              <TouchableOpacity
                key={`${item.screen}:${item.tab ?? 'drawer'}`}
                style={[
                  styles.menuItem,
                  isActive && styles.menuItemActive,
                  isLast && styles.menuItemLast,
                ]}
                onPress={() => handleNav(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                  <item.Icon
                    size={19}
                    color={isActive ? colors.primary : colors.text.secondary}
                    strokeWidth={isActive ? 2.2 : 1.9}
                  />
                </View>
                <View style={styles.menuItemText}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[
                        styles.menuTitle,
                        isActive && styles.menuTitleActive,
                      ]}
                    >
                      {item.title}
                    </Text>
                    {item.hasBadge ? <View style={styles.notifyDot} /> : null}
                  </View>
                  <Text style={styles.menuDesc} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Logout + Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <LogOut size={18} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>{APP_NAME} v{appVersion}</Text>
        <Text style={styles.footerSubText}>Professional Voice Assistant</Text>
      </View>
    </View>
  );
};

function createDrawerStyles(colors, isDark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.drawer.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.drawer.border,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    brandGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    appLogoWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandText: {
      flex: 1,
    },
    appName: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    appTagline: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.backgroundAlt,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    profileCard: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    avatarWrap: {
      position: 'relative',
    },
    userAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userAvatarText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    onlineDot: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#22C55E',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    userInfo: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    userDisplayName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    proBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#EFF6FF',
    },
    proBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    userUsername: {
      marginTop: 3,
      fontSize: 12,
      color: colors.text.secondary,
    },
    menuScroll: {
      flex: 1,
    },
    menuContent: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
    groupCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    menuItemActive: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#E0EEFE',
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.backgroundAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapActive: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.28)' : '#BFDBFE',
    },
    menuItemText: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    menuTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 2,
    },
    menuTitleActive: {
      color: colors.primary,
      fontWeight: '800',
    },
    notifyDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    menuDesc: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.drawer.border,
      backgroundColor: colors.drawer.background,
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#EF4444',
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    logoutBtnText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    footerText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 2,
    },
    footerSubText: {
      fontSize: 11,
      color: colors.text.light,
      textAlign: 'center',
    },
  });
}

export default DrawerContent;
