/** @typedef {typeof lightPalette} AppColors */

export const lightPalette = {
  primary: '#1E88FF',
  primaryLight: '#60A5FA',

  background: '#FFFFFF',
  backgroundAlt: '#F9FAFB',
  surface: '#FFFFFF',

  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
    white: '#FFFFFF',
    hint: '#7F8C8D',
  },

  border: '#E5E7EB',
  borderLight: '#EEF2F7',

  status: {
    granted: '#4CAF50',
    grantedBg: '#E8F5E8',
    denied: '#FF9800',
    deniedBg: '#FFF3E0',
    blocked: '#F44336',
    blockedBg: '#FFEBEE',
    info: '#2196F3',
    infoBg: '#E3F2FD',
    unavailable: '#9E9E9E',
    unavailableBg: '#F5F5F5',
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
    background: '#F9FAFB',
    border: '#E5E7EB',
    itemBg: '#FFFFFF',
    active: '#111827',
    inactive: '#4B5563',
  },

  tabBar: {
    background: '#FFFFFF',
    border: '#E5E7EB',
  },

  header: {
    background: '#FFFFFF',
    border: '#E5E7EB',
    title: '#111827',
    icon: '#111827',
  },

  switch: {
    trackOff: '#E5E7EB',
    trackOn: '#1E88FF88',
    thumbOff: '#9CA3AF',
    thumbOn: '#1E88FF',
  },
};

export const darkPalette = {
  primary: '#1E88FF',
  primaryLight: '#60A5FA',

  background: '#0B0F14',
  backgroundAlt: '#121820',
  surface: '#1A222D',

  text: {
    primary: '#F1F5F9',
    secondary: '#94A3B8',
    light: '#64748B',
    white: '#FFFFFF',
    hint: '#94A3B8',
  },

  border: '#2A3441',
  borderLight: '#1F2937',

  status: {
    granted: '#4ADE80',
    grantedBg: '#14532D',
    denied: '#FBBF24',
    deniedBg: '#422006',
    blocked: '#F87171',
    blockedBg: '#450A0A',
    info: '#60A5FA',
    infoBg: '#1E3A5F',
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
    background: '#121820',
    border: '#2A3441',
    itemBg: '#1A222D',
    active: '#1E88FF',
    inactive: '#94A3B8',
  },

  tabBar: {
    background: '#121820',
    border: '#2A3441',
  },

  header: {
    background: '#1A222D',
    border: '#2A3441',
    title: '#F1F5F9',
    icon: '#E2E8F0',
  },

  switch: {
    trackOff: '#2A3441',
    trackOn: '#1E88FF88',
    thumbOff: '#64748B',
    thumbOn: '#1E88FF',
  },
};

export function getPalette(isDark) {
  return isDark ? darkPalette : lightPalette;
}
