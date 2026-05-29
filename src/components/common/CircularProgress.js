import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export const CircularProgress = ({
  percentage = 0,
  size = 80,
  strokeWidth = 5,
  label,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

function createStyles(colors) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
    },
    circle: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentage: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
    label: {
      marginTop: 6,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
  });
}
