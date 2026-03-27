import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Keyboard,
  Home,
  Mic,
  Music,
  Radio,
  Settings,
  X,
  LogOut,
  ChevronRight,
  History,
  Languages,
} from 'lucide-react-native';
import { Colors } from '../../theme/Colors';
import { APP_NAME, APP_TAGLINE } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { useAppVersion } from '../../hooks/useAppVersion';

const MENU_ITEMS = [
  { title: 'Home', description: 'Dashboard & overview', Icon: Home, screen: 'Home' },
  { title: 'Voice Command', description: 'Record your voice', Icon: Mic, screen: 'VoiceRecorder' },
  { title: 'Floating Mic', description: 'Background recording', Icon: Radio, screen: 'FloatingMic' },
  { title: 'My Recordings', description: 'View saved audio', Icon: Music, screen: 'RecordedAudio' },
  { title: 'Speech History', description: 'Floating mic transcripts', Icon: History, screen: 'FloatingMicHistory' },
  { title: 'Translator', description: 'Text translation', Icon: Languages, screen: 'Translator' },
  { title: 'Settings', description: 'Permissions & preferences', Icon: Settings, screen: 'Settings' },
];

export const DrawerContent = (props) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const showAlert = useAlert();
  const { version: appVersion } = useAppVersion();

  const currentRouteName = props.state?.routes?.[props.state?.index]?.name;

  const handleNav = (screen) => {
    props.navigation.navigate(screen);
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
      {/* Brand header */}
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Keyboard size={22} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Text style={styles.appTagline}>{APP_TAGLINE}</Text>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => props.navigation.closeDrawer()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={14} color={Colors.text.secondary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Navigation items */}
      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.navLabel}>NAVIGATION</Text>

        {MENU_ITEMS.map((item) => {
          const isActive = currentRouteName === item.screen;
          const iconColor = isActive ? '#FFFFFF' : Colors.text.secondary;

          return (
            <TouchableOpacity
              key={item.screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => handleNav(item.screen)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <item.Icon size={18} color={iconColor} strokeWidth={1.8} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={[styles.menuTitle, isActive && styles.menuTitleActive]}>
                  {item.title}
                </Text>
                <Text style={[styles.menuDesc, isActive && styles.menuDescActive]}>
                  {item.description}
                </Text>
              </View>
              {isActive && (
                <ChevronRight size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.divider} />

        {user && (
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.username?.[0]?.toUpperCase() ?? 'U'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userDisplayName}>{user.displayName}</Text>
              <Text style={styles.userUsername}>@{user.username}</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <LogOut size={16} color="#EF4444" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.drawer.border,
    gap: 12,
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.light,
    letterSpacing: 1.2,
    marginLeft: 8,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: Colors.primary,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  menuItemText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 1,
  },
  menuTitleActive: {
    color: '#FFFFFF',
  },
  menuDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  menuDescActive: {
    color: 'rgba(255,255,255,0.55)',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.drawer.border,
    marginBottom: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  userUsername: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
