export const APP_NAME = 'Easy Voice';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'Professional Voice Assistant';

export const SCREEN_NAMES = {
  HOME: 'Home',
  VOICE_RECORDER: 'VoiceRecorder',
  RECORDINGS: 'RecordedAudio',
  SETTINGS: 'Settings',
  FLOATING_MIC: 'FloatingMic',
};

export const USER = {
  DEFAULT_NAME: 'User',
  DEFAULT_PLAN: 'Free Plan',
};

export const RECORDING_FORMAT = 'M4A';

export const TIME_LABELS = {
  getGreeting: () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  },
};
