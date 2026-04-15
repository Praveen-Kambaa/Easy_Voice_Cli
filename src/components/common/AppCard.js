import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../theme/Colors';

export const AppCard = ({ children, style, noPadding = false }) => (
  <View style={[styles.card, noPadding && styles.noPadding, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    ...Platform.select({
      android: { elevation: 3 },
    }),
  },
  noPadding: {
    padding: 0,
    overflow: 'hidden',
  },
});
