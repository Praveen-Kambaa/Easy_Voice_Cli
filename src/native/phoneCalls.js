import { NativeModules, Platform } from 'react-native';

/** Android-only native module; null on iOS. */
export const PhoneCallsModule =
  Platform.OS === 'android' ? NativeModules.PhoneCallsModule : null;

export function isPhoneCallsSupported() {
  return Platform.OS === 'android' && PhoneCallsModule != null;
}
