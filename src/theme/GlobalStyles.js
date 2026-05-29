import { StyleSheet } from 'react-native';
import { lightPalette } from './palettes';

/** @deprecated Use useTheme().colors with createGlobalStyles(colors) or screen-local createStyles. */
export const GlobalStyles = StyleSheet.create(createGlobalStyleDefs(lightPalette));

export function createGlobalStyles(colors) {
  return StyleSheet.create(createGlobalStyleDefs(colors));
}

function createGlobalStyleDefs(colors) {
  return {
    flex1: { flex: 1 },

    screenContainer: {
      flex: 1,
      backgroundColor: colors.backgroundAlt,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },

    shadow: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },

    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },

    primaryButtonText: {
      color: colors.text.white,
      fontSize: 14,
      fontWeight: '600',
    },

    outlineButton: {
      backgroundColor: 'transparent',
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },

    outlineButtonText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },

    sectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
    },

    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 16,
    },
  };
}
