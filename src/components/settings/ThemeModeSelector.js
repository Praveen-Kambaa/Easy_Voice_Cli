import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Moon, Smartphone, Sun } from 'lucide-react-native';
import { useTheme, THEME_MODES } from '../../context/ThemeContext';

const OPTIONS = [
  {
    mode: THEME_MODES.SYSTEM,
    title: 'System default',
    description: 'Match your device light or dark setting',
    Icon: Smartphone,
  },
  {
    mode: THEME_MODES.LIGHT,
    title: 'Light',
    description: 'Always use light theme',
    Icon: Sun,
  },
  {
    mode: THEME_MODES.DARK,
    title: 'Dark',
    description: 'Always use dark theme',
    Icon: Moon,
  },
];

export function ThemeModeSelector() {
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      {OPTIONS.map((opt, index) => {
        const selected = themeMode === opt.mode;
        const isLast = index === OPTIONS.length - 1;
        return (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.row, !isLast && styles.rowBorder]}
            onPress={() => setThemeMode(opt.mode)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
              <opt.Icon size={20} color={selected ? colors.primary : colors.text.secondary} strokeWidth={2} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.title, selected && styles.titleSelected]}>{opt.title}</Text>
              <Text style={styles.sub}>{opt.description}</Text>
            </View>
            {selected ? (
              <Check size={20} color={colors.primary} strokeWidth={2.5} />
            ) : (
              <View style={styles.checkPlaceholder} />
            )}
          </TouchableOpacity>
        );
      })}
      <Text style={styles.footerHint}>
        {themeMode === THEME_MODES.SYSTEM
          ? `Currently following system (${isDark ? 'dark' : 'light'})`
          : themeMode === THEME_MODES.DARK
            ? 'Dark theme is active'
            : 'Light theme is active'}
      </Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      gap: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      gap: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapSelected: {
      backgroundColor: 'rgba(30, 136, 255, 0.12)',
      borderColor: 'rgba(30, 136, 255, 0.35)',
    },
    textCol: {
      flex: 1,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    titleSelected: {
      color: colors.primary,
    },
    sub: {
      marginTop: 2,
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 17,
    },
    checkPlaceholder: {
      width: 20,
      height: 20,
    },
    footerHint: {
      marginTop: 12,
      fontSize: 12,
      color: colors.text.light,
      lineHeight: 17,
    },
  });
}
