import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  Clipboard,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Mic,
  Activity,
  History,
  Bookmark,
  PhoneCall,
  Bell,
  Headphones,
  MessageSquare,
  Sparkles,
  Copy,
  Share2,
  Play,
  Square,
  Lightbulb,
  User,
  Volume2,
} from 'lucide-react-native';
import { AskAiIcon } from '../../components/common/AskAiIcon';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import { TIME_LABELS, USER } from '../../constants';
import VoiceRecorderScreen from '../VoiceRecorder/VoiceRecorderScreen';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import NativeAudioService, {
  VOICE_RECORDINGS_UPDATED_EVENT,
} from '../../services/NativeAudioService';
import {
  getByCategory,
  ActivityCategory,
  ACTIVITY_HISTORY_UPDATED_EVENT,
} from '../../services/appActivityHistoryService';
import { formatCompactDateTime } from '../../utils/dateTimeFormat';

const QUICK_SHORTCUTS = [
  {
    id: 'trans_saved',
    title: 'Saved Translations',
    Icon: Bookmark,
    onPress: (nav) => nav.navigate('TranslatorTab', { screen: 'TranslatorSaved' }),
  },
  {
    id: 'trans_hist',
    title: 'Translation History',
    Icon: History,
    onPress: (nav) => nav.navigate('TranslatorTab', { screen: 'TranslatorHistory' }),
  },
  {
    id: 'ai_saved',
    title: 'Saved Q&A',
    Icon: AskAiIcon,
    onPress: (nav) => nav.navigate('AskQuestionTab', { screen: 'AiQaSaved' }),
  },
  {
    id: 'ai_hist',
    title: 'Q&A History',
    Icon: AskAiIcon,
    onPress: (nav) => nav.navigate('AskQuestionTab', { screen: 'AiQaHistory' }),
  },
  {
    id: 'speech_hist',
    title: 'Speech History',
    Icon: Mic,
    onPress: (nav) => nav.navigate('FloatingMicHistory'),
  },
  {
    id: 'call_logs',
    title: 'Call Recordings',
    Icon: PhoneCall,
    onPress: (nav) => nav.navigate('CallLogs'),
  },
  {
    id: 'reminders',
    title: 'Voice Reminders',
    Icon: Bell,
    onPress: (nav) => nav.navigate('VoiceReminders'),
  },
  {
    id: 'recordings',
    title: 'My Recordings',
    Icon: Headphones,
    onPress: (nav) => nav.navigate('RecordedAudio'),
  },
];

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const showAlert = useAlert();
  const styles = useMemo(() => createHomeStyles(colors, isDark), [colors, isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const voiceCommandRef = useRef(null);
  const [homeRecording, setHomeRecording] = useState(false);
  const [homeElapsedMs, setHomeElapsedMs] = useState(0);
  const homeTimerRef = useRef(null);
  const homeStartRef = useRef(null);

  // Dynamic recent transcriptions
  const [recentItems, setRecentItems] = useState([]);
  const [playingId, setPlayingId] = useState(null);

  const loadRecentData = useCallback(async () => {
    try {
      const [recordings, acts] = await Promise.all([
        NativeAudioService.getAllRecordings(),
        getByCategory(ActivityCategory.VOICE_RECORDER, 20),
      ]);

      const combined = [];
      const seenTexts = new Set();

      for (const rec of (recordings || []).slice().reverse()) {
        const text = (rec.transcript || rec.name || '').trim();
        if (text) {
          combined.push({
            id: rec.id || rec.filePath || String(Math.random()),
            title: rec.name || 'Voice Recording',
            text: rec.transcript || 'Audio recorded',
            date: rec.createdAt || rec.date || Date.now(),
            duration: rec.duration ? `${Math.round(rec.duration)}s` : null,
            filePath: rec.filePath,
            status: rec.transcript ? 'Transcribed' : 'Recorded',
          });
          seenTexts.add(text.toLowerCase());
        }
      }

      for (const act of (acts || [])) {
        if (act.meta && !seenTexts.has(act.meta.trim().toLowerCase())) {
          combined.push({
            id: act.id,
            title: act.label || 'Voice Command',
            text: act.meta,
            date: act.createdAt,
            duration: null,
            filePath: null,
            status: 'Transcribed',
          });
          seenTexts.add(act.meta.trim().toLowerCase());
        }
      }

      combined.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setRecentItems(combined.slice(0, 5));
    } catch {
      setRecentItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecentData();
    }, [loadRecentData]),
  );

  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener(VOICE_RECORDINGS_UPDATED_EVENT, loadRecentData);
    const s2 = DeviceEventEmitter.addListener(ACTIVITY_HISTORY_UPDATED_EVENT, loadRecentData);
    return () => {
      s1.remove();
      s2.remove();
      if (NativeAudioService.isPlaying) {
        NativeAudioService.stopPlayback().catch(() => {});
      }
    };
  }, [loadRecentData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecentData();
    setRefreshing(false);
  };

  const handleTogglePlay = async (item) => {
    if (!item.filePath) {
      showAlert('Audio File', 'No audio file recorded for this entry.');
      return;
    }
    if (playingId === item.id) {
      await NativeAudioService.stopPlayback();
      setPlayingId(null);
      return;
    }
    setPlayingId(item.id);
    const res = await NativeAudioService.playRecording(item.filePath, () => {
      setPlayingId(null);
    });
    if (!res?.success) {
      setPlayingId(null);
      showAlert('Playback', res?.error || 'Could not play audio file.');
    }
  };

  const stopHomeTimer = useCallback(() => {
    if (homeTimerRef.current) clearInterval(homeTimerRef.current);
    homeTimerRef.current = null;
    homeStartRef.current = null;
    setHomeElapsedMs(0);
  }, []);

  const startHomeVoiceCommand = useCallback(async () => {
    if (homeRecording) return;
    if (!NativeAudioService.isNativeRecorderAvailable()) {
      showAlert(
        'Recording unavailable',
        'Rebuild the iOS app so audio recording is included:\nnpx expo run:ios --device',
      );
      return;
    }
    if (!voiceCommandRef.current?.startRecording) {
      showAlert('Recording unavailable', 'Voice recorder is still loading. Try again in a moment.');
      return;
    }
    const ok = await voiceCommandRef.current.startRecording();
    if (ok) {
      setHomeRecording(true);
      homeStartRef.current = Date.now();
      homeTimerRef.current = setInterval(() => {
        if (!homeStartRef.current) return;
        setHomeElapsedMs(Date.now() - homeStartRef.current);
      }, 200);
    }
  }, [homeRecording, showAlert]);

  const stopHomeVoiceCommand = useCallback(async () => {
    stopHomeTimer();
    setHomeRecording(false);
    await voiceCommandRef.current?.stopRecording?.();
  }, [stopHomeTimer]);

  useEffect(() => {
    return () => {
      stopHomeTimer();
    };
  }, [stopHomeTimer]);

  const displayName =
    (user?.name || user?.displayName || user?.username || user?.email || '').trim() || USER.DEFAULT_NAME;
  const greeting = `${TIME_LABELS.getGreeting()}, ${displayName}`;

  const name = greeting.split(',').slice(1).join(',').trim() || USER.DEFAULT_NAME;
  const greetingPrefix = greeting.replace(
    new RegExp(`,\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    ',',
  ).trim();

  const handleStartRecording = async () => {
    if (homeRecording) return;
    const ok = await voiceCommandRef.current?.startRecording?.();
    if (ok) {
      setHomeRecording(true);
      homeStartRef.current = Date.now();
      homeTimerRef.current = setInterval(() => {
        if (!homeStartRef.current) return;
        setHomeElapsedMs(Date.now() - homeStartRef.current);
      }, 200);
    }
  };

  const handleStopRecording = async () => {
    setHomeRecording(false);
    stopHomeTimer();
    await voiceCommandRef.current?.stopRecording?.();
  };

  const handleCopyText = (text) => {
    Clipboard.setString(text);
    showAlert('Copied', 'Transcript copied to clipboard.');
  };

  const handleShareText = async (text) => {
    try {
      await Share.share({ message: text });
    } catch {
      // share dismissed
    }
  };

  return (
    <ScreenContainer>
      <AppHeader
        title="Home"
        forceMenu
        showHomeBrand
        rightComponent={
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <User size={18} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Modern Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingTitle}>
            {greetingPrefix}{'\n'}
            <Text style={styles.greetingTitleAccent}>{name}</Text>
          </Text>
          <Text style={styles.greetingSub}>
            Your voice assistant is primed and ready for your requests.
          </Text>
        </View>

        {/* Primary Voice Card */}
        <View style={styles.primaryCard}>
          <View style={styles.voiceTopRow}>
            <View style={styles.voiceTopLeft}>
              <Text style={styles.primaryCardKicker}>VOICE COMMAND</Text>
              <Text style={styles.primaryCardTitle}>Voice Command</Text>
              <Text style={styles.primaryCardSub}>
                Tap to start recording, then stop & send.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.micOrb}
              onPress={handleStartRecording}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Start voice command"
            >
              <Mic size={24} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          {/* Waveform indicator pill */}
          <View style={styles.modelWaveRow}>
            <View style={styles.waveBars}>
              <View style={[styles.waveBar, { height: 10 }]} />
              <View style={[styles.waveBar, { height: 18 }]} />
              <View style={[styles.waveBar, { height: 14 }]} />
              <View style={[styles.waveBar, { height: 22 }]} />
              <View style={[styles.waveBar, { height: 12 }]} />
            </View>
            <Text style={styles.modelWaveText}>Model: Whisper v3 Turbo</Text>
          </View>

          {!homeRecording ? (
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handleStartRecording}
              activeOpacity={0.9}
            >
              <Activity size={18} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.ctaBtnText}>Start Voice Command</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.recordingRow}>
              <View style={styles.timerPill}>
                <View style={styles.redRecordingDot} />
                <Text style={styles.timerText}>
                  {Math.floor(homeElapsedMs / 60000)}:
                  {String(Math.floor((homeElapsedMs % 60000) / 1000)).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.stopBtnHome}
                onPress={handleStopRecording}
                activeOpacity={0.9}
              >
                <Text style={styles.stopBtnHomeText}>Stop & Transcribe</Text>
              </TouchableOpacity>
            </View>
          )}

          <VoiceRecorderScreen
            ref={voiceCommandRef}
            navigation={navigation}
            embedded
            homeEmbedded
          />
        </View>

        {/* Quick Shortcuts Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Shortcuts</Text>
          <View hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.sectionActionText}>Swipe for more</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {QUICK_SHORTCUTS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.promptChip}
              onPress={() => item.onPress(navigation)}
              activeOpacity={0.75}
            >
              <item.Icon size={15} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.promptChipText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recent Transcriptions Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Transcriptions</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('VoiceRecorderHistory')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.sectionActionText}>View All</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Recent Transcriptions List */}
        {recentItems.length > 0 ? (
          recentItems.map((item) => {
            const isPlayingThis = playingId === item.id;
            return (
              <View key={item.id} style={styles.transcriptionCard}>
                <View style={styles.transcriptionTopRow}>
                  <View style={styles.transcriptionIconBadge}>
                    <Volume2 size={18} color={colors.primary} strokeWidth={2.2} />
                  </View>
                  <View style={styles.transcriptionHeaderInfo}>
                    <Text style={styles.transcriptionTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.transcriptionTime}>
                      {formatCompactDateTime(item.date)}
                      {item.duration ? ` • ${item.duration}` : ''}
                    </Text>
                  </View>
                  <View style={styles.statusPillGreen}>
                    <Text style={styles.statusPillGreenText}>{item.status || 'Transcribed'}</Text>
                  </View>
                </View>

                <View style={styles.quoteBubble}>
                  <Text style={styles.quoteText} numberOfLines={3}>
                    “{item.text}”
                  </Text>
                </View>

                <View style={styles.transcriptionFooter}>
                  {item.filePath ? (
                    <TouchableOpacity
                      style={styles.playRecordedBtn}
                      onPress={() => handleTogglePlay(item)}
                      activeOpacity={0.8}
                    >
                      {isPlayingThis ? (
                        <Square size={14} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
                      ) : (
                        <Play size={14} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
                      )}
                      <Text style={styles.playRecordedText}>
                        {isPlayingThis ? 'Playing…' : (item.duration ? `${item.duration} recorded` : 'Play audio')}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.waveformPreview}>
                      <Volume2 size={15} color={colors.primary} strokeWidth={2.2} />
                      <View style={styles.miniWaveBars}>
                        <View style={[styles.miniBar, { height: 6 }]} />
                        <View style={[styles.miniBar, { height: 12 }]} />
                        <View style={[styles.miniBar, { height: 8 }]} />
                        <View style={[styles.miniBar, { height: 14 }]} />
                        <View style={[styles.miniBar, { height: 10 }]} />
                        <View style={[styles.miniBar, { height: 5 }]} />
                      </View>
                    </View>
                  )}

                  <View style={styles.footerActionIcons}>
                    <TouchableOpacity
                      onPress={() => handleCopyText(item.text)}
                      style={styles.iconActionBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityLabel="Copy transcript"
                    >
                      <Copy size={16} color={colors.text.secondary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleShareText(item.text)}
                      style={styles.iconActionBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityLabel="Share transcript"
                    >
                      <Share2 size={16} color={colors.text.secondary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Mic size={22} color={colors.primary} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyCardTitle}>No transcriptions yet</Text>
            <Text style={styles.emptyCardSub}>
              Tap &quot;Start Voice Command&quot; above to record voice and see dynamic transcriptions here.
            </Text>
          </View>
        )}

        {/* VOICE TIP Card */}
        <View style={styles.voiceTipCard}>
          <View style={styles.tipIconBadge}>
            <Lightbulb size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipKicker}>VOICE TIP</Text>
            <Text style={styles.tipText}>
              Say <Text style={styles.tipBold}>“Hey Easy, wrap up”</Text> to trigger audio summary
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

function createHomeStyles(colors, isDark) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 100,
      alignItems: 'stretch',
      gap: 16,
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    greetingBlock: {
      paddingTop: 4,
    },
    greetingTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.6,
      lineHeight: 34,
    },
    greetingTitleAccent: {
      color: colors.primary,
    },
    greetingSub: {
      marginTop: 6,
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    primaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.28 : 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    voiceTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      marginBottom: 12,
    },
    voiceTopLeft: {
      flex: 1,
    },
    primaryCardKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.1,
    },
    primaryCardTitle: {
      marginTop: 4,
      fontSize: 17,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    primaryCardSub: {
      marginTop: 4,
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    micOrb: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
    modelWaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#F1F5F9',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    waveBars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      height: 24,
    },
    waveBar: {
      width: 3.5,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    modelWaveText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    ctaBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    recordingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timerPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundAlt,
      borderRadius: 14,
      paddingVertical: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    redRecordingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.recording.active,
    },
    timerText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      fontVariant: ['tabular-nums'],
    },
    stopBtnHome: {
      flex: 1,
      backgroundColor: colors.recording.active,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopBtnHomeText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    sectionActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    chipsScroll: {
      gap: 10,
      paddingVertical: 2,
    },
    promptChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    promptChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    transcriptionCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    transcriptionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    transcriptionIconBadge: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    transcriptionHeaderInfo: {
      flex: 1,
    },
    transcriptionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    transcriptionTime: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    statusPillGreen: {
      backgroundColor: colors.badge.transcribedBg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    statusPillGreenText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.badge.transcribedText,
    },
    statusPillGray: {
      backgroundColor: colors.badge.exportedBg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    statusPillGrayText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.badge.exportedText,
    },
    quoteBubble: {
      marginTop: 10,
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    quoteText: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 18,
    },
    transcriptionFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
    },
    waveformPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    miniWaveBars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    miniBar: {
      width: 2.5,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    playRecordedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    playRecordedText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    footerActionIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconActionBtn: {
      padding: 4,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptyCardTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 4,
    },
    emptyCardSub: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260,
    },
    voiceTipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    tipIconBadge: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipContent: {
      flex: 1,
    },
    tipKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.1,
    },
    tipText: {
      marginTop: 2,
      fontSize: 12,
      color: colors.text.primary,
      lineHeight: 17,
    },
    tipBold: {
      fontWeight: '800',
      color: colors.primary,
    },
  });
}

export default HomeScreen;
