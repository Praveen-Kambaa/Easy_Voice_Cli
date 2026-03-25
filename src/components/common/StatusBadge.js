import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/Colors';

const STATUS_MAP = {
  granted: { bg: Colors.status.grantedBg, color: Colors.status.granted },
  denied: { bg: Colors.status.deniedBg, color: Colors.status.denied },
  blocked: { bg: Colors.status.blockedBg, color: Colors.status.blocked },
  limited: { bg: Colors.status.infoBg, color: Colors.status.info },
  unavailable: { bg: Colors.status.unavailableBg, color: Colors.status.unavailable },
  active: { bg: Colors.status.grantedBg, color: Colors.status.granted },
  inactive: { bg: Colors.status.unavailableBg, color: Colors.status.unavailable },
};

export const StatusBadge = ({ status, label }) => {
  const key = status?.toLowerCase();
  const config = STATUS_MAP[key] || STATUS_MAP.unavailable;

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
