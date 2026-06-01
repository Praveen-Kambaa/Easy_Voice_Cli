/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { VOICE_REMINDER_DISMISS_ACTION_ID } from './src/services/voiceReminderService';
import { initAppLogging } from './src/utils/logger';
import { initHttpClient } from './src/api/httpClient';

initAppLogging();
initHttpClient();

// @notifee/react-native ships Android native code only; importing it on iOS throws at load time.
if (Platform.OS === 'android') {
  const notifee = require('@notifee/react-native').default;
  const { EventType } = require('@notifee/react-native');

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const pressId = detail?.pressAction?.id;
      const notifId = detail?.notification?.id;
      if (pressId === VOICE_REMINDER_DISMISS_ACTION_ID && notifId) {
        try {
          await notifee.cancelNotification(notifId);
        } catch {
          // ignore
        }
      }
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
