import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Platform,
  NativeEventEmitter,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Colors } from '../../theme/Colors';
import { PhoneCallsModule, isPhoneCallsSupported } from '../../native/phoneCalls';
import { formatDateTime } from '../../utils/dateTimeFormat';
import NativeAudioService from '../../services/NativeAudioService';
import { uploadCallRecording } from '../../services/callRecordingsApi';
import { syncCallLogsToBackend } from '../../services/callLogsApi';
import {
  getSyncedCallLogIdSet,
  markCallLogIdsSynced,
} from '../../services/callLogsSyncState';
import { isPathUploaded, markPathUploaded } from '../../services/callUploadState';
import { useAlert } from '../../context/AlertContext';
import {
  check,
  checkMultiple,
  request,
  requestMultiple,
  RESULTS,
  PERMISSIONS,
} from 'react-native-permissions';
import { getAndroidFeaturePermissionList } from '../../utils/androidRuntimePermissions';

const TAB_LOG = 'log';
const TAB_RECORDINGS = 'recordings';
const PREFS_RECORDING = '@call_recording_service_enabled';

async function ensureCallRecordingPermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }
  let mic = await check(PERMISSIONS.ANDROID.RECORD_AUDIO);
  let phone = await check(PERMISSIONS.ANDROID.READ_PHONE_STATE);
  if (mic !== RESULTS.GRANTED && mic !== RESULTS.LIMITED) {
    mic = await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
  }
  if (phone !== RESULTS.GRANTED && phone !== RESULTS.LIMITED) {
    phone = await request(PERMISSIONS.ANDROID.READ_PHONE_STATE);
  }
  const micOk = mic === RESULTS.GRANTED || mic === RESULTS.LIMITED;
  const phoneOk = phone === RESULTS.GRANTED || phone === RESULTS.LIMITED;
  return micOk && phoneOk;
}

function formatDurationSec(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
}

function formatDurationMs(ms) {
  return formatDurationSec(Math.floor((Number(ms) || 0) / 1000));
}

/** Prefer exported public copy (content:// or /Download/...) for playback — matches what Files app plays. */
function playbackSource(item) {
  const pub = item?.publicLocation;
  if (pub && String(pub).trim().length > 0) {
    return String(pub).trim();
  }
  return item?.audioPath || '';
}

function playbackKey(item) {
  return playbackSource(item) || item?.fileName || '';
}

function callTypeIcon(type) {
  switch (type) {
    case 'incoming':
      return PhoneIncoming;
    case 'outgoing':
      return PhoneOutgoing;
    case 'missed':
      return PhoneMissed;
    default:
      return Phone;
  }
}

function callTypeLabel(type) {
  switch (type) {
    case 'incoming':
      return 'Incoming';
    case 'outgoing':
      return 'Outgoing';
    case 'missed':
      return 'Missed';
    default:
      return type || 'Unknown';
  }
}

