import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Mic, Square, Play, Trash2, Calendar, Clock, Pause, Pencil } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { AppCard } from '../../components/common/AppCard';
import { useTheme } from '../../context/ThemeContext';
import NativeAudioService from '../../services/NativeAudioService';
import { useAlert } from '../../context/AlertContext';
import { formatDateTime, formatCompactDateTime } from '../../utils/dateTimeFormat';
import { parseReminderFromTranscript } from '../../utils/parseSpokenDateTime';
import { voiceApi } from '../../api/voiceApi';
import { offlineWhisperService } from '../../services/offlineWhisperService';
import {
  addVoiceReminder,
  loadReminders,
  removeVoiceReminder,
  initVoiceReminderNotifications,
} from '../../services/voiceReminderService';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';

function addMinutes(d, m) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + m);
  return x;
}

function mergeDatePart(base, picked) {
  return new Date(
    picked.getFullYear(),
    picked.getMonth(),
    picked.getDate(),
    base.getHours(),
    base.getMinutes(),
    0,
    0,
  );
}

function mergeTimePart(base, picked) {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    picked.getHours(),
    picked.getMinutes(),
    0,
    0,
  );
}

async function transcribeForReminder(filePath) {
  const api = await voiceApi.transcribeAudio(filePath, {
    language: 'en-US',
    enablePunctuation: true,
    enableTimestamps: false,
  });
  if (api.success) {
    const t = api.data?.refinedTranscript || api.data?.rawTranscript;
    if (t && String(t).trim()) {
      return String(t).trim();
    }
  }
  return offlineWhisperService.transcribeFile(filePath, { language: 'en' });
}

function VoiceRemindersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const showAlert = useAlert();

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pendingPath, setPendingPath] = useState('');
  const [pendingMeta, setPendingMeta] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState([]);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcribeError, setTranscribeError] = useState(null);
  const [parseHint, setParseHint] = useState(null);
  const [parseError, setParseError] = useState(null);

  /** Expanded editor for transcript + time (optional) */
  const [editing, setEditing] = useState(false);

  const [scheduledAt, setScheduledAt] = useState(() => addMinutes(new Date(), 5));
  const [picker, setPicker] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  /** Bumped on blur / pull-refresh so in-flight transcription cannot repopulate a cleared draft. */
  const draftEpochRef = useRef(0);
  /** After user picks date/time in Edit, don't overwrite from transcript on blur/Done. Cleared when transcript text changes or new recording. */
  const timePickedManuallyRef = useRef(false);

  const recordingStart = useRef(null);
  const durationTimer = useRef(null);

  const refresh = useCallback(async () => {
    const list = await loadReminders();
    list.sort((a, b) => {
      const ca = new Date(a.createdAt || a.scheduledAt).getTime();
      const cb = new Date(b.createdAt || b.scheduledAt).getTime();
      return cb - ca;
    });
    setReminders(list);
  }, []);

  const applyParseFromText = useCallback((text, options = {}) => {
    const updateScheduledTime = options.updateScheduledTime !== false;
    const pr = parseReminderFromTranscript(text);
    setParseError(pr.error);
    setParseHint(pr.hint);
    const applyTime =
      updateScheduledTime && !timePickedManuallyRef.current && pr.date;
    if (applyTime) {
      setScheduledAt(pr.date);
    }
  }, []);

  const resetDraft = useCallback(() => {
    draftEpochRef.current += 1;
    timePickedManuallyRef.current = false;
    NativeAudioService.stopPlayback().catch(() => {});
    NativeAudioService.forceCleanup().catch(() => {});
    setActivePlayback(null);
    setPendingPath('');
    setPendingMeta(null);
    setTranscript('');
    setTranscribeError(null);
    setParseHint(null);
    setParseError(null);
    setEditing(false);
    setIsRecording(false);
    setIsTranscribing(false);
    setDuration(0);
    setScheduledAt(addMinutes(new Date(), 5));
    setPicker(null);
    setSaving(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      initVoiceReminderNotifications();
      refresh();
      return () => {
        resetDraft();
      };
    }, [refresh, resetDraft]),
  );

  useEffect(() => {
    if (isRecording) {
      recordingStart.current = Date.now();
      durationTimer.current = setInterval(() => {
        if (recordingStart.current) {
          setDuration(Date.now() - recordingStart.current);
        }
      }, 200);
    } else {
      clearInterval(durationTimer.current);
    }
    return () => clearInterval(durationTimer.current);
  }, [isRecording]);

  // Re-render periodically so "Scheduled" -> "Notified" styling updates while screen is open.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const onStart = async () => {
    if (isRecording) return;
    const epoch = draftEpochRef.current;
    timePickedManuallyRef.current = false;
    setPendingPath('');
    setPendingMeta(null);
    setTranscript('');
    setTranscribeError(null);
    setParseHint(null);
    setParseError(null);
    setEditing(false);
    setDuration(0);
    const r = await NativeAudioService.startRecording();
    if (epoch !== draftEpochRef.current) {
      await NativeAudioService.forceCleanup().catch(() => {});
      return;
    }
    if (r.success) {
      setIsRecording(true);
    } else {
      showAlert('Recording', r.error || 'Could not start recording');
    }
  };

  const runTranscription = async (filePath) => {
    const epoch = draftEpochRef.current;
    setIsTranscribing(true);
    setTranscribeError(null);
    setParseHint(null);
    setParseError(null);
    setTranscript('');
    setEditing(false);
    try {
      const t = await transcribeForReminder(filePath);
      if (epoch !== draftEpochRef.current) return;
      if (!t || !String(t).trim()) {
        throw new Error('No words were recognized. Speak your reminder and the date/time more clearly.');
      }
      timePickedManuallyRef.current = false;
      setTranscript(t);
      applyParseFromText(t, { updateScheduledTime: true });
    } catch (e) {
      if (epoch !== draftEpochRef.current) return;
      const msg = e?.message || 'Transcription failed';
      setTranscribeError(msg);
      showAlert(
        'Transcription',
        msg +
          (/\bnetwork\b/i.test(msg)
            ? ' You can try again on a better connection; offline transcription may work after the model downloads once.'
            : ''),
        [{ text: 'OK' }],
      );
    } finally {
      if (epoch === draftEpochRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const onStop = async () => {
    if (!isRecording) return;
    const epochAtStop = draftEpochRef.current;
    setIsRecording(false);
    const r = await NativeAudioService.stopRecording({ persist: false });
    if (epochAtStop !== draftEpochRef.current) return;
    if (r.success && r.filePath) {
      setPendingPath(r.filePath);
      setPendingMeta({ duration: r.duration, recordingId: r.recordingId });
      await logActivity(ActivityCategory.VOICE_RECORDER, 'voice_reminder_recorded', {
        label: 'Voice reminder recorded',
      });
      await runTranscription(r.filePath);
    } else {
      showAlert('Error', r.error || 'Could not save recording');
    }
  };

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      resetDraft();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [resetDraft, refresh]);

  const onTogglePreview = async () => {
    if (!pendingPath) return;
    if (activePlayback?.kind === 'preview') {
      await NativeAudioService.stopPlayback();
      setActivePlayback(null);
      return;
    }
    if (activePlayback) {
      await NativeAudioService.stopPlayback();
    }
    setActivePlayback({ kind: 'preview' });
    await NativeAudioService.playRecording(pendingPath, () => {
      setActivePlayback((a) => (a?.kind === 'preview' ? null : a));
    });
  };

  const onRetryTranscribe = async () => {
    if (!pendingPath) return;
    await runTranscription(pendingPath);
  };

  const onSaveReminder = async () => {
    if (!pendingPath) {
      showAlert('No recording', 'Record a voice message that includes when to remind you.');
      return;
    }
    if (!transcript.trim()) {
      showAlert('Transcript', 'Wait for transcription or try again.');
      return;
    }
    if (scheduledAt.getTime() <= Date.now() + 5000) {
      showAlert(
        'Time',
        'The reminder time must be a few minutes in the future. Tap Edit to fix the time.',
      );
      return;
    }
    setSaving(true);
    const res = await addVoiceReminder(pendingPath, scheduledAt, { transcript: transcript.trim() });
    setSaving(false);
    if (res.success) {
      setPendingPath('');
      setPendingMeta(null);
      setTranscript('');
      setTranscribeError(null);
      setParseHint(null);
      setParseError(null);
      setDuration(0);
      setEditing(false);
      setScheduledAt(addMinutes(new Date(), 5));
      await refresh();
      await logActivity(ActivityCategory.VOICE_RECORDER, 'voice_reminder_scheduled', {
        label: 'Voice reminder scheduled from speech',
      });
    } else {
      showAlert('Could not schedule', res.error || 'Unknown error');
    }
  };

  const onDelete = (id) => {
    showAlert('Delete reminder', 'Remove this reminder? The audio will be deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeVoiceReminder(id);
          await refresh();
        },
      },
    ]);
  };

  const onPlayRow = async (item) => {
    const { id, filePath } = item;
    if (activePlayback?.kind === 'row' && activePlayback.id === id) {
      await NativeAudioService.stopPlayback();
      setActivePlayback(null);
      return;
    }
    if (activePlayback) {
      await NativeAudioService.stopPlayback();
    }
    setActivePlayback({ kind: 'row', id });
    await NativeAudioService.playRecording(filePath, () => {
      setActivePlayback((a) => (a?.kind === 'row' && a.id === id ? null : a));
    });
  };

  const onDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setPicker(null);
    }
    if (event?.type === 'dismissed' || !date) {
      return;
    }
    timePickedManuallyRef.current = true;
    if (picker === 'date') {
      setScheduledAt((prev) => mergeDatePart(prev, date));
    } else if (picker === 'time') {
      setScheduledAt((prev) => mergeTimePart(prev, date));
    } else if (Platform.OS === 'ios' && picker === 'datetime' && date) {
      setScheduledAt(date);
    }
  };

  const now = nowTick;
  const canSave =
    !!pendingPath &&
    !isRecording &&
    !isTranscribing &&
    !!transcript.trim() &&
    scheduledAt.getTime() > Date.now() + 5000;

  const hasDraft = !!pendingPath && !isRecording;
  const showStickyCta = hasDraft;
  /** Cap upper section so the reminders card keeps height and scrolls on its own */
  const topScrollMaxHeight = Math.min(420, Math.round(windowHeight * 0.46));

  const renderItem = ({ item }) => {
    const when = new Date(item.scheduledAt);
    const past = when.getTime() < now;
    const line = item.transcript ? item.transcript.trim().split('\n')[0] : 'Voice note';
    return (
      <View style={styles.row}>
        <View style={[styles.rowMain, past && styles.rowMainPast]}>
          <Text
            style={[styles.rowTranscript, past && styles.rowTranscriptPast]}
            numberOfLines={2}
          >
            {line}
          </Text>
          <Text style={[styles.rowTime, past && styles.rowTimePast]}>{formatDateTime(when)}</Text>
          <Text style={[styles.rowMeta, past && styles.rowMetaPast]}>
            {past ? 'Notified' : 'Scheduled'}
          </Text>
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onPlayRow(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Play reminder audio"
          >
            {activePlayback?.kind === 'row' && activePlayback.id === item.id ? (
              <Pause size={20} color={colors.primary} />
            ) : (
              <Play size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onDelete(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Delete reminder"
          >
            <Trash2 size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.screenRoot}>
      <AppHeader title="Voice reminders" />
      <View style={styles.body}>
        <ScrollView
          style={[styles.topScroll, { maxHeight: topScrollMaxHeight }]}
          contentContainerStyle={styles.topScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={styles.oneLineHint}>
            Say your task and when (e.g. “remind me at 7 PM today”). When it fires, your phone rings
            like an alarm (repeating sound) until you open or dismiss it.
          </Text>

          <AppCard>
            <View style={styles.recRow}>
              {!isRecording ? (
                <TouchableOpacity style={styles.micBig} onPress={onStart} activeOpacity={0.85}>
                  <Mic size={30} color="#FFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.stopBig} onPress={onStop} activeOpacity={0.85}>
                  <Square size={24} color="#FFF" fill="#FFF" />
                </TouchableOpacity>
              )}
              <View style={styles.recInfo}>
                <Text style={styles.recLabel}>
                  {isRecording
                    ? 'Listening…'
                    : isTranscribing
                      ? 'Getting text…'
                      : pendingPath
                        ? 'Ready to save'
                        : 'Tap to record'}
                </Text>
                <Text style={styles.recDur}>
                  {isRecording
                    ? NativeAudioService.formatDuration(duration)
                    : pendingMeta
                      ? NativeAudioService.formatDuration(pendingMeta.duration)
                      : '0:00'}
                </Text>
              </View>
              {isTranscribing && <ActivityIndicator color={colors.primary} />}
              {!!pendingPath && !isRecording && !isTranscribing && (
                <TouchableOpacity
                  style={[
                    styles.playBtn,
                    activePlayback?.kind === 'preview' && styles.playBtnOn,
                  ]}
                  onPress={onTogglePreview}
                  accessibilityLabel={activePlayback?.kind === 'preview' ? 'Stop' : 'Play'}
                >
                  {activePlayback?.kind === 'preview' ? (
                    <Pause size={20} color="#FFF" fill="#FFF" />
                  ) : (
                    <Play size={20} color="#FFF" fill="#FFF" style={{ marginLeft: 2 }} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </AppCard>

          {transcribeError ? (
            <TouchableOpacity onPress={onRetryTranscribe} style={styles.retryBox}>
              <Text style={styles.errorText}>{transcribeError}</Text>
              <Text style={styles.retryLink}>Retry transcription</Text>
            </TouchableOpacity>
          ) : null}

          {hasDraft && !isTranscribing && !!transcript.trim() && (
            <AppCard style={styles.summaryCard}>
              {!editing ? (
                <>
                  <Text style={styles.summaryText} numberOfLines={4}>
                    {transcript}
                  </Text>
                  <Text style={styles.summaryTime}>{formatCompactDateTime(scheduledAt)}</Text>
                  {parseHint ? <Text style={styles.hintOk}>{parseHint}</Text> : null}
                  {parseError ? <Text style={styles.warnText}>{parseError}</Text> : null}
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => setEditing(true)}
                    activeOpacity={0.7}
                    accessibilityLabel="Edit reminder"
                  >
                    <Pencil size={16} color={colors.primary} />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View>
                  <Text style={styles.editLabel}>Text</Text>
                  <TextInput
                    style={styles.transcriptInput}
                    value={transcript}
                    onChangeText={(t) => {
                      timePickedManuallyRef.current = false;
                      setTranscript(t);
                    }}
                    onEndEditing={(e) => {
                      const t = e.nativeEvent.text?.trim();
                      if (t) {
                        applyParseFromText(t, {
                          updateScheduledTime: !timePickedManuallyRef.current,
                        });
                      }
                    }}
                    multiline
                    placeholderTextColor={colors.text.light}
                  />
                  <Text style={styles.editLabel}>When</Text>
                  <TouchableOpacity
                    style={styles.timeRow}
                    onPress={() => setPicker(Platform.OS === 'ios' ? 'datetime' : 'date')}
                    activeOpacity={0.7}
                  >
                    <Calendar size={18} color={colors.text.secondary} />
                    <View style={styles.timeRowText}>
                      <Text style={styles.timeValue}>{formatCompactDateTime(scheduledAt)}</Text>
                    </View>
                  </TouchableOpacity>
                  {Platform.OS === 'android' && (
                    <View style={styles.splitPicker}>
                      <TouchableOpacity
                        style={styles.splitBtn}
                        onPress={() => setPicker('date')}
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={colors.primary} />
                        <Text style={styles.splitBtnText}>Date</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.splitBtn}
                        onPress={() => setPicker('time')}
                        activeOpacity={0.7}
                      >
                        <Clock size={16} color={colors.primary} />
                        <Text style={styles.splitBtnText}>Time</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {picker && Platform.OS === 'android' && (picker === 'date' || picker === 'time') ? (
                    <DateTimePicker
                      value={scheduledAt}
                      mode={picker}
                      display="default"
                      onChange={onDateChange}
                      minimumDate={picker === 'date' ? new Date() : undefined}
                    />
                  ) : null}

                  {Platform.OS === 'ios' && picker === 'datetime' ? (
                    <View style={styles.iosPickerWrap}>
                      <View style={styles.iosBar}>
                        <TouchableOpacity onPress={() => setPicker(null)}>
                          <Text style={styles.iosBarBtn}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={scheduledAt}
                        mode="datetime"
                        display="spinner"
                        onChange={onDateChange}
                        minimumDate={new Date()}
                      />
                    </View>
                  ) : null}

                  {parseHint ? <Text style={styles.hintOk}>{parseHint}</Text> : null}
                  {parseError ? <Text style={styles.warnText}>{parseError}</Text> : null}
                  <TouchableOpacity
                    style={styles.doneEditBtn}
                    onPress={() => {
                      const t = transcript.trim();
                      if (t) {
                        applyParseFromText(t, {
                          updateScheduledTime: !timePickedManuallyRef.current,
                        });
                      }
                      setEditing(false);
                      setPicker(null);
                    }}
                  >
                    <Text style={styles.doneEditText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </AppCard>
          )}

          {isTranscribing && !transcript && (
            <Text style={styles.mutedCenter}>Transcribing…</Text>
          )}
        </ScrollView>

        <Text style={styles.listTitle}>Reminders</Text>
        <View style={styles.remindersSection}>
          <AppCard
            style={[
              styles.remindersCard,
              reminders.length === 0 && styles.remindersCardEmpty,
            ]}
            noPadding={reminders.length > 0}
          >
            {reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No data found</Text>
                <Text style={styles.emptySubtitle}>Your voice reminders will appear here.</Text>
              </View>
            ) : (
              <FlatList
                data={reminders}
                keyExtractor={(r) => r.id}
                renderItem={renderItem}
                style={styles.remindersList}
                contentContainerStyle={styles.remindersListContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              />
            )}
          </AppCard>
        </View>

        {showStickyCta && (
          <View
            style={[
              styles.stickyFooter,
              {
                paddingBottom: insets.bottom + 12,
                paddingTop: 12,
              },
            ]}
          >
            <PrimaryButton
              title="Set reminder"
              onPress={onSaveReminder}
              disabled={!canSave}
              loading={saving || isTranscribing}
              style={styles.ctaButton}
              textStyle={styles.ctaButtonLabel}
            />
            {!canSave && !isTranscribing && !!transcript.trim() && (
              <Text style={styles.ctaHelper}>
                Fix the time in Edit, or say a later time.
              </Text>
            )}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  screenRoot: { paddingBottom: 0 },
  body: { flex: 1 },
  topScroll: { flexGrow: 0, flexShrink: 1 },
  topScrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  oneLineHint: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  micBig: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.recording.active,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBig: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recInfo: { flex: 1 },
  recLabel: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  recDur: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.recording.play,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnOn: { backgroundColor: colors.text.primary },
  summaryCard: { marginTop: 12 },
  summaryText: { fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  summaryTime: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  editBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  transcriptInput: {
    minHeight: 80,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeRowText: { flex: 1 },
  timeValue: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  splitPicker: { flexDirection: 'row', gap: 8, marginTop: 8 },
  splitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.backgroundAlt,
  },
  splitBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  doneEditBtn: { alignSelf: 'flex-end', marginTop: 8, padding: 4 },
  doneEditText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  mutedCenter: { textAlign: 'center', color: colors.text.secondary, marginTop: 8, fontSize: 14 },
  hintOk: { fontSize: 12, color: '#0D9488', marginTop: 6 },
  warnText: { fontSize: 12, color: '#C2410C', marginTop: 6, lineHeight: 18 },
  errorText: { fontSize: 13, color: '#B91C1C' },
  retryBox: { marginTop: 10, padding: 8 },
  retryLink: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 4 },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  remindersSection: {
    flex: 1,
    minHeight: 140,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  remindersCard: {
    flex: 1,
    marginBottom: 0,
    overflow: 'hidden',
  },
  remindersCardEmpty: {
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  remindersList: { flex: 1 },
  remindersListContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 12 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text.secondary, textAlign: 'center' },
  emptySubtitle: {
    fontSize: 12,
    color: colors.text.light,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowMain: { flex: 1, marginRight: 8, minWidth: 0 },
  rowMainPast: { opacity: 0.58 },
  rowTranscript: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 4 },
  rowTranscriptPast: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  rowTime: { fontSize: 13, color: colors.text.primary },
  rowTimePast: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  rowMeta: { fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  rowMetaPast: { color: colors.text.light },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { padding: 6 },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  ctaButton: { minHeight: 56, borderRadius: 14 },
  ctaButtonLabel: { fontSize: 17, fontWeight: '800' },
  ctaHelper: { fontSize: 12, color: colors.text.secondary, textAlign: 'center', marginTop: 8 },
  iosPickerWrap: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  iosBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingTop: 8 },
  iosBarBtn: { fontSize: 16, fontWeight: '700', color: colors.primary },
  });
}

export default VoiceRemindersScreen;
