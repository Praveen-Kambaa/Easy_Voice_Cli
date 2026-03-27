import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Menu, ChevronLeft } from 'lucide-react-native';
import { Colors } from '../../theme/Colors';

export const AppHeader = ({
  title,
  showMenuButton = true,
  rightComponent,
  /** Dark bar for Translator and similar screens */
  dark = false,
  /** When set, shows back instead of the menu button */
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const barBg = dark ? '#0f1419' : Colors.surface;
  const barBorder = dark ? 'rgba(255,255,255,0.08)' : Colors.border;
  const titleColor = dark ? '#f1f5f9' : Colors.text.primary;
  const iconColor = dark ? '#e2e8f0' : Colors.text.primary;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: barBg, borderBottomColor: barBorder }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={24} color={iconColor} strokeWidth={2} />
          </TouchableOpacity>
        ) : showMenuButton ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Menu size={22} color={iconColor} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.menuPlaceholder} />
        )}

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