export default function CallLogsScreen() {
  const showAlert = useAlert();
  const featurePermsOnce = useRef(false);
  const [tab, setTab] = useState(TAB_LOG);
  const [callLogs, setCallLogs] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [uploadingPath, setUploadingPath] = useState(null);
  const [uploadedMap, setUploadedMap] = useState({});
  const [logSyncedMap, setLogSyncedMap] = useState({});
  const [syncingCallLogs, setSyncingCallLogs] = useState(false);
  const [playingPath, setPlayingPath] = useState(null);
  const [speakerBoostEnabled, setSpeakerBoostEnabled] = useState(false);

  const loadPrefs = useCallback(async () => {
    try {
      const v = await AsyncStorage.getItem(PREFS_RECORDING);
      // Default ON for fresh installs.
      const en = v == null ? true : v === '1';
      if (v == null) {
        await AsyncStorage.setItem(PREFS_RECORDING, '1');
      }
      setRecordingEnabled(en);
      if (PhoneCallsModule?.getCallRecordingSpeakerphoneBoost) {
        try {
          const boost = await PhoneCallsModule.getCallRecordingSpeakerphoneBoost();
          setSpeakerBoostEnabled(Boolean(boost));
        } catch {
          setSpeakerBoostEnabled(false);
        }
      }
      if (en && PhoneCallsModule?.startCallRecordingService) {
        try {
          const ok = await ensureCallRecordingPermissions();
          if (ok) {
            await PhoneCallsModule.startCallRecordingService();
          }
        } catch (e) {
          console.error('CallLogsScreen start recording service:', e);
        }
      }
    } catch {
      setRecordingEnabled(false);
    }
  }, []);

  const fetchCallLogs = useCallback(async () => {
    if (!PhoneCallsModule?.getCallLogs) {
      return [];
    }
    const rows = await PhoneCallsModule.getCallLogs(200);
    const list = Array.isArray(rows) ? rows : [];
    setCallLogs(list);
    return list;
  }, []);

  const syncCallLogsIfNeeded = useCallback(async (list) => {
    if (!list?.length) {
      return;
    }
    const synced = await getSyncedCallLogIdSet();
    const map = {};
    for (const row of list) {
      const id = String(row.id);
      map[id] = synced.has(id);
    }
    setLogSyncedMap(map);

    const pending = list.filter((row) => !synced.has(String(row.id)));
    if (pending.length === 0) {
      return;
    }

    setSyncingCallLogs(true);
    const CHUNK = 100;
    try {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const entries = chunk.map((row) => ({
          id: String(row.id),
          phoneNumber: row.phoneNumber || '',
          contactName: row.contactName || '',
          callType: row.callType || '',
          timestamp: row.timestamp ?? 0,
          durationSec: row.durationSec ?? 0,
        }));
        await syncCallLogsToBackend(entries);
        await markCallLogIdsSynced(chunk.map((r) => String(r.id)));
      }
      const synced2 = await getSyncedCallLogIdSet();
      const next = {};
      for (const row of list) {
        const id = String(row.id);
        next[id] = synced2.has(id);
      }
      setLogSyncedMap(next);
    } catch (e) {
      console.warn('[CallLogsScreen] Call log sync failed:', e?.message || e);
    } finally {
      setSyncingCallLogs(false);
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    if (!PhoneCallsModule?.getPendingRecordings) {
      return;
    }
    const rows = await PhoneCallsModule.getPendingRecordings();
    const list = Array.isArray(rows) ? rows : [];
    const map = {};
    for (const r of list) {
      const p = r.audioPath;
      if (p) {
        map[p] = await isPathUploaded(p);
      }
    }
    setRecordings(list);
    setUploadedMap(map);

    for (const item of list) {
      const path = item.audioPath;
      if (!path || map[path]) {
        continue;
      }
      setUploadingPath(path);
      try {
        await uploadCallRecording({
          filePath: path,
          metadata: {
            phoneNumber: item.phoneNumber || '',
            contactName: item.contactName || '',
            direction: item.direction || '',
            durationMs: item.durationMs || 0,
            recordedAt: item.recordedAt || item.modifiedAt || Date.now(),
            fileName: item.fileName || '',
          },
        });
        await markPathUploaded(path);
        map[path] = true;
        setUploadedMap((prev) => ({ ...prev, [path]: true }));
      } catch (e) {
        console.warn('[CallLogsScreen] Auto-upload failed:', path, e?.message || e);
      } finally {
        setUploadingPath(null);
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!isPhoneCallsSupported()) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const [logList] = await Promise.all([fetchCallLogs(), fetchRecordings()]);
      await syncCallLogsIfNeeded(logList || []);
    } catch (e) {
      console.error('CallLogsScreen refresh:', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [fetchCallLogs, fetchRecordings, syncCallLogsIfNeeded]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  useEffect(() => {
    if (tab !== TAB_RECORDINGS) {
      NativeAudioService.stopPlayback().catch(() => {});
      setPlayingPath(null);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      (async () => {
        if (PhoneCallsModule?.getCallRecordingSpeakerphoneBoost) {
          try {
            const boost = await PhoneCallsModule.getCallRecordingSpeakerphoneBoost();
            setSpeakerBoostEnabled(Boolean(boost));
          } catch {
            // ignore
          }
        }
      })();
      return () => {
        NativeAudioService.stopPlayback().catch(() => {});
        setPlayingPath(null);
      };
    }, [refreshAll]),
  );

  /** Request call/SMS/media/notification permissions here — not at app cold start — so the main gate is not blocked by OEM check quirks. */
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || featurePermsOnce.current) {
        return;
      }
      featurePermsOnce.current = true;
      (async () => {
        try {
          const list = getAndroidFeaturePermissionList();
          if (list.length === 0) {
            return;
          }
          const statuses = await checkMultiple(list);
          const denied = [];
          for (const p of list) {
            let s = statuses[p];
            if (s === undefined) {
              try {
                s = await check(p);
              } catch {
                s = RESULTS.DENIED;
              }
            }
            if (s === RESULTS.GRANTED || s === RESULTS.LIMITED || s === RESULTS.UNAVAILABLE) {
              continue;
            }
            denied.push(p);
          }
          if (denied.length > 0) {
            await requestMultiple(denied);
          }
        } catch (e) {
          console.error('CallLogsScreen feature permissions:', e);
        }
      })();
    }, []),
  );

  useEffect(() => {
    if (!isPhoneCallsSupported()) {
      return undefined;
    }
    const sub = new NativeEventEmitter(PhoneCallsModule).addListener(
      'PhoneCalls_onCallRecordingComplete',
      () => {
        fetchRecordings();
      },
    );
    return () => sub.remove();
  }, [fetchRecordings]);

  const applyRecordingService = useCallback(
    async (enabled) => {
      if (!PhoneCallsModule) {
        return;
      }
      try {
        if (enabled) {
          // Guide the user if Accessibility is disabled / restricted settings block toggling it.
          if (typeof NativeAudioService?.ensureAccessibilityEnabledOrPrompt === 'function') {
            const okAccess = await NativeAudioService.ensureAccessibilityEnabledOrPrompt();
            if (!okAccess) {
              return;
            }
          }
          const ok = await ensureCallRecordingPermissions();
          if (!ok) {
            showAlert(
              'Permissions required',
              'Call recording needs Microphone and Phone access so the system can detect calls and capture audio.',
              [{ text: 'OK' }],
            );
            return;
          }
          await PhoneCallsModule.startCallRecordingService();
          await AsyncStorage.setItem(PREFS_RECORDING, '1');
          
          if (PhoneCallsModule.setCallRecordingSpeakerphoneBoost) {
            await PhoneCallsModule.setCallRecordingSpeakerphoneBoost(true);
            setSpeakerBoostEnabled(true);
          }
          
          showAlert(
            'Android Restriction Notice',
            'Android 10+ devices restrict call recording. Speakerphone Boost has been enabled automatically to capture audio reliably via the loudspeaker.',
            [{ text: 'Got it' }]
          );
        } else {
          await PhoneCallsModule.stopCallRecordingService();
          await AsyncStorage.setItem(PREFS_RECORDING, '0');
        }
        setRecordingEnabled(enabled);
      } catch (e) {
        console.error(e);
        showAlert('Recording', e?.message || 'Could not start or stop call recording.', [{ text: 'OK' }]);
      }
    },
    [showAlert],
  );

  const onToggleRecording = (value) => {
    applyRecordingService(value);
  };

  const onToggleSpeakerBoost = useCallback(
    async (value) => {
      if (!PhoneCallsModule?.setCallRecordingSpeakerphoneBoost) {
        return;
      }
      try {
        await PhoneCallsModule.setCallRecordingSpeakerphoneBoost(value);
        setSpeakerBoostEnabled(value);
      } catch (e) {
        showAlert('Speaker boost', e?.message || 'Could not save setting.', [{ text: 'OK' }]);
      }
    },
    [showAlert],
  );

  const togglePlayback = useCallback(
    async (item) => {
      const path = playbackSource(item);
      if (!path) {
        return;
      }
      const key = playbackKey(item);
      if (playingPath === key && NativeAudioService.isPlaying) {
        await NativeAudioService.stopPlayback();
        setPlayingPath(null);
        return;
      }
      if (NativeAudioService.isPlaying) {
        await NativeAudioService.stopPlayback();
      }
      const r = await NativeAudioService.playRecording(path, () => setPlayingPath(null));
      if (r.success) {
        setPlayingPath(key);
      } else {
        showAlert('Playback', r.error || 'Could not play this file.', [{ text: 'OK' }]);
      }
    },
    [playingPath, showAlert],
  );

  const handleDelete = (item) => {
    const path = item.audioPath;
    if (!path || !PhoneCallsModule?.deleteRecording) {
      return;
    }
    showAlert('Delete recording', 'Remove this file from the device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await PhoneCallsModule.deleteRecording(path);
            await fetchRecordings();
          } catch (e) {
            showAlert('Error', e?.message || 'Could not delete.', [{ text: 'OK' }]);
          }
        },
      },
    ]);
  };

  const renderLogItem = ({ item }) => {
    const Icon = callTypeIcon(item.callType);
    const when = formatDateTime(item.timestamp);
    const logId = String(item.id);
    const logSynced = logSyncedMap[logId];
    return (
      <View style={styles.card}>
        <View style={[styles.iconWrap, item.callType === 'missed' && styles.iconMissed]}>
          <Icon size={20} color={Colors.text.primary} strokeWidth={2} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.contactName || item.phoneNumber || 'Unknown'}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {item.phoneNumber || '—'} · {callTypeLabel(item.callType)}
          </Text>
          <Text style={styles.cardMeta}>
            {when} · {formatDurationSec(item.durationSec)}
            {syncingCallLogs && !logSynced ? ' · Sending…' : ''}
            {!syncingCallLogs && logSynced ? ' · Synced' : ''}
            {!syncingCallLogs && !logSynced ? ' · Pending sync' : ''}
          </Text>
        </View>
      </View>
    );
  };

  const renderRecordingItem = ({ item }) => {
    const path = item.audioPath;
    const playPath = playbackSource(item);
    const pkey = playbackKey(item);
    const uploaded = path && uploadedMap[path];
    const syncing = uploadingPath === path;
    const isPlaying = playingPath === pkey && NativeAudioService.isPlaying;
    const hasPublicCopy = !!(item.publicLocation && String(item.publicLocation).trim());
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={() => togglePlayback(item)}
          activeOpacity={0.75}
          disabled={!playPath}
        >
          <View style={[styles.iconWrap, isPlaying && styles.iconPlaying]}>
            {isPlaying ? (
              <Pause size={22} color={Colors.text.primary} strokeWidth={2.2} fill={Colors.text.primary} />
            ) : (
              <Play size={22} color={Colors.text.primary} strokeWidth={2.2} fill={Colors.text.primary} />
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.contactName || item.phoneNumber || 'Unknown number'}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.phoneNumber || '—'} · {item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
            </Text>
            <Text style={styles.cardMeta}>
              {formatDurationMs(item.durationMs)} · {formatDateTime(item.recordedAt || item.modifiedAt)}
              {syncing ? ' · Sending…' : ''}
              {!syncing && uploaded ? ' · Synced' : ''}
              {!syncing && !uploaded ? ' · Pending sync' : ''}
            </Text>
            <Text style={styles.tapHint}>Tap to play or stop</Text>
            {hasPublicCopy ? (
              <Text style={styles.storageHint} numberOfLines={2}>
                Also in Files: Download → CallRecordings (same recording)
              </Text>
            ) : null}
            {item.likelySilentCapture ? (
              <View>
                <Text style={styles.silentWarning} numberOfLines={4}>
                  No usable call audio detected. Android blocks normal apps from recording calls. Speakerphone boost is recommended.
                </Text>
                {!speakerBoostEnabled ? (
                  <TouchableOpacity 
                    style={styles.speakerBtn}
                    onPress={() => onToggleSpeakerBoost(true)}
                  >
                    <Text style={styles.speakerBtnText}>Enable Speakerphone Boost</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={18} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>
    );
  };

  if (Platform.OS !== 'android') {
    return (
      <ScreenContainer>
        <AppHeader title="Calls" />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Not available on this platform</Text>
          <Text style={styles.emptyBody}>Call log and call recording are supported on Android.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!isPhoneCallsSupported()) {
    return (
      <ScreenContainer>
        <AppHeader title="Calls" />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyBody}>Phone module not available.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader title="Calls" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === TAB_LOG && styles.tabActive]}
          onPress={() => setTab(TAB_LOG)}
        >
          <Text style={[styles.tabText, tab === TAB_LOG && styles.tabTextActive]}>Call log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === TAB_RECORDINGS && styles.tabActive]}
          onPress={() => setTab(TAB_RECORDINGS)}
        >
          <Text style={[styles.tabText, tab === TAB_RECORDINGS && styles.tabTextActive]}>Recordings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Record phone calls</Text>
          <Text style={styles.toggleHint}>
            Runs in the background and saves audio when a call is active.
          </Text>
        </View>
        <Switch value={recordingEnabled} onValueChange={onToggleRecording} />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Speakerphone while recording</Text>
          <View style={styles.helpRow}>
            <Text style={styles.toggleHint}>
              Enables two-way capture by routing the remote voice through the speaker.
            </Text>
            <TouchableOpacity
              onPress={() =>
                showAlert(
                  'Two-Way Audio Help',
                  "If your recordings contain only your voice (or are silent), this is usually due to Android call-audio restrictions.\n\n" +
                    "Fix:\n" +
                    "1) Turn ON “Speakerphone while recording”.\n" +
                    "2) If you still can't enable two-way audio, go to App Info → (⋮) Allow restricted settings, then enable the Accessibility Service.\n" +
                    "3) Place a test call in a quiet room and verify the new recording.",
                  [{ text: 'OK' }],
                )
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.helpBtn}
            >
              <Text style={styles.helpBtnText}>Two-way audio help</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Switch
          value={speakerBoostEnabled}
          onValueChange={onToggleSpeakerBoost}
          disabled={!PhoneCallsModule?.setCallRecordingSpeakerphoneBoost}
        />
      </View>

      <Text style={styles.legal}>
        Laws on recording calls vary by country and state. Only use this feature where you are allowed to
        record, and inform the other party if required.
      </Text>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={Colors.primaryLight} />
        </View>
      ) : tab === TAB_LOG ? (
        <FlatList
          data={callLogs}
          keyExtractor={(item, index) => `log_${item.id}_${index}`}
          renderItem={renderLogItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.listEmpty}>No entries in the call log. Grant call log permission if prompted.</Text>
          }
        />
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item, index) => `rec_${item.fileName}_${index}`}
          renderItem={renderRecordingItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.listEmpty}>
              No recordings yet. Enable “Record phone calls” and place or receive a call. If files appear but
              sound is empty, your phone may block third-party call audio; try speakerphone or the built-in
              dialer recorder.
            </Text>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: Colors.borderLight,
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: Colors.text.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  helpRow: {
    marginTop: 6,
    gap: 8,
  },
  helpBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.backgroundAlt,
  },
  helpBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  toggleHint: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  legal: {
    fontSize: 11,
    color: Colors.text.light,
    marginHorizontal: 16,
    marginBottom: 12,
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 4,
  },
  cardTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteBtn: {
    padding: 10,
    borderRadius: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMissed: {
    backgroundColor: Colors.recording.activeBg,
  },
  iconPlaying: {
    backgroundColor: Colors.status.infoBg,
  },
  tapHint: {
    fontSize: 11,
    color: Colors.text.light,
    marginTop: 4,
  },
  storageHint: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 6,
    lineHeight: 15,
  },
  silentWarning: {
    fontSize: 11,
    color: Colors.warning.text,
    marginTop: 8,
    lineHeight: 16,
  },
  speakerBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
  },
  speakerBtnText: {
    color: Colors.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  cardSub: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.text.light,
    marginTop: 6,
  },
  listEmpty: {
    textAlign: 'center',
    color: Colors.text.secondary,
    marginTop: 32,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  emptyWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 48,
  },
});
