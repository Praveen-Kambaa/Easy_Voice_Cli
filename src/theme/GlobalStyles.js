import { StyleSheet } from 'react-native';
import { Colors } from './Colors';

export const GlobalStyles = StyleSheet.create({
  flex1: { flex: 1 },

  screenContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },

  primaryButtonText: {
    color: Colors.text.white,
    fontSize: 14,
    fontWeight: '600',
  },

  outlineButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },

  outlineButtonText: {
    color: Colors.primary,
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
    color: Colors.text.primary,
    marginBottom: 12,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
});
