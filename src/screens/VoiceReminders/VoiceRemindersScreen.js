import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Calendar,
  Clock,
  Pencil,
  Lightbulb,
  Music2,
  Check,
  CheckCircle2,
  Bell,
  Repeat,
  Volume2,
  User,
} from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import NativeAudioService from '../../services/NativeAudioService';
import { useAlert } from '../../context/AlertContext';
import { formatCompactDateTime } from '../../utils/dateTimeFormat';
import { parseReminderFromTranscript } from '../../utils/parseSpokenDateTime';
import { transcribeBySettings } from '../../services/transcribeService';
import { getAiEngineProvider } from '../../services/aiEngineConfig';
import { transcribeWithGroq } from '../../services/groqService';
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

async function transcribeForReminder(filePath) {
  const aiEngine = await getAiEngineProvider();
  if (aiEngine === 'groq') {
    const groqRes = await transcribeWithGroq(filePath, 'en');
    const t = groqRes?.refinedTranscript || groqRes?.rawTranscript || groqRes?.transcript;
    if (t && String(t).trim()) return String(t).trim();
    throw new Error('Groq transcription returned empty text');
  }
  const result = await transcribeBySettings(filePath, {
    language: 'en-US',
    enablePunctuation: true,
    enableTimestamps: false,
  });
  if (result.success) {
    const t = result.data?.refinedTranscript || result.data?.rawTranscript;
    if (t && String(t).trim()) {
      return String(t).trim();
    }
  }
  throw new Error(result.error || 'Transcription failed');
}

function VoiceRemindersScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const showAlert = useAlert();

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pendingPath, setPendingPath] = useState('');
  const [pendingMeta, setPendingMeta] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcribeError, setTranscribeError] = useState(null);
  const [parseHint, setParseHint] = useState(null);
  const [parseError, setParseError] = useState(null);

  const [scheduledAt, setScheduledAt] = useState(() => addMinutes(new Date(), 30));
  const [picker, setPicker] = useState(null);
  const [editing, setEditing] = useState(false);

  // Full Volume Alarm switch state
  const [fullVolumeMode, setFullVolumeMode] = useState(true);

  const timerRef = useRef(null);
  const startMsRef = useRef(0);
  const draftEpochRef = useRef(0);
  const timePickedManuallyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await loadReminders();
      setReminders(list);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      initVoiceReminderNotifications().catch(() => {});
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (isRecording) {
      startMsRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const resetDraft = useCallback(() => {
    draftEpochRef.current += 1;
    timePickedManuallyRef.current = false;
    setPendingPath('');
    setPendingMeta(null);
    setTranscript('');
    setTranscribeError(null);
    setParseHint(null);
    setParseError(null);
    setEditing(false);
    setDuration(0);
    setScheduledAt(addMinutes(new Date(), 30));
  }, []);

  const applyParseFromText = useCallback((text, { updateScheduledTime }) => {
    const res = parseReminderFromTranscript(text, new Date());
    if (res.targetDate) {
      if (updateScheduledTime) {
        setScheduledAt(res.targetDate);
      }
      setParseHint(
        res.isDefaultFallback
          ? 'Defaulted to 30 min from now (no date/time detected).'
          : `Detected: ${res.matchedTimePhrase || 'time expression'}`,
      );
      setParseError(null);
    } else {
      setParseHint(null);
      setParseError('Could not read the date or time. Please edit or say the time clearly.');
    }
  }, []);

  const onRecord = async () => {
    if (isRecording) return;
    draftEpochRef.current += 1;
    const epoch = draftEpochRef.current;
    if (activePlayback) {
      await NativeAudioService.stopPlayback();
      setActivePlayback(null);
    }
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
        throw new Error('No words recognized. Try speaking a bit louder.');
      }
      timePickedManuallyRef.current = false;
      setTranscript(t);
      applyParseFromText(t, { updateScheduledTime: true });
    } catch (e) {
      if (epoch !== draftEpochRef.current) return;
      const msg = e?.message || 'Transcription failed';
      setTranscribeError(msg);
      showAlert('Transcription', msg);
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

  const onTogglePlayback = async (id, filePath) => {
    if (!filePath) {
      showAlert('Playback', 'Playing simulated chime audio (0:04)');
      return;
    }
    if (activePlayback?.id === id) {
      await NativeAudioService.stopPlayback();
      setActivePlayback(null);
      return;
    }
    if (activePlayback) {
      await NativeAudioService.stopPlayback();
    }
    setActivePlayback({ id });
    await NativeAudioService.playRecording(filePath, () => {
      setActivePlayback((a) => (a?.id === id ? null : a));
    });
  };

  const onDeleteReminder = (id) => {
    showAlert('Delete reminder', 'Are you sure you want to delete this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (activePlayback?.id === id) {
            await NativeAudioService.stopPlayback();
            setActivePlayback(null);
          }
          await removeVoiceReminder(id);
          await refresh();
        },
      },
    ]);
  };

  const onSaveReminder = async () => {
    if (!pendingPath || saving) return;
    const t = scheduledAt.getTime();
    if (Number.isNaN(t) || t <= Date.now()) {
      showAlert('Check time', 'The scheduled time must be in the future.');
      return;
    }
    setSaving(true);
    const res = await addVoiceReminder(pendingPath, scheduledAt, {
      transcript: transcript.trim(),
    });
    setSaving(false);
    if (!res.success) {
      showAlert('Reminder', res.error || 'Could not schedule reminder.');
      return;
    }
    await logActivity(ActivityCategory.VOICE_RECORDER, 'voice_reminder_scheduled', {
      label: 'Voice reminder scheduled',
      meta: transcript.trim() || undefined,
    });
    resetDraft();
    await refresh();
    showAlert('Scheduled', 'Your voice reminder has been set successfully!');
  };

  const handleTrySaying = (phrase) => {
    setTranscript(phrase);
    applyParseFromText(phrase, { updateScheduledTime: true });
    setPendingPath('simulated_memo.m4a');
    setPendingMeta({ duration: 4 });
  };

  const activeRemindersList = reminders;

  return (
    <ScreenContainer>
      <AppHeader
        title="Voice Reminders"
        showHomeBrand
        brandIcon={<Bell size={14} color={colors.primary} strokeWidth={2.4} />}
        forceMenu
        rightComponent={
          <View style={styles.headerRightRow}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => showAlert('Notifications', 'No unread reminder notifications.')}
              accessibilityLabel="Notifications"
            >
              <Bell size={20} color={colors.text.primary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileAvatarBtn}
              onPress={() => navigation.navigate('Profile')}
              accessibilityLabel="Profile"
            >
              <User size={18} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Subheader bar commented out to avoid duplicate Voice Reminders title */}
        {/*
        <View style={styles.subHeaderRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.subHeaderTitle}>Voice Reminders</Text>
          <View style={styles.subHeaderActions}>
            <TouchableOpacity
              style={styles.subHeaderIconBtn}
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <SlidersHorizontal size={19} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyPillBtn}
              onPress={() =>
                showAlert(
                  'Reminder History',
                  `You have ${reminders.length} active scheduled reminders recorded.`,
                )
              }
              activeOpacity={0.8}
            >
              <History size={14} color={colors.text.primary} strokeWidth={2.2} />
              <Text style={styles.historyPillText}>History</Text>
            </TouchableOpacity>
          </View>
        </View>
        */}

        {/* Info Card: Effortless Voice Alarms */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconBox}>
            <Lightbulb size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Effortless Voice Alarms</Text>
            <Text style={styles.infoDesc}>
              Speak your task and target time naturally. Voice Reminders trigger loud, persistent
              alarms so you never miss a beat.
            </Text>
          </View>
        </View>

        {/* Recording Card */}
        <View style={styles.recordCard}>
          <View style={styles.recordTopRow}>
            <TouchableOpacity
              style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
              onPress={isRecording ? onStop : onRecord}
              activeOpacity={0.88}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? (
                <Square size={22} color="#FFFFFF" strokeWidth={2.4} />
              ) : (
                <Mic size={26} color="#FFFFFF" strokeWidth={2.4} />
              )}
            </TouchableOpacity>

            <View style={styles.recordTextCol}>
              <Text style={styles.recordTitle}>
                {isRecording ? 'Listening…' : isTranscribing ? 'Parsing time…' : 'Tap to record'}
              </Text>
              <Text style={styles.recordSubtitle}>
                {isRecording
                  ? 'Speak your reminder clearly…'
                  : 'Ready to capture your schedule…'}
              </Text>
            </View>

            <View style={styles.timerPill}>
              <Text style={styles.timerPillText}>
                {isRecording ? NativeAudioService.formatDuration(duration) : '0:00'}
              </Text>
            </View>
          </View>

          {/* Mini Waveform visualization */}
          <View style={styles.waveBarsRow}>
            <View style={[styles.waveBar, { height: 10 }]} />
            <View style={[styles.waveBar, { height: 18 }]} />
            <View style={[styles.waveBar, { height: 12 }]} />
            <View style={[styles.waveBar, { height: 22 }]} />
            <View style={[styles.waveBar, { height: 15 }]} />
            <View style={[styles.waveBar, { height: 8 }]} />
            <View style={[styles.waveBar, { height: 14 }]} />
            <View style={[styles.waveBar, { height: 6 }]} />
          </View>

          {/* Try Saying Prompts */}
          <View style={styles.trySayingWrap}>
            <Text style={styles.trySayingKicker}>TRY SAYING:</Text>
            <TouchableOpacity
              style={styles.sayingChip}
              onPress={() => handleTrySaying('Take medicine daily at 8 PM')}
              activeOpacity={0.78}
            >
              <View style={styles.sayingUserIcon}>
                <User size={13} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.sayingChipText}>&ldquo;Take medicine daily at 8 PM&rdquo;</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sayingChip}
              onPress={() => handleTrySaying('Call dentist tomorrow 10 AM')}
              activeOpacity={0.78}
            >
              <View style={styles.sayingUserIcon}>
                <User size={13} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.sayingChipText}>&ldquo;Call dentist tomorrow 10 AM&rdquo;</Text>
            </TouchableOpacity>
          </View>

          {/* Editable Draft Preview if text was spoken or chosen */}
          {!!transcript && (
            <View style={styles.draftBox}>
              <View style={styles.draftHeader}>
                <Text style={styles.draftKicker}>PARSED REMINDER</Text>
                <TouchableOpacity onPress={() => setEditing(!editing)}>
                  <Pencil size={15} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {editing ? (
                <TextInput
                  style={styles.draftInput}
                  value={transcript}
                  onChangeText={setTranscript}
                  multiline
                />
              ) : (
                <Text style={styles.draftText}>{transcript}</Text>
              )}
              <View style={styles.draftTimeRow}>
                <Clock size={13} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.draftTimeText}>{formatCompactDateTime(scheduledAt)}</Text>
              </View>
              <TouchableOpacity
                style={styles.setReminderBtn}
                onPress={onSaveReminder}
                disabled={saving}
                activeOpacity={0.88}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={16} color="#FFFFFF" strokeWidth={2.4} />
                    <Text style={styles.setReminderBtnText}>Confirm &amp; Schedule</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Scheduled Section */}
        <View style={styles.scheduledSection}>
          <View style={styles.scheduledHeader}>
            <View style={styles.scheduledTitleRow}>
              <Text style={styles.scheduledTitle}>Scheduled</Text>
              <View style={styles.activeCountBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.activeCountText}>
                  {activeRemindersList.length} Active
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() =>
                showAlert('Select All', 'All active reminders selected.')
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.selectAllText}>Select All</Text>
            </TouchableOpacity>
          </View>

          {/* Reminder Cards or Empty State */}
          {activeRemindersList.length === 0 ? (
            <View style={styles.emptyReminderCard}>
              <View style={styles.emptyReminderIconCircle}>
                <Clock size={24} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyReminderTitle}>No voice reminders scheduled</Text>
              <Text style={styles.emptyReminderSub}>
                Tap the record button above or try one of the suggestions to create a reminder.
              </Text>
            </View>
          ) : (
            activeRemindersList.map((item) => {
              const isPlaying = activePlayback?.id === item.id;
              const timeLabel = formatCompactDateTime(item.scheduledAt);
              const title = item.transcript || 'Voice Reminder';
              const badgeLabel = item.recurrence || 'One-time';
              const melodyText = item.melody || 'Alarm: Chime Melody';
              const memoDur = item.duration ? `${item.duration}s` : '0:04';

              return (
                <View key={item.id} style={styles.reminderCard}>
                  <View style={styles.reminderTopRow}>
                    <View style={styles.reminderTitleCol}>
                      <Text style={styles.reminderTitleText} numberOfLines={1}>
                        {title}
                      </Text>
                      <View style={styles.reminderPillsRow}>
                        <View style={styles.timePill}>
                          <Clock size={12} color="#FFFFFF" strokeWidth={2.4} />
                          <Text style={styles.timePillText}>{timeLabel}</Text>
                        </View>
                        <View style={styles.categoryPill}>
                          <Text style={styles.categoryPillText}>
                            {badgeLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.reminderActionButtons}>
                      <TouchableOpacity
                        style={styles.iconCircleBtn}
                        onPress={() => onTogglePlayback(item.id, item.filePath)}
                        activeOpacity={0.8}
                      >
                        {isPlaying ? (
                          <Pause size={14} color={colors.primary} strokeWidth={2.4} />
                        ) : (
                          <Play
                            size={14}
                            color={colors.primary}
                            strokeWidth={2.4}
                            fill={colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconCircleBtn}
                        onPress={() => onDeleteReminder(item.id)}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={14} color={colors.text.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Lower info row */}
                  <View style={styles.reminderBottomRow}>
                    <View style={styles.alarmMelodyRow}>
                      <Music2 size={13} color={colors.primary} strokeWidth={2.2} />
                      <Text style={styles.alarmMelodyText}>{melodyText}</Text>
                    </View>
                    <View style={styles.memoAttachedRow}>
                      <CheckCircle2 size={13} color="#15803D" strokeWidth={2.4} />
                      <Text style={styles.memoAttachedText}>
                        Voice memo attached ({memoDur})
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Full Volume Alarm Mode Banner */}
        <View style={styles.volumeBanner}>
          <View style={styles.volumeIconCircle}>
            <Volume2 size={20} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <View style={styles.volumeContent}>
            <Text style={styles.volumeTitle}>Full Volume Alarm Mode</Text>
            <Text style={styles.volumeSub}>Overrides Do Not Disturb • High Vibration</Text>
          </View>
          <Switch
            value={fullVolumeMode}
            onValueChange={setFullVolumeMode}
            trackColor={{ false: colors.switch?.trackOff || '#D1D5DB', true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {picker && (
        <DateTimePicker
          value={scheduledAt}
          mode={picker}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setPicker(null);
            if (date) {
              setScheduledAt(date);
            }
          }}
        />
      )}
    </ScreenContainer>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
      gap: 14,
    },
    bottomSpacer: {
      height: 28,
    },
    headerRightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerIconBtn: {
      padding: 6,
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderTitle: {
      flex: 1,
      marginLeft: 12,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
    },
    subHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    subHeaderIconBtn: {
      padding: 4,
    },
    historyPillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    infoIconBox: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoContent: {
      flex: 1,
    },
    infoTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 2,
    },
    infoDesc: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.text.secondary,
    },
    recordCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 10,
      elevation: 3,
    },
    recordTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    recordBtn: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: '#DC2626',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#DC2626',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 5,
    },
    recordBtnActive: {
      backgroundColor: '#991B1B',
    },
    recordTextCol: {
      flex: 1,
    },
    recordTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    recordSubtitle: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    timerPill: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    timerPillText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#DC2626',
    },
    waveBarsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 2,
    },
    waveBar: {
      width: 3.5,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    trySayingWrap: {
      gap: 8,
      paddingTop: 4,
    },
    trySayingKicker: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 1.1,
    },
    sayingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.1)' : '#EFF6FF',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#DBEAFE',
    },
    sayingUserIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sayingChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    draftBox: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      gap: 8,
    },
    draftHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    draftKicker: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1,
    },
    draftText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      lineHeight: 18,
    },
    draftInput: {
      fontSize: 13,
      color: colors.text.primary,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    draftTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    draftTimeText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    setReminderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 10,
      borderRadius: 14,
      marginTop: 4,
    },
    setReminderBtnText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    scheduledSection: {
      gap: 12,
    },
    scheduledHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    scheduledTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    scheduledTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    activeCountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    greenDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    activeCountText: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    selectAllText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    reminderCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    reminderTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    reminderTitleCol: {
      flex: 1,
      paddingRight: 10,
    },
    reminderTitleText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 6,
    },
    reminderPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    timePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#0F56B3',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
    },
    timePillText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    categoryPill: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    categoryPillRed: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
    },
    categoryPillBlue: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
    },
    categoryPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    categoryPillTextRed: {
      color: '#DC2626',
    },
    categoryPillTextBlue: {
      color: colors.primary,
    },
    reminderActionButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconCircleBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.14)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reminderBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
    },
    alarmMelodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    alarmMelodyText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    memoAttachedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    memoAttachedText: {
      fontSize: 11,
      color: isDark ? '#4ADE80' : '#15803D',
      fontWeight: '700',
    },
    volumeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    volumeIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    volumeContent: {
      flex: 1,
    },
    volumeTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    volumeSub: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    emptyReminderCard: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 12,
    },
    emptyReminderIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptyReminderTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    emptyReminderSub: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
  });
}

export default VoiceRemindersScreen;
