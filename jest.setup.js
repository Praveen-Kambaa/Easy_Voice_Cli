/* eslint-env jest */
import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-worklets', () => ({
  createSerializable: (x) => x,
  isWorklet: () => false,
  isWorkletFunction: () => false,
  makeShareable: (x) => x,
  makeShareableCloneRecursive: (x) => x,
  isShareable: () => false,
  scheduleOnUI: (fn) => fn,
  serializableMappingCache: new Map(),
  RuntimeKind: {},
}));
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);

jest.mock('react-native-permissions', () =>
  require('react-native-permissions/mock')
);

jest.mock('react-native-file-access', () => ({
  FileSystem: {
    exists: jest.fn().mockResolvedValue(true),
    stat: jest.fn().mockResolvedValue({ size: 1024 }),
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(true),
    unlink: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(true),
  },
  Dirs: {
    DocumentDir: '/mock/documents',
    CacheDir: '/mock/cache',
  },
}));

jest.mock('@notifee/react-native', () => ({
  createChannel: jest.fn().mockResolvedValue('default'),
  displayNotification: jest.fn().mockResolvedValue('notification-id'),
  onForegroundEvent: jest.fn().mockReturnValue(() => {}),
  onBackgroundEvent: jest.fn().mockReturnValue(() => {}),
  createTriggerNotification: jest.fn().mockResolvedValue('trigger-id'),
  cancelNotification: jest.fn().mockResolvedValue(undefined),
  cancelTriggerNotification: jest.fn().mockResolvedValue(undefined),
  getTriggerNotificationIds: jest.fn().mockResolvedValue([]),
  getNotificationSettings: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
  requestPermission: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidVisibility: { PUBLIC: 1, PRIVATE: 0 },
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0, NOT_DETERMINED: -1 },
  EventType: {},
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('react-native-tts', () => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  speak: jest.fn(),
  stop: jest.fn(),
  setDefaultLanguage: jest.fn().mockResolvedValue(true),
  setDefaultRate: jest.fn().mockResolvedValue(true),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ data: { idToken: 'test-token' } }),
    signOut: jest.fn().mockResolvedValue(undefined),
    isSignedIn: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock(
  '@react-native-ml-kit/translate-text',
  () => ({
    translate: jest.fn().mockResolvedValue('translated text'),
    identifyLanguage: jest.fn().mockResolvedValue('en'),
    TranslateLanguage: {
      ENGLISH: 'en',
      SPANISH: 'es',
      FRENCH: 'fr',
      GERMAN: 'de',
      HINDI: 'hi',
      TAMIL: 'ta',
    },
  }),
  { virtual: true }
);

jest.mock(
  'whisper.rn',
  () => ({
    initWhisper: jest.fn().mockResolvedValue({
      transcribe: jest.fn().mockResolvedValue({ result: 'transcribed text' }),
    }),
  }),
  { virtual: true }
);

const { NativeModules } = require('react-native');
NativeModules.PhoneCallsModule = {
  isCallRecordingServiceRunning: jest.fn().mockResolvedValue(false),
  startCallRecordingService: jest.fn().mockResolvedValue(true),
  stopCallRecordingService: jest.fn().mockResolvedValue(true),
  getCallRecordings: jest.fn().mockResolvedValue([]),
  getCallLogs: jest.fn().mockResolvedValue([]),
};

NativeModules.KeyboardModule = {
  isKeyboardEnabled: jest.fn().mockResolvedValue(true),
  isKeyboardSelected: jest.fn().mockResolvedValue(true),
  openKeyboardSettings: jest.fn(),
  showKeyboardPicker: jest.fn(),
};

NativeModules.FloatingMicModule = {
  checkPermissions: jest.fn().mockResolvedValue({
    overlay: true,
    recordAudio: true,
    accessibility: true,
    allGranted: true,
  }),
  checkOverlayPermission: jest.fn().mockResolvedValue(true),
  checkAccessibilityPermission: jest.fn().mockResolvedValue(true),
  openOverlaySettings: jest.fn(),
  openAccessibilitySettings: jest.fn(),
  syncSettings: jest.fn(),
};

NativeModules.AudioPickerModule = {
  pickAudio: jest.fn().mockResolvedValue('file:///test/audio.m4a'),
};

NativeModules.AudioTranscodeModule = {
  wavToM4a: jest.fn().mockResolvedValue('file:///test/audio.m4a'),
};

NativeModules.VoiceAssistantModule = {
  startListening: jest.fn(),
  stopListening: jest.fn(),
};

NativeModules.AndroidPermissionsModule = {
  checkOverlayPermission: jest.fn().mockResolvedValue(true),
  checkAccessibilityPermission: jest.fn().mockResolvedValue(true),
  openOverlaySettings: jest.fn(),
  openAccessibilitySettings: jest.fn(),
};
