/** @typedef {typeof lightPalette} AppColors */

export const lightPalette = {
  primary: '#1E88FF',
  primaryLight: '#60A5FA',
  primaryDark: '#1565C0',
  primaryMuted: 'rgba(30, 136, 255, 0.10)',

  background: '#F8FAFC',
  backgroundAlt: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: {
    primary: '#0F172A',
    secondary: '#64748B',
    light: '#94A3B8',
    white: '#FFFFFF',
    hint: '#7F8C8D',
    accent: '#1E88FF',
  },

  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  status: {
    granted: '#16A34A',
    grantedBg: '#EAF8EE',
    denied: '#F59E0B',
    deniedBg: '#FFFBEB',
    blocked: '#EF4444',
    blockedBg: '#FEF2F2',
    info: '#2563EB',
    infoBg: '#EFF6FF',
    unavailable: '#94A3B8',
    unavailableBg: '#F1F5F9',
  },

  recording: {
    active: '#EF4444',
    activeBg: '#FEF2F2',
    play: '#10B981',
    pause: '#F59E0B',
  },

  warning: {
    bg: '#FFF3CD',
    border: '#FFC107',
    text: '#856404',
  },

  drawer: {
    background: '#FFFFFF',
    border: '#E2E8F0',
    card: '#FFFFFF',
    itemBg: '#FFFFFF',
    active: '#1E88FF',
    activeBg: '#EBF4FE',
    inactive: '#64748B',
  },

  tabBar: {
    background: '#FFFFFF',
    border: '#E2E8F0',
    active: '#1E88FF',
    inactive: '#64748B',
    activeIndicator: '#E0EEFE',
  },

  header: {
    background: '#FFFFFF',
    border: '#E2E8F0',
    title: '#0F172A',
    icon: '#0F172A',
  },

  badge: {
    engineBg: '#EAF8EE',
    engineText: '#16A34A',
    latencyBg: '#EFF6FF',
    latencyText: '#2563EB',
    proBg: '#EFF6FF',
    proText: '#2563EB',
    transcribedBg: '#DCFCE7',
    transcribedText: '#16A34A',
    exportedBg: '#F1F5F9',
    exportedText: '#64748B',
  },

  switch: {
    trackOff: '#E2E8F0',
    trackOn: '#1E88FF88',
    thumbOff: '#94A3B8',
    thumbOn: '#1E88FF',
  },
};

export const darkPalette = {
  primary: '#00E592',
  primaryLight: '#5CF1B8',
  primaryDark: '#00B370',
  primaryMuted: 'rgba(0, 229, 146, 0.22)',

  background: '#0D1117',
  backgroundAlt: '#131922',
  surface: '#182230',
  surfaceElevated: '#1F2D3D',
  card: '#182230',

  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    light: '#64748B',
    white: '#FFFFFF',
    hint: '#94A3B8',
    accent: '#34EEA7',
  },

  border: '#263242',
  borderLight: '#1E2938',

  status: {
    granted: '#4ADE80',
    grantedBg: '#14532D',
    denied: '#FBBF24',
    deniedBg: '#422006',
    blocked: '#F87171',
    blockedBg: '#450A0A',
    info: '#34EEA7',
    infoBg: '#063321',
    unavailable: '#94A3B8',
    unavailableBg: '#1E293B',
  },

  recording: {
    active: '#F87171',
    activeBg: '#450A0A',
    play: '#34D399',
    pause: '#FBBF24',
  },

  warning: {
    bg: '#422006',
    border: '#F59E0B',
    text: '#FDE68A',
  },

  drawer: {
    background: '#131922',
    border: '#263242',
    card: '#182230',
    itemBg: '#182230',
    active: '#00E592',
    activeBg: 'rgba(0, 229, 146, 0.18)',
    inactive: '#94A3B8',
  },

  tabBar: {
    background: '#131922',
    border: '#263242',
    active: '#00E592',
    inactive: '#94A3B8',
    activeIndicator: 'rgba(0, 229, 146, 0.22)',
  },

  header: {
    background: '#182230',
    border: '#263242',
    title: '#F8FAFC',
    icon: '#E2E8F0',
  },

  badge: {
    engineBg: '#113824',
    engineText: '#4ADE80',
    latencyBg: '#0B3D2B',
    latencyText: '#34EEA7',
    proBg: '#0B3D2B',
    proText: '#34EEA7',
    transcribedBg: '#14532D',
    transcribedText: '#4ADE80',
    exportedBg: '#1E293B',
    exportedText: '#94A3B8',
  },

  switch: {
    trackOff: '#263242',
    trackOn: '#00E59288',
    thumbOff: '#64748B',
    thumbOn: '#00E592',
  },
};

export function getPalette(isDark) {
  return isDark ? darkPalette : lightPalette;
}
