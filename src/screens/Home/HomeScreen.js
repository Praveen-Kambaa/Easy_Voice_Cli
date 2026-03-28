import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Mic, Music, Radio, Settings, Circle, ChevronRight, History, Languages } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Colors } from '../../theme/Colors';
import { TIME_LABELS, USER } from '../../constants';
import NativeAudioService, { VOICE_RECORDINGS_UPDATED_EVENT } from '../../services/NativeAudioService';
import {
  FloatingSpeechHistoryService,
  FLOATING_SPEECH_UPDATED_EVENT,
} from '../../services/FloatingSpeechHistoryService';
import { formatTime, formatCompactDateTime } from '../../utils/dateTimeFormat';
import {
  getAllRecent,
  ACTIVITY_HISTORY_UPDATED_EVENT,
} from '../../services/appActivityHistoryService';

const CATEGORY_SHORT = {
  floating_mic: 'Floating mic',
  voice_recorder: 'Voice',
  recordings: 'Recordings',
  translator: 'Translate',
  settings: 'Settings',
};

const HomeScreen = ({ navigation }) => {
  const [recordings, setRecordings] = useState([]);
  const [speechPreview, setSpeechPreview] = useState([]);
  const [appActivityPreview, setAppActivityPreview] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [all, speechAll, recentActs] = await Promise.all([
        NativeAudioService.getAllRecordings(),
        FloatingSpeechHistoryService.getAll(),
        getAllRecent(12),
      ]);
      setRecordings(all.slice().reverse().slice(0, 5));
      setSpeechPreview(speechAll.slice().reverse().slice(0, 4));
      setAppActivityPreview(recentActs.slice(0, 8));
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard]),
  );

  useEffect(() => {
    const a = DeviceEventEmitter.addListener(FLOATING_SPEECH_UPDATED_EVENT, loadDashboard);
    const b = DeviceEventEmitter.addListener(VOICE_RECORDINGS_UPDATED_EVENT, loadDashboard);
    const c = DeviceEventEmitter.addListener(ACTIVITY_HISTORY_UPDATED_EVENT, loadDashboard);
    return () => {
      a.remove();
      b.remove();
      c.remove();
    };
  }, [loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const greeting = `${TIME_LABELS.getGreeting()}, ${USER.DEFAULT_NAME}`;

  const QUICK_ACTIONS = [
    { Icon: Mic, label: 'Voice Command', screen: 'VoiceRecorder', color: '#EF4444' },
    { Icon: Radio, label: 'Floating Mic', screen: 'FloatingMic', color: '#6366F1' },
    { Icon: Music, label: 'My Recordings', screen: 'RecordedAudio', color: '#10B981' },
    { Icon: History, label: 'Speech History', screen: 'FloatingMicHistory', color: '#0EA5E9' },
    { Icon: Languages, label: 'Translator', screen: 'Translator', color: '#38BDF8' },
    { Icon: Settings, label: 'Settings', screen: 'Settings', color: '#F59E0B' },
  ];

  return (
    <ScreenContainer>
      <AppHeader title="Home" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Hero greeting card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroGreeting}>{greeting}</Text>
              <Text style={styles.heroSubtitle}>Ready to give voice commands?</Text>
            </View>
            <View style={styles.heroMicWrap}>
              <Mic size={26} color="#FFFFFF" strokeWidth={1.8} />
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{recordings.length}</Text>
              <Text style={styles.heroStatLabel}>Total Recordings</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>
                {recordings.length > 0
                  ? formatDuration(recordings.reduce((sum, r) => sum + (r.duration || 0), 0))
                  : '0:00'}
              </Text>
              <Text style={styles.heroStatLabel}>Total Duration</Text>
            </View>
          </View>
        </View>

        {/* Start Recording CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('VoiceRecorder')}
          activeOpacity={0.85}
        >
          <Circle size={18} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.ctaBtnText}>Start Voice Command</Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.screen}
              style={styles.quickCard}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.75}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: action.color + '18' }]}>
                <action.Icon size={22} color={action.color} strokeWidth={1.8} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {appActivityPreview.length > 0 ? (
          <>
            <Text style={styles.sectionTitleActivity}>Latest actions</Text>
            <View style={styles.activityFeedCard}>
              {appActivityPreview.map((e) => (
                <View key={e.id} style={styles.activityFeedRow}>
                  <View style={styles.activityFeedDot} />
                  <View style={styles.activityFeedBody}>
                    <Text style={styles.activityFeedCategory}>
                      {CATEGORY_SHORT[e.category] || e.category}
                    </Text>
                    <Text style={styles.activityFeedLabel} numberOfLines={2}>
                      {e.label}
                    </Text>
                    {e.meta ? (
                      <Text style={styles.activityFeedMeta} numberOfLines={1}>
                        {e.meta}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.activityFeedTime}>{formatCompactDateTime(e.createdAt)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Floating mic transcripts (AsyncStorage via FloatingSpeechHistoryService) */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent transcripts</Text>
          {speechPreview.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('FloatingMicHistory')}>
              <Text style={styles.viewAllText}>View all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {speechPreview.length === 0 ? (
          <View style={styles.transcriptHintCard}>
            <Text style={styles.transcriptHintText}>
              Dictations from the floating mic are saved automatically and listed here.
            </Text>
          </View>
        ) : (
          speechPreview.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              style={styles.transcriptPreviewRow}
              onPress={() => navigation.navigate('FloatingMicHistory')}
              activeOpacity={0.7}
            >
              <View style={styles.transcriptPreviewIcon}>
                <History size={17} color={Colors.primary} strokeWidth={2} />
              </View>
              <View style={styles.transcriptPreviewBody}>
                <Text style={styles.transcriptPreviewTitle} numberOfLines={2}>
                  {entry.text}
                </Text>
                <Text style={styles.activityMeta}>{formatCompactDateTime(entry.createdAt)}</Text>
              </View>
              <ChevronRight size={16} color={Colors.text.light} strokeWidth={2} />
            </TouchableOpacity>
          ))
        )}

        {/* Recent Activity */}
        <View style={styles.sectionRowRecent}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recordings.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('RecordedAudio')}>
              <Text style={styles.viewAllText}>View all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {recordings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎤</Text>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptyDesc}>Your recent recordings will appear here.</Text>
          </View>
        ) : (
          recordings.map((rec, idx) => (
            <TouchableOpacity
              key={rec.id || idx}
              style={styles.activityItem}
              onPress={() => navigation.navigate('RecordedAudio')}
              activeOpacity={0.7}
            >
              <View style={styles.activityIconWrap}>
                <Music size={17} color={Colors.text.secondary} strokeWidth={1.8} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {rec.refinedTranscript || rec.rawTranscript || `Recording ${String(rec.id || '').slice(-6)}`}
                </Text>
                <Text style={styles.activityMeta}>
                  {formatTime(rec.createdAt)} · {formatDuration(rec.duration)}
                </Text>
              </View>
              <ChevronRight size={16} color={Colors.text.light} strokeWidth={2} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Hero
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    // marginBottom: 20,
  },
  heroGreeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  heroMicWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMicIcon: {
    fontSize: 22,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStatItem: {
    flex: 1,
  },
  heroStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  heroStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  heroStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
  },

  // CTA button
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.recording.active,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 28,
    shadowColor: Colors.recording.active,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnIcon: {
    fontSize: 20,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Quick actions
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  sectionTitleActivity: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
    marginTop: 6,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  quickCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  quickIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },

  activityFeedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 24,
  },
  activityFeedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  activityFeedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 5,
    flexShrink: 0,
  },
  activityFeedBody: {
    flex: 1,
    minWidth: 0,
  },
  activityFeedCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.light,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  activityFeedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  activityFeedMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  activityFeedTime: {
    fontSize: 11,
    color: Colors.text.light,
    flexShrink: 0,
    maxWidth: '32%',
    textAlign: 'right',
  },

  // Section header row
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionRowRecent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 20,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },

  transcriptHintCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 8,
  },
  transcriptHintText: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 19,
  },
  transcriptPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  transcriptPreviewIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transcriptPreviewBody: {
    flex: 1,
  },
  transcriptPreviewTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
    marginBottom: 2,
    lineHeight: 20,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 28,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
  },

  // Activity items
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  activityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  activityMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
});

export default HomeScreen;
