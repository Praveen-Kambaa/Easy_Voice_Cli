import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';

export const DrawerContent = (props) => {
  const insets = useSafeAreaInsets();

  const handleCloseDrawer = () => {
    props.navigation.closeDrawer();
  };

  const menuItems = [
    {
      title: '🎙️ Voice Recorder',
      description: 'Record your voice',
      icon: 'record-voice-over',
      color: '#3B82F6',
      screen: 'VoiceRecorder',
    },
    {
      title: '🎵 My Recordings',
      description: 'View saved audio',
      icon: 'library-music',
      color: '#10B981',
      screen: 'RecordedAudio',
    },
    {
      title: '📊 Dashboard',
      description: 'App overview',
      icon: 'dashboard',
      color: '#8B5CF6',
      screen: 'Dashboard',
    },
    {
      title: '🔐 Permissions',
      description: 'Manage permissions',
      icon: 'security',
      color: '#F59E0B',
      screen: 'AndroidPermissions',
    },
    {
      title: '🎤 Floating Mic',
      description: 'Background recording',
      icon: 'mic',
      color: '#EF4444',
      screen: 'FloatingMic',
    },
  ];

  const handleMenuPress = (screen) => {
    props.navigation.navigate(screen);
    handleCloseDrawer();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🎤</Text>
        </View>
        <Text style={styles.appTitle}>Easy Voice</Text>
        <Text style={styles.appDescription}>Professional Voice Assistant</Text>
        
        <TouchableOpacity style={styles.closeButton} onPress={handleCloseDrawer}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Menu Items */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={() => handleMenuPress(item.screen)}
            activeOpacity={0.7}
          >
            <View style={styles.emojiContainer}>
              <Text style={styles.emojiText}>{item.title.split(' ')[0]}</Text>
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>{item.title.split(' ').slice(1).join(' ')}</Text>
              <Text style={styles.menuItemDescription}>{item.description}</Text>
            </View>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.footerText}>Easy Voice v1.0</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  closeIcon: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#EBF5FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  logoEmoji: {
    fontSize: 32,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  appDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  menuContainer: {
    flex: 1,
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  emojiContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 24,
  },
  chevronIcon: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: '300',
  },
});

export default DrawerContent;
