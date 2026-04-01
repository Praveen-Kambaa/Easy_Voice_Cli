import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  DeviceEventEmitter,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Mic, Music, Radio, Settings, Circle, ChevronRight, History, Languages, CircleHelp } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Colors } from '../../theme/Colors';
import { TIME_LABELS, USER } from '../../constants';
import { getLanguageName } from '../../constants/translationLanguages';
import {
  FloatingSpeechHistoryService,
  FLOATING_SPEECH_UPDATED_EVENT,
} from '../../services/FloatingSpeechHistoryService';
import { getTranslationHistory, TRANSLATION_HISTORY_UPDATED_EVENT } from '../../services/translationTextStorage';
import { getAiQaHistory, AI_QA_HISTORY_UPDATED_EVENT } from '../../services/aiQaStorage';
import { formatCompactDateTime } from '../../utils/dateTimeFormat';
import { useFloatingMic } from '../../hooks/useFloatingMic';

const RECENT_FEED_LIMIT = 14;

function mergeRecentFeed(speechAll, translations, qaList) {
  const rows = [];
  for (const e of speechAll || []) {
    rows.push({
      kind: 'speech',
      key: `sp_${e.id}`,
      sortAt: Date.parse(e.createdAt) || 0,
      data: e,
    });
  }
  for (const e of translations || []) {
    rows.push({
      kind: 'translation',
      key: `tr_${e.id}`,
      sortAt: Date.parse(e.createdAt) || 0,
      data: e,
    });
  }
  for (const e of qaList || []) {
    rows.push({
      kind: 'qa',
      key: `qa_${e.id}`,
      sortAt: Date.parse(e.createdAt) || 0,
      data: e,
    });
  }
  rows.sort((a, b) => b.sortAt - a.sortAt);
  return rows.slice(0, RECENT_FEED_LIMIT);
}

const HomeScreen = ({ navigation }) => {
  const [recentFeed, setRecentFeed] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const {
    isServiceActive,
    checkPermissions,
    handleMissingPermissions,
    needsPermissions,
    startFloatingMic,
    stopFloatingMic,
  } = useFloatingMic();

  const loadDashboard = useCallback(async () => {
    try {
      const [speechAll, translations, qaList] = await Promise.all([
        FloatingSpeechHistoryService.getAll(),
        getTranslationHistory(),
        getAiQaHistory(),
      ]);
      const speechNewestFirst = (speechAll || []).slice().reverse();
      setRecentFeed(mergeRecentFeed(speechNewestFirst, translations, qaList));
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
      if (Platform.OS === 'android') {
        checkPermissions();
      }
    }, [loadDashboard, checkPermissions]),
  );

  useEffect(() => {
    const a = DeviceEventEmitter.addListener(FLOATING_SPEECH_UPDATED_EVENT, loadDashboard);
    const b = DeviceEventEmitter.addListener(TRANSLATION_HISTORY_UPDATED_EVENT, loadDashboard);
    const c = DeviceEventEmitter.addListener(AI_QA_HISTORY_UPDATED_EVENT, loadDashboard);
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

  const openFeedDestination = (kind) => {
    if (kind === 'speech') {
      navigation.navigate('FloatingMicHistory');
    } else if (kind === 'translation') {
      navigation.navigate('Translator', { screen: 'TranslatorHistory' });
    } else {
      navigation.navigate('AskQuestion', { screen: 'AiQaHistory' });
    }
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
          {/* <View style={styles.heroStats}>
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
          </View> */}
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
        {/* Floating mic overlay — one-line toggle (Android); same behavior as Floating Mic screen */}
        {Platform.OS === 'android' ? (
          <TouchableOpacity
            style={[styles.floatingMicBtn, needsPermissions && styles.floatingMicBtnMuted]}
            onPress={() => {
              if (needsPermissions) {
                handleMissingPermissions();
                return;
              }
              if (isServiceActive) {
                stopFloatingMic();
              } else {
                startFloatingMic();
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.floatingMicBtnText} numberOfLines={1}>
              {needsPermissions
                ? 'Floating mic — tap to set up permissions'
                : isServiceActive
                  ? 'Floating Mic: On'
                  : 'Floating Mic: Off'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.floatingMicIosNote} numberOfLines={1}>
            Floating mic overlay is available on Android.
          </Text>
        )}

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

        <Text style={[styles.sectionTitle, styles.recentFeedSectionTitle]}>Recent transcripts</Text>
        <Text style={styles.recentFeedIntro}>
          What you spoke (floating mic), translations, and question &amp; answers — newest first.
        </Text>

        {recentFeed.length === 0 ? (
          <View style={styles.transcriptHintCard}>
            <Text style={styles.transcriptHintText}>
              Use the floating mic, Translator, or Ask Question; your text will show up here automatically.
            </Text>
          </View>
        ) : (
          recentFeed.map((item) => {
            const RowIcon =
              item.kind === 'speech' ? Mic : item.kind === 'translation' ? Languages : CircleHelp;
            const kindLabel =
              item.kind === 'speech' ? 'Speech' : item.kind === 'translation' ? 'Translation' : 'Q & A';

            let title = '';
            let subtitle = '';
            let metaTime = '';

            if (item.kind === 'speech') {
              title = item.data.text || '';
              subtitle = 'Floating mic';
              metaTime = formatCompactDateTime(item.data.createdAt);
            } else if (item.kind === 'translation') {
              const d = item.data;
              title = d.translatedText || '';
              const fromN = getLanguageName(d.fromCode);
              const toN = getLanguageName(d.toCode);
              subtitle = `${fromN} → ${toN}: ${d.sourceText || ''}`.trim();
              metaTime = formatCompactDateTime(d.createdAt);
            } else {
              const d = item.data;
              title = `Q: ${d.question || ''}`;
              subtitle = `A: ${d.answer || ''}`;
              metaTime = formatCompactDateTime(d.createdAt);
            }

            return (
              <TouchableOpacity
                key={item.key}
                style={styles.transcriptPreviewRow}
                onPress={() => openFeedDestination(item.kind)}
                activeOpacity={0.7}
              >
                <View style={styles.transcriptPreviewIcon}>
                  <RowIcon size={17} color={Colors.primary} strokeWidth={2} />
                </View>
                <View style={styles.transcriptPreviewBody}>
                  <Text style={styles.feedKindTag}>{kindLabel}</Text>
                  <Text style={styles.transcriptPreviewTitle} numberOfLines={item.kind === 'qa' ? 2 : 3}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.transcriptPreviewSubtitle} numberOfLines={item.kind === 'qa' ? 3 : 2}>
                      {subtitle}
                    </Text>
                  ) : null}
                  <Text style={styles.activityMeta}>{metaTime}</Text>
                </View>
                <ChevronRight size={16} color={Colors.text.light} strokeWidth={2} />
              </TouchableOpacity>
            );
          })
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

  floatingMicBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  floatingMicBtnMuted: {
    borderColor: Colors.primary + '55',
    backgroundColor: Colors.backgroundAlt,
  },
  floatingMicBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  floatingMicIosNote: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 14,
    textAlign: 'center',
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
    marginBottom: 14,
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
  recentFeedSectionTitle: {
    marginTop: 4,
  },
  recentFeedIntro: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 19,
    marginBottom: 12,
    marginTop: -4,
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

  feedKindTag: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
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
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
    lineHeight: 20,
  },
  transcriptPreviewSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 4,
  },

  activityMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
});

export default HomeScreen;
