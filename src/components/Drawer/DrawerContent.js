import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/Colors';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../../constants';

const MENU_ITEMS = [
  { title: 'Home', description: 'Dashboard & overview', emoji: '🏠', screen: 'Home' },
  { title: 'Voice Recorder', description: 'Record your voice', emoji: '🎙️', screen: 'VoiceRecorder' },
  { title: 'My Recordings', description: 'View saved audio', emoji: '🎵', screen: 'RecordedAudio' },
  { title: 'Floating Mic', description: 'Background recording', emoji: '🎤', screen: 'FloatingMic' },
  { title: 'Settings', description: 'Permissions & preferences', emoji: '⚙️', screen: 'Settings' },
];

export const DrawerContent = (props) => {
  const insets = useSafeAreaInsets();

  const currentRouteName = props.state?.routes?.[props.state?.index]?.name;

  const handleNav = (screen) => {
    props.navigation.navigate(screen);
    props.navigation.closeDrawer();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Brand header */}
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🎤</Text>
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
          <Text style={styles.closeIcon}>✕</Text>
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

          return (
            <TouchableOpacity
              key={item.screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => handleNav(item.screen)}
              activeOpacity={0.7}
            >
              <View style={[styles.emojiWrap, isActive && styles.emojiWrapActive]}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>
              <View style={styles.menuItemText}>
                <Text style={[styles.menuTitle, isActive && styles.menuTitleActive]}>
                  {item.title}
                </Text>
                <Text style={styles.menuDesc}>{item.description}</Text>
              </View>
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.divider} />
        <Text style={styles.footerText}>{APP_NAME} v{APP_VERSION}</Text>
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
  logoEmoji: {
    fontSize: 22,
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
  closeIcon: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '700',
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
    color: Colors.text.secondary,
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
  emojiWrap: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emojiWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  emoji: {
    fontSize: 18,
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
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
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
