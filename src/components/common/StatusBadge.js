import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export const StatusBadge = ({ status, label }) => {
  const { colors } = useTheme();
  const statusMap = useMemo(
    () => ({
      granted: { bg: colors.status.grantedBg, color: colors.status.granted },
      denied: { bg: colors.status.deniedBg, color: colors.status.denied },
      blocked: { bg: colors.status.blockedBg, color: colors.status.blocked },
      limited: { bg: colors.status.infoBg, color: colors.status.info },
      unavailable: { bg: colors.status.unavailableBg, color: colors.status.unavailable },
      active: { bg: colors.status.grantedBg, color: colors.status.granted },
      inactive: { bg: colors.status.unavailableBg, color: colors.status.unavailable },
    }),
    [colors],
  );

  const key = status?.toLowerCase();
  const config = statusMap[key] || statusMap.unavailable;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.color }]}>
        {label || (status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unknown')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
