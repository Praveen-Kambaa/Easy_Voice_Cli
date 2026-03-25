import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme/Colors';

export const AppCard = ({ children, style, noPadding = false }) => (
  <View style={[styles.card, noPadding && styles.noPadding, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  noPadding: {
    padding: 0,
    overflow: 'hidden',
  },
});
