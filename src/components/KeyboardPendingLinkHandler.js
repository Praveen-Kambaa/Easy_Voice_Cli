import { useEffect } from 'react';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import { useNavigationContainerRef } from '@react-navigation/native';

const { KeyboardModule } = NativeModules;

/**
 * When the keyboard cannot call extensionContext.open(typeeasy://…), it stores a pending
 * action in the app group. This opens the matching screen when the user switches to Type Easy.
 */
export function KeyboardPendingLinkHandler({ navigationRef }) {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !navigationRef) return undefined;

    const run = async () => {
      try {
        const pending = await KeyboardModule?.consumePendingDeepLink?.();
        if (!pending || typeof pending !== 'string') return;

        if (pending.startsWith('keyboard-voice')) {
          await Linking.openURL(`typeeasy://${pending}`);
          return;
        }
        if (pending === 'keyboard-settings') {
          navigationRef.navigate('Main', { screen: 'Settings' });
        }
      } catch {
        // ignore
      }
    };

    const onActive = () => {
      run();
    };

    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onActive();
    });
    return () => sub.remove();
  }, [navigationRef]);

  return null;
}

export function useAppNavigationRef() {
  return useNavigationContainerRef();
}
