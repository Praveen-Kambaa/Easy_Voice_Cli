import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { getPalette, lightPalette } from '../theme/palettes';

export const THEME_STORAGE_KEY = '@app_color_scheme';

/** User preference: system follows device, or fixed light/dark. */
export const THEME_MODES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
};

/** @typedef {'system' | 'light' | 'dark'} ThemeMode */

const ThemeContext = createContext(null);

const navigationLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightPalette.primary,
    background: lightPalette.backgroundAlt,
    card: lightPalette.surface,
    text: lightPalette.text.primary,
    border: lightPalette.border,
    notification: lightPalette.primary,
  },
};

const navigationDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#1E88FF',
    background: '#121820',
    card: '#1A222D',
    text: '#F1F5F9',
    border: '#2A3441',
    notification: '#1E88FF',
  },
};

function resolveIsDark(themeMode, systemScheme) {
  if (themeMode === 'dark') return true;
  if (themeMode === 'light') return false;
  return systemScheme === 'dark';
}

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState(/** @type {ThemeMode} */ (THEME_MODES.SYSTEM));
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === THEME_MODES.SYSTEM || stored === THEME_MODES.LIGHT || stored === THEME_MODES.DARK) {
          setThemeModeState(stored);
        } else if (stored === 'dark' || stored === 'light') {
          setThemeModeState(stored);
        }
      } catch {
        // default: system
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const isDark = resolveIsDark(themeMode, systemScheme);
  const colors = useMemo(() => getPalette(isDark), [isDark]);
  const navigationTheme = useMemo(() => (isDark ? navigationDark : navigationLight), [isDark]);

  const setThemeMode = useCallback(async (mode) => {
    const next =
      mode === THEME_MODES.DARK
        ? THEME_MODES.DARK
        : mode === THEME_MODES.LIGHT
          ? THEME_MODES.LIGHT
          : THEME_MODES.SYSTEM;
    setThemeModeState(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore persistence errors
    }
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      colorScheme: themeMode,
      isDark,
      colors,
      navigationTheme,
      isReady,
      setThemeMode,
      setColorScheme: setThemeMode,
    }),
    [themeMode, isDark, colors, navigationTheme, isReady, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function useThemeOptional() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      themeMode: THEME_MODES.SYSTEM,
      colorScheme: THEME_MODES.SYSTEM,
      isDark: false,
      colors: lightPalette,
      navigationTheme: navigationLight,
      isReady: true,
      setThemeMode: async () => {},
      setColorScheme: async () => {},
    };
  }
  return ctx;
}
