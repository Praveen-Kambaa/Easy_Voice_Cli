import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  Radio,
  Settings,
  X,
  LogOut,
  History,
  Languages,
  MessageCircle,
  Phone,
  Mic,
  Music,
  User,
} from 'lucide-react-native';
import { Colors } from '../../theme/Colors';
import { APP_NAME, APP_TAGLINE } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { useAppVersion } from '../../hooks/useAppVersion';

const MENU_ITEMS = [
  { title: 'Home', description: 'Dashboard & overview', Icon: Home, screen: 'MainTabs', tab: 'HomeTab' },

  { title: 'Voice Command', description: 'Record your voice', Icon: Mic, screen: 'VoiceRecorder' },
  { title: 'Calls', description: 'Call log & recordings', Icon: Phone, screen: 'CallLogs' },
  { title: 'My Recordings', description: 'View saved audio', Icon: Music, screen: 'RecordedAudio' },
  { title: 'Speech History', description: 'Floating mic transcripts', Icon: History, screen: 'FloatingMicHistory' },
  { title: 'Profile', description: 'Account & usage', Icon: User, screen: 'Profile' },
];

export const DrawerContent = (props) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const showAlert = useAlert();
  const { version: appVersion } = useAppVersion();

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
    // logout();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.brandText}>
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Text style={styles.appTagline}>{APP_TAGLINE}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => props.navigation.closeDrawer()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <X size={18} color={Colors.text.secondary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {user ? (
          <View style={styles.profileRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.username?.[0]?.toUpperCase() ?? 'U'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userDisplayName} numberOfLines={1}>
                {user.displayName}
              </Text>
              <Text style={styles.userUsername} numberOfLines={1}>
                @{user.username}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <LogOut size={16} color="#EF4444" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Navigation items */}
      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        {/* <Text style={styles.navLabel}>Navigation</Text> */}

        <View style={styles.groupCard}>
          {MENU_ITEMS.map((item, idx) => {
            const isActive =
              item.screen === 'MainTabs'
                ? currentRouteName === 'MainTabs' && currentTabName === item.tab
                : currentRouteName === item.screen;
            const iconColor = isActive ? Colors.primary : Colors.text.secondary;
            const isLast = idx === MENU_ITEMS.length - 1;

            return (
              <TouchableOpacity
                key={`${item.screen}:${item.tab ?? 'drawer'}`}
                style={[styles.menuItem, isActive && styles.menuItemActive, isLast && styles.menuItemLast]}
                onPress={() => handleNav(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                  <item.Icon size={18} color={iconColor} strokeWidth={1.8} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuTitle, isActive && styles.menuTitleActive]}>{item.title}</Text>
                  <Text style={styles.menuDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                {isActive ? <View style={styles.activeDot} /> : <View style={styles.chevSpace} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.footerText}>{APP_NAME} v{appVersion}</Text>
        <Text style={styles.footerSubText}>Voice Assistant Platform</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.drawer.background,
  },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.drawer.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandText: {
    flex: 1,
  },
  appName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.3,
  },
  appTagline: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  userUsername: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.text.secondary,
  },
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginLeft: 4,
    marginBottom: 10,
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.drawer.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  menuItemActive: {
    backgroundColor: 'rgba(30, 136, 255, 0.08)',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(30, 136, 255, 0.12)',
  },
  menuItemText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 1,
  },
  menuTitleActive: {
    color: Colors.text.primary,
  },
  menuDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  chevSpace: { width: 10 },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.drawer.border,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  footerSubText: {
    fontSize: 11,
    color: Colors.text.light,
  },
});

export default DrawerContent;
