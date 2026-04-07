import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhoneCallsModule } from '../native/phoneCalls';

const ASYNC_KEY = '@call_recording_service_enabled';

/**
 * Restarts the Android call-recording foreground service when the user opted in.
 * Call logs come from the OS even when this service is dead; recordings do not.
 */
export async function ensureCallRecordingServiceIfEnabled() {
  if (Platform.OS !== 'android' || !PhoneCallsModule?.startCallRecordingService) {
    return;
  }
  try {
    const v = await AsyncStorage.getItem(ASYNC_KEY);
    if (v !== '1') {
      return;
    }
    await PhoneCallsModule.startCallRecordingService();
  } catch {
    // E_PERM before phone/mic granted, or FGS restrictions — safe to ignore
  }
}

/** Run on cold start and every time the app returns to foreground. */
export function subscribeCallRecordingServiceOnAppActive() {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  const run = () => {
    ensureCallRecordingServiceIfEnabled();
  };
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      run();
    }
  });
  run();
  return () => sub.remove();
}
