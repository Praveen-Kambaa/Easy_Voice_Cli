import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Menu } from 'lucide-react-native';
import { Colors } from '../../theme/Colors';

export const AppHeader = ({
  title,
  showMenuButton = true,
  rightComponent,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        {showMenuButton ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Menu size={22} color={Colors.text.primary} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.menuPlaceholder} />
        )}

        <Text style={styles.title} numberOfLines={1}>
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
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    color: Colors.text.primary,
    letterSpacing: -0.3,
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
