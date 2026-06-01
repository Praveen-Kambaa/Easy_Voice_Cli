import logger from '../../utils/logger';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  NativeEventEmitter,
  ActivityIndicator,
  Modal,
  ScrollView,
  Clipboard,
  NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, FileText, Copy, X } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import { PhoneCallsModule, isPhoneCallsSupported } from '../../native/phoneCalls';
import { formatDateTime } from '../../utils/dateTimeFormat';
import NativeAudioService from '../../services/NativeAudioService';
import { uploadCallRecording } from '../../services/callRecordingsApi';
import { syncCallLogsToBackend } from '../../services/callLogsApi';
import { offlineWhisperService } from '../../services/offlineWhisperService';
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
import { normalizeStoredLanguageCode } from '../../constants/translationLanguages';

const PREFS_RECORDING = '@call_recording_service_enabled';
const CALL_TRANSCRIPTS_STORAGE = '@call_recording_transcripts_v1';

async function readCallTranscriptCache() {
  try {
    const raw = await AsyncStorage.getItem(CALL_TRANSCRIPTS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCallTranscriptCache(map) {
  await AsyncStorage.setItem(CALL_TRANSCRIPTS_STORAGE, JSON.stringify(map || {}));
}

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

function formatTime(ts) {
  try {
    const d = new Date(Number(ts) || 0);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatDate(ts) {
  try {
    const d = new Date(Number(ts) || 0);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function normalizePhone(p) {
  return String(p ?? '').replace(/[^\d+]/g, '').trim();
}

function directionFromCallType(callType) {
  if (callType === 'outgoing') return 'outgoing';
  if (callType === 'incoming') return 'incoming';
  return '';
}

export default function CallLogsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const featurePermsOnce = useRef(false);
  const transcriptJobsRef = useRef(new Set());
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
  const [recordingTranscriptMap, setRecordingTranscriptMap] = useState({});
  const [transcribingMap, setTranscribingMap] = useState({});
  const [transcriptModal, setTranscriptModal] = useState({ visible: false, title: '', text: '' });
  const [transcriptCopied, setTranscriptCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setRecordingTranscriptMap(await readCallTranscriptCache());
    })();
  }, []);

  const saveTranscriptForPath = useCallback(async (path, transcript) => {
    if (!path) return;
    const next = {
      ...(await readCallTranscriptCache()),
      [path]: String(transcript || '').trim(),
    };
    await writeCallTranscriptCache(next);
    setRecordingTranscriptMap(next);
  }, []);

  const getPreferredTranscriptLanguage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('@from_language');
      return normalizeStoredLanguageCode(raw || 'auto', 'auto').toLowerCase();
    } catch {
      return 'auto';
    }
  }, []);

  const ensureRecordingTranscript = useCallback(async (item) => {
    const path = item?.audioPath;
    if (!path) return;
    if (recordingTranscriptMap[path]) return;
    if (transcriptJobsRef.current.has(path)) return;

    transcriptJobsRef.current.add(path);
    setTranscribingMap((prev) => ({ ...prev, [path]: true }));
    try {
      let audioForWhisper = path.startsWith('file://') ? path : `file://${path}`;
      if (typeof NativeModules.AudioTranscodeModule?.convertToWav16kMono === 'function') {
        audioForWhisper = await NativeModules.AudioTranscodeModule.convertToWav16kMono(audioForWhisper);
      }

      const transcript = await offlineWhisperService.transcribeFile(audioForWhisper, {
        language: await getPreferredTranscriptLanguage(),
      });

      const finalText = String(transcript || '').trim();
      if (finalText) {
        await saveTranscriptForPath(path, finalText);
      }
    } catch (e) {
      logger.warn('[CallLogsScreen] Call transcription failed:', e?.message || e);
    } finally {
      transcriptJobsRef.current.delete(path);
      setTranscribingMap((prev) => ({ ...prev, [path]: false }));
    }
  }, [getPreferredTranscriptLanguage, recordingTranscriptMap, saveTranscriptForPath]);

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
            // Default ON: speaker boost for two-way audio capture.
            if (PhoneCallsModule?.setCallRecordingSpeakerphoneBoost) {
              try {
                await PhoneCallsModule.setCallRecordingSpeakerphoneBoost(true);
                setSpeakerBoostEnabled(true);
              } catch {
                // ignore
              }
            }
          }
        } catch (e) {
          logger.error('CallLogsScreen start recording service:', e);
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
      logger.warn('[CallLogsScreen] Call log sync failed:', e?.message || e);
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
        logger.warn('[CallLogsScreen] Auto-upload failed:', path, e?.message || e);
      } finally {
        setUploadingPath(null);
      }
    }

    for (const item of list) {
      if (item?.audioPath && !recordingTranscriptMap[item.audioPath]) {
        await ensureRecordingTranscript(item);
      }
    }
  }, [ensureRecordingTranscript, recordingTranscriptMap]);

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
      logger.error('CallLogsScreen refresh:', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [fetchCallLogs, fetchRecordings, syncCallLogsIfNeeded]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  useEffect(() => {
    return () => {
      NativeAudioService.stopPlayback().catch(() => {});
      setPlayingPath(null);
    };
  }, []);

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
          logger.error('CallLogsScreen feature permissions:', e);
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
        logger.error(e);
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

  const openTranscriptModal = useCallback((item) => {
    const path = item?.audioPath;
    const transcript = path ? recordingTranscriptMap[path] : '';
    if (!transcript) {
      showAlert('Transcript', transcribingMap[path] ? 'Transcription is in progress.' : 'Transcript is not available yet.', [{ text: 'OK' }]);
      return;
    }
    setTranscriptModal({
      visible: true,
      title: item?.contactName || item?.phoneNumber || 'Call transcript',
      text: transcript,
    });
    setTranscriptCopied(false);
  }, [recordingTranscriptMap, showAlert, transcribingMap]);

  const copyTranscriptText = useCallback(() => {
    const text = String(transcriptModal.text || '').trim();
    if (!text) {
      showAlert('Copy', 'No transcript to copy.', [{ text: 'OK' }]);
      return;
    }
    try {
      Clipboard.setString(text);
      setTranscriptCopied(true);
    } catch {
      showAlert('Copy', 'Could not copy transcript.', [{ text: 'OK' }]);
    }
  }, [showAlert, transcriptModal.text]);

  const findRecordingForLog = useCallback(
    (logItem) => {
      if (!logItem) return null;
      const logPhone = normalizePhone(logItem.phoneNumber);
      const dir = directionFromCallType(logItem.callType);
      const ts = Number(logItem.timestamp) || 0;
      if (!logPhone || !ts || recordings.length === 0) return null;

      // Match recording by phone + direction and closest timestamp (within 15 minutes).
      let best = null;
      let bestDelta = Infinity;
      for (const r of recordings) {
        const recPhone = normalizePhone(r.phoneNumber);
        if (!recPhone || recPhone !== logPhone) continue;
        if (dir && r.direction && String(r.direction).toLowerCase() !== dir) continue;
        const rts = Number(r.recordedAt || r.modifiedAt || 0) || 0;
        if (!rts) continue;
        const delta = Math.abs(rts - ts);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = r;
        }
      }
      return bestDelta <= 15 * 60 * 1000 ? best : null;
    },
    [recordings],
  );

  const renderUnifiedItem = ({ item }) => {
    const Icon = callTypeIcon(item.callType);
    const logId = String(item.id);
    const logSynced = logSyncedMap[logId];
    const typeText =
      item.callType === 'missed'
        ? '#EF4444'
        : item.callType === 'incoming'
          ? '#10B981'
          : item.callType === 'outgoing'
            ? colors.primary
            : colors.text.secondary;
    const typeBg =
      item.callType === 'missed'
        ? 'rgba(239, 68, 68, 0.10)'
        : item.callType === 'incoming'
          ? 'rgba(16, 185, 129, 0.10)'
          : item.callType === 'outgoing'
            ? 'rgba(30, 136, 255, 0.10)'
            : colors.backgroundAlt;
    const typeBorder =
      item.callType === 'missed'
        ? 'rgba(239, 68, 68, 0.20)'
        : item.callType === 'incoming'
          ? 'rgba(16, 185, 129, 0.20)'
          : item.callType === 'outgoing'
            ? 'rgba(30, 136, 255, 0.20)'
            : colors.borderLight;
    const timeText = formatTime(item.timestamp);
    const dateText = formatDate(item.timestamp);

    const rec = findRecordingForLog(item);
    const pkey = rec ? playbackKey(rec) : null;
    const isPlaying = rec ? playingPath === pkey && NativeAudioService.isPlaying : false;
    const recDuration = rec?.durationMs != null ? formatDurationMs(rec.durationMs) : null;
    const transcript = rec?.audioPath ? recordingTranscriptMap[rec.audioPath] : '';
    const transcriptBusy = rec?.audioPath ? !!transcribingMap[rec.audioPath] : false;

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={[styles.iconWrap, { backgroundColor: typeBg, borderColor: typeBorder }]}>
            <Icon size={18} color={typeText} strokeWidth={2.2} />
          </View>

          <View style={styles.mainCol}>
            <View style={styles.topLineRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.contactName || item.phoneNumber || 'Unknown'}
              </Text>
            </View>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.phoneNumber || '—'}
            </Text>
          </View>

          <View style={styles.rightCol}>
            <Text style={styles.timeText}>{timeText}</Text>
            <Text style={styles.dateText}>{dateText}</Text>
          </View>
        </View>

        {rec ? (
          <View style={[styles.recordRow, isPlaying && styles.recordRowActive]}>
            <TouchableOpacity
              style={styles.recordPlayArea}
              onPress={() => togglePlayback(rec)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause call recording' : 'Play call recording'}
            >
              <View style={[styles.recordPlay, isPlaying && styles.recordPlayActive]}>
                {isPlaying ? (
                  <Pause size={16} color="#FFFFFF" strokeWidth={2.4} fill="#FFFFFF" />
                ) : (
                  <Play size={16} color="#FFFFFF" strokeWidth={2.4} fill="#FFFFFF" />
                )}
              </View>
              <View style={styles.recordRowText}>
                <Text style={styles.recordRowTitle} numberOfLines={1}>
                  Call recording
                </Text>
                <Text style={styles.recordRowSub} numberOfLines={1}>
                  {transcriptBusy ? 'Transcribing…' : `Duration: ${recDuration || '—'}`}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.transcriptIconBtn,
                (transcript || transcriptBusy) && styles.transcriptIconBtnActive,
              ]}
              onPress={() => openTranscriptModal(rec)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open call transcript"
            >
              <FileText
                size={16}
                color={(transcript || transcriptBusy) ? colors.primary : colors.text.secondary}
                strokeWidth={2.2}
              />
            </TouchableOpacity>
          </View>
        ) : null}
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
      {/* Default enabled (see loadPrefs/applyRecordingService). Keeping UI hidden as requested.
      <View style={styles.toggleRow}>...</View>
      <View style={styles.toggleRow}>...</View>
      */}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
        </View>
      ) : (
        <FlatList
          data={callLogs}
          keyExtractor={(item, index) => `log_${item.id}_${index}`}
          renderItem={renderUnifiedItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 24 + (insets?.bottom || 0) + 96 },
          ]}
          ListEmptyComponent={
            <Text style={styles.listEmpty}>No entries in the call log. Grant call log permission if prompted.</Text>
          }
        />
      )}

      <Modal
        visible={transcriptModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTranscriptModal({ visible: false, title: '', text: '' });
          setTranscriptCopied(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{transcriptModal.title || 'Call transcript'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setTranscriptModal({ visible: false, title: '', text: '' });
                  setTranscriptCopied(false);
                }}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              <Text style={styles.modalTranscriptText}>{transcriptModal.text || 'No transcript available.'}</Text>
            </ScrollView>

            <View style={styles.modalActions}>
              {transcriptCopied ? (
                <Text style={styles.modalCopiedText}>Copied</Text>
              ) : null}
              <TouchableOpacity style={styles.modalCopyIconBtn} onPress={copyTranscriptText} activeOpacity={0.85}>
                <Copy size={16} color={colors.primary} strokeWidth={2.1} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  setTranscriptModal({ visible: false, title: '', text: '' });
                  setTranscriptCopied(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalPrimaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCol: {
    flex: 1,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    paddingLeft: 10,
  },
  topLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  dateText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  rightMetaText: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  syncRightText: {
    marginTop: 4,
    fontSize: 10,
    color: colors.text.light,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  recordRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  recordRowActive: {
    borderColor: 'rgba(30, 136, 255, 0.28)',
    backgroundColor: 'rgba(30, 136, 255, 0.08)',
  },
  recordPlay: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordPlayActive: {
    backgroundColor: colors.primary,
  },
  recordPlayArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recordRowText: {
    flex: 1,
  },
  recordRowTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  recordRowSub: {
    marginTop: 2,
    fontSize: 11,
    color: colors.text.secondary,
  },
  transcriptIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  transcriptIconBtnActive: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
  },
  listEmpty: {
    textAlign: 'center',
    color: colors.text.secondary,
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
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 48,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
  },
  modalBody: {
    maxHeight: 320,
  },
  modalBodyContent: {
    paddingBottom: 8,
  },
  modalTranscriptText: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCopyIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCopiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.status.granted,
  },
  modalPrimaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  });
}
