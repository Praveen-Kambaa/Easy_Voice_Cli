import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../../theme/Colors';

export const PrimaryButton = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  variant = 'primary',
}) => (
  <TouchableOpacity
    style={[
      styles.base,
      variant === 'primary' && styles.primary,
      variant === 'outline' && styles.outline,
      variant === 'ghost' && styles.ghost,
      variant === 'danger' && styles.danger,
      (disabled || loading) && styles.disabled,
      style,
    ]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.8}
  >
    {loading ? (
      <ActivityIndicator
        size="small"
        color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : Colors.primary}
      />
    ) : (
      <Text
        style={[
          styles.text,
          variant === 'outline' && styles.outlineText,
          variant === 'ghost' && styles.ghostText,
          textStyle,
        ]}
      >
        {title}
      </Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghost: {
    backgroundColor: '#F3F4F6',
  },
  danger: {
    backgroundColor: Colors.status.blocked,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  outlineText: {
    color: Colors.primary,
  },
  ghostText: {
    color: Colors.text.primary,
  },
});
