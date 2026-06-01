import React, { useMemo } from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, Keyboard } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export const PrimaryButton = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  variant = 'primary',
  dismissKeyboardOnPress = false,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = (event) => {
    if (disabled || loading) return;
    if (dismissKeyboardOnPress) {
      Keyboard.dismiss();
    }
    onPress?.(event);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      android_ripple={
        variant === 'primary' || variant === 'danger'
          ? { color: 'rgba(255,255,255,0.2)' }
          : { color: 'rgba(0,0,0,0.08)' }
      }
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.primary}
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
    </Pressable>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    base: {
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    primary: {
      backgroundColor: colors.primary,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    ghost: {
      backgroundColor: colors.backgroundAlt,
    },
    danger: {
      backgroundColor: colors.status.blocked,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.88,
    },
    text: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    outlineText: {
      color: colors.primary,
    },
    ghostText: {
      color: colors.text.primary,
    },
  });
