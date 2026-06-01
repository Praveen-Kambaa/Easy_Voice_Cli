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
        const pending = await KeyboardModule?.peekPendingDeepLink?.();
        if (!pending || typeof pending !== 'string') return;

        // Never consume voice links in JS — native layer starts recording from App Group state.
        if (pending.startsWith('keyboard-voice')) {
          await KeyboardModule?.forwardPendingKeyboardLink?.();
          return;
        }
        const consumed = await KeyboardModule?.consumePendingDeepLink?.();
        if (consumed === 'keyboard-settings') {
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
