import { StyleSheet } from 'react-native';

/** Shared login/register style definitions (plain objects for StyleSheet.create). */
export function getAuthStyleDefs(colors, isDark) {
  const inputBg = isDark ? colors.background : colors.backgroundAlt;

  return {
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingVertical: 28,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 24,
      elevation: 6,
    },
    logoWrap: {
      alignSelf: 'stretch',
      marginHorizontal: -22,
      marginTop: -22,
      marginBottom: 20,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      overflow: 'hidden',
    },
    inputGroup: {
      marginBottom: 14,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: inputBg,
      paddingHorizontal: 12,
      minHeight: 50,
    },
    inputIcon: {
      marginRight: 8,
    },
    inputError: {
      borderColor: colors.status.blocked,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
      paddingVertical: 12,
    },
    inputFlex: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
      paddingVertical: 12,
    },
    eyeBtn: {
      paddingLeft: 8,
    },
    errorBox: {
      backgroundColor: colors.status.blockedBg,
      borderWidth: 1,
      borderColor: colors.status.blocked,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    errorText: {
      fontSize: 13,
      color: colors.status.blocked,
      fontWeight: '500',
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    primaryBtnDisabled: {
      opacity: 0.65,
    },
    primaryBtnText: {
      color: colors.text.white,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    linkBtn: {
      alignSelf: 'center',
      marginTop: 16,
    },
    linkText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    dividerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 22,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: 12,
      fontSize: 11,
      color: colors.text.light,
      fontWeight: '500',
    },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      height: 52,
      paddingHorizontal: 16,
    },
    googleIconContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#4285F4',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    googleIcon: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    googleBtnText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 22,
    },
    footerText: {
      color: colors.text.light,
      fontSize: 14,
    },
    footerLink: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
  };
}

export function getRegisterStyleDefs(colors, isDark) {
  const base = getAuthStyleDefs(colors, isDark);
  const inputBg = isDark ? colors.background : colors.backgroundAlt;

  return {
    ...base,
    headerBlock: {
      alignItems: 'center',
      marginBottom: 22,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 14,
      gap: 6,
    },
    badgeEmoji: {
      fontSize: 14,
    },
    badgeText: {
      color: colors.text.white,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
    },
    stepLabel: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.secondary,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    rowHalf: {
      flex: 1,
      marginBottom: 14,
    },
    otpInput: {
      letterSpacing: 6,
      fontSize: 20,
      fontWeight: '600',
    },
    sendOtpBtn: {
      marginTop: 6,
      backgroundColor: colors.text.primary,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.surface,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendOtpBtnText: {
      color: colors.text.white,
      fontSize: 16,
      fontWeight: '700',
    },
    verifyBtn: {
      marginTop: 6,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    verifyBtnText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    completeBtn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      borderRadius: 10,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    completeBtnText: {
      color: colors.text.white,
      fontSize: 16,
      fontWeight: '800',
    },
    btnDisabled: {
      opacity: 0.65,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
    },
    hintMuted: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    hintEmail: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginTop: 4,
    },
    changeEmail: {
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 8,
    },
    changeEmailText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
    },
    resendWrap: {
      alignItems: 'center',
      marginTop: 14,
    },
    resendText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    registeringForLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    registeringForEmail: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    errorBox: {
      ...base.errorBox,
      marginTop: 14,
      marginBottom: 0,
    },
    errorBoxTight: {
      backgroundColor: colors.status.blockedBg,
      borderWidth: 1,
      borderColor: colors.status.blocked,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    footerRow: {
      ...base.footerRow,
      marginTop: 28,
    },
    googleBtn: {
      ...base.googleBtn,
      backgroundColor: inputBg,
    },
  };
}
