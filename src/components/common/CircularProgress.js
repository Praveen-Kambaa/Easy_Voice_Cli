import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/Colors';

export const CircularProgress = ({
  percentage = 0,
  size = 80,
  strokeWidth = 5,
  label,
}) => {
  return (
    <View style={[styles.wrapper, { width: size + 24, alignItems: 'center' }]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
          },
        ]}
      >
        <Text style={styles.percentage}>{percentage}%</Text>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  circle: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  label: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});
