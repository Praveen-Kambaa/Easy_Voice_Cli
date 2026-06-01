import logger from '../utils/logger';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
  TriggerType,
} from '@notifee/react-native';
import { FileSystem, Dirs } from 'react-native-file-access';

const STORAGE_KEY = '@voice_reminders_v1';
/** New channel id so alarm-style settings apply (Android channels are immutable after creation). */
const CHANNEL_ID = 'voice_reminder_alarms_v2';
const DISMISS_ACTION_ID = 'voice_reminder_dismiss';

let foregroundEventUnsub = null;

/** @typedef {{ id: string; filePath: string; scheduledAt: string; createdAt: string; transcript?: string }} VoiceReminder */

function ensureNotifId(reminderId) {
  return `vr_${reminderId}`;
}

function absPath(filePath) {
  if (typeof filePath !== 'string') return '';
  return filePath.startsWith('file://') ? filePath.replace(/^file:\/\//, '') : filePath;
}

async function ensureReminderDir() {
  const dir = `${Dirs.DocumentDir}/voice_reminders`;
  const exists = await FileSystem.exists(dir);
  if (!exists) {
    await FileSystem.mkdir(dir);
  }
  return dir;
}

async function createAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Voice alarms',
    description: 'Rings like an alarm until you open or dismiss the reminder.',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [50, 700, 300, 700, 300, 700, 300, 1200],
    lights: true,
    visibility: AndroidVisibility.PUBLIC,
    /** Break through Do Not Disturb when the user allows it for this channel (API 29+). */
    bypassDnd: true,
  });
}

async function scheduleTrigger(reminder) {
  const fireMs = new Date(reminder.scheduledAt).getTime();
  if (Number.isNaN(fireMs) || fireMs <= Date.now()) {
    return;
  }

  const id = ensureNotifId(reminder.id);
  const whenLabel = new Date(reminder.scheduledAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const t = typeof reminder.transcript === 'string' ? reminder.transcript.trim() : '';
  const msg = t
    ? `${t.slice(0, 200)}${t.length > 200 ? '…' : ''} — ${whenLabel}`
    : `Reminder at ${whenLabel}. Tap to open.`;

  const payload = {
    id,
    title: 'Voice alarm',
    body: msg,
    data: { reminderId: reminder.id, type: 'voice_reminder' },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      /** Repeat alert tone until the notification is dismissed (Notification.FLAG_INSISTENT). */
      loopSound: true,
      lightUpScreen: true,
      ongoing: true,
      autoCancel: false,
      sound: 'default',
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        {
          title: 'Dismiss',
          pressAction: { id: DISMISS_ACTION_ID, launchActivity: 'default' },
        },
      ],
      /**
       * On lock screen / when idle, bring the app forward like a clock alarm (requires USE_FULL_SCREEN_INTENT).
       * Behavior varies by OEM and battery settings.
       */
      fullScreenAction: {
        id: 'voice_alarm_fullscreen',
        launchActivity: 'default',
      },
    },
    ios: {
      sound: 'default',
      /** Stronger delivery on iOS 15+ when allowed by the system (not full critical alert). */
      interruptionLevel: 'timeSensitive',
    },
  };

  const trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: fireMs,
  };

  await notifee.createTriggerNotification(payload, trigger);
}

/**
 * One-time app startup: channel, optional POST_NOTIFICATIONS, reschedule stored future reminders.
 */
export async function initVoiceReminderNotifications() {
  if (Platform.OS === 'web') {
    return;
  }
  await createAndroidChannel();

  if (!foregroundEventUnsub) {
    foregroundEventUnsub = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const pressId = detail?.pressAction?.id;
        const notifId = detail?.notification?.id;
        if (pressId === DISMISS_ACTION_ID && notifId) {
          try {
            await notifee.cancelNotification(notifId);
          } catch {
            // ignore
          }
        }
      }
    });
  }

  const settings = await notifee.getNotificationSettings();
  if (
    settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
    settings.authorizationStatus !== AuthorizationStatus.PROVISIONAL
  ) {
    await notifee.requestPermission();
  }

  const list = await loadReminders();
  const now = Date.now();
  for (const r of list) {
    if (new Date(r.scheduledAt).getTime() > now) {
      try {
        await notifee.cancelTriggerNotification(ensureNotifId(r.id));
      } catch {
        // ignore
      }
      try {
        await scheduleTrigger(r);
      } catch (e) {
        logger.warn('[voiceReminder] reschedule', r.id, e?.message || e);
      }
    }
  }
}

/**
 * @returns {Promise<VoiceReminder[]>}
 */
export async function loadReminders() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.warn('[voiceReminder] loadReminders', e);
    return [];
  }
}

async function writeReminders(list) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * @param {string} sourcePath
 * @param {Date} scheduledAt
 * @param {{ transcript?: string }} [options]
 */
export async function addVoiceReminder(sourcePath, scheduledAt, options = {}) {
  const { transcript: transcriptIn } = options;
  const fireMs = scheduledAt.getTime();
  if (Number.isNaN(fireMs) || fireMs <= Date.now()) {
    return { success: false, error: 'Pick a time in the future.' };
  }

  const id = `vr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const dir = await ensureReminderDir();
  const ext = (() => {
    const s = absPath(sourcePath);
    const m = /\.(m4a|aac|mp3|wav)$/i.exec(s);
    return m ? m[0] : '.m4a';
  })();
  const targetPath = `${dir}/${id}${ext}`;

  try {
    const src = absPath(sourcePath);
    await FileSystem.cp(src, targetPath);
  } catch (e) {
    logger.warn('[voiceReminder] copy', e);
    return { success: false, error: e?.message || 'Could not save the recording.' };
  }

  const reminder = {
    id,
    filePath: targetPath,
    scheduledAt: new Date(fireMs).toISOString(),
    createdAt: new Date().toISOString(),
    transcript:
      typeof transcriptIn === 'string' && transcriptIn.trim() ? transcriptIn.trim().slice(0, 2000) : undefined,
  };

  const list = await loadReminders();
  list.push(reminder);
  await writeReminders(list);

  try {
    await scheduleTrigger(reminder);
  } catch (e) {
    logger.warn('[voiceReminder] schedule', e);
    return { success: false, error: e?.message || 'Could not schedule the notification. Check notification permission.' };
  }

  return { success: true, reminder };
}

export async function removeVoiceReminder(id) {
  const list = await loadReminders();
  const rem = list.find((r) => r.id === id);
  if (!rem) {
    return { success: false };
  }

  const next = list.filter((r) => r.id !== id);
  await writeReminders(next);

  try {
    await notifee.cancelTriggerNotification(ensureNotifId(id));
  } catch {
    // may not exist
  }
  try {
    await notifee.cancelNotification(ensureNotifId(id));
  } catch {
    // ignore
  }

  if (rem.filePath) {
    const p = absPath(rem.filePath);
    const exists = await FileSystem.exists(p);
    if (exists) {
      await FileSystem.unlink(p).catch(() => {});
    }
  }

  return { success: true };
}

export { CHANNEL_ID as VOICE_REMINDER_CHANNEL_ID, ensureNotifId };
export { DISMISS_ACTION_ID as VOICE_REMINDER_DISMISS_ACTION_ID };
