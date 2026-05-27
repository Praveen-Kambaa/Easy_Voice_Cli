/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppRegistry } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { VOICE_REMINDER_DISMISS_ACTION_ID } from './src/services/voiceReminderService';

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

AppRegistry.registerComponent(appName, () => App);
