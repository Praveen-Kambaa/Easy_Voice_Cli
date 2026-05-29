import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Build StyleSheet from the active theme palette.
 * @param {(colors: import('../theme/palettes').AppColors) => object} factory
 */
export function useThemedStyles(factory) {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
