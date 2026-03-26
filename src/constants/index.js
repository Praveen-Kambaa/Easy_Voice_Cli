export const APP_NAME = 'Type Easy';
/** Used when native BuildConfig is unavailable (e.g. iOS). Keep aligned with android/app/build.gradle versionName. */
export const APP_VERSION_FALLBACK = '1.0';
export const APP_TAGLINE = 'Professional Voice Assistant';

export const SCREEN_NAMES = {
  HOME: 'Home',
  VOICE_RECORDER: 'VoiceRecorder',
  RECORDINGS: 'RecordedAudio',
  FLOATING_MIC_HISTORY: 'FloatingMicHistory',
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
