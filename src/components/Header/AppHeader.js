import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/Colors';

export const AppHeader = ({
  title,
  showMenuButton = true,
  rightComponent,
  onPlanDetails,
  onLogout,
  showActions = false,
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
            <View style={styles.hamburgerLine} />
            <View style={[styles.hamburgerLine, { width: 14 }]} />
            <View style={styles.hamburgerLine} />
          </TouchableOpacity>
        ) : (
          <View style={styles.menuPlaceholder} />
        )}

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.rightSlot}>
          {showActions ? (
            <View style={styles.actionsRow}>
              {onPlanDetails && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.outlineBtn]}
                  onPress={onPlanDetails}
                  activeOpacity={0.8}
                >
                  <Text style={styles.outlineBtnText}>Plan Details</Text>
                </TouchableOpacity>
              )}
              {onLogout && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={onLogout}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Logout</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : rightComponent ? (
            rightComponent
          ) : (
            <View style={styles.menuPlaceholder} />
          )}
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
    alignItems: 'flex-start',
    gap: 5,
    marginRight: 12,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: Colors.text.primary,
    borderRadius: 2,
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
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
