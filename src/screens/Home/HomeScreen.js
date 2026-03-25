import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { CircularProgress } from '../../components/common/CircularProgress';
import { Colors } from '../../theme/Colors';
import { TIME_LABELS, USER } from '../../constants';
import NativeAudioService from '../../services/NativeAudioService';

const HomeScreen = ({ navigation }) => {
  const [recordings, setRecordings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecordings = useCallback(async () => {
    try {
      const all = await NativeAudioService.getAllRecordings();
      setRecordings(all.slice().reverse().slice(0, 5));
    } catch {
      // Non-critical — just show empty list
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecordings();
    setRefreshing(false);
  };

  const handlePlanDetails = () => {
    Alert.alert('Plan Details', 'You are on the Free Plan. Upgrade to unlock unlimited recordings and more features.');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => {} },
    ]);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const greeting = `${TIME_LABELS.getGreeting()}, ${USER.DEFAULT_NAME}`;
  const usagePercentage = recordings.length > 0 ? Math.min(recordings.length * 10, 100) : 0;

  return (
    <ScreenContainer>
      <AppHeader
        title="My Workspace"
        showActions
        onPlanDetails={handlePlanDetails}
        onLogout={handleLogout}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.workspaceLabel}>My Workspace</Text>
          <Text style={styles.greetingText}>{greeting}</Text>
        </View>

        {/* Plan + Usage row */}
        <View style={styles.twoColumnRow}>
          {/* Current Plan */}
          <AppCard style={styles.halfCard}>
            <Text style={styles.cardLabel}>Current Plan</Text>
            <Text style={styles.planTitle}>{USER.DEFAULT_PLAN}</Text>
            <TouchableOpacity style={styles.upgradeLink} onPress={handlePlanDetails}>
              <Text style={styles.upgradeLinkText}>View Details →</Text>
            </TouchableOpacity>
          </AppCard>

          {/* Usage Progress */}
          <AppCard style={styles.halfCard}>
            <Text style={styles.cardLabel}>Usage Progress</Text>
            <View style={styles.usageRow}>
              <CircularProgress percentage={usagePercentage} size={64} />
              <View style={styles.usageInfo}>
                <Text style={styles.usageValue}>{recordings.length}</Text>
                <Text style={styles.usageSubLabel}>Recordings</Text>
              </View>
            </View>
          </AppCard>
        </View>

        {/* Voice Dictation Info */}
        <AppCard>
          <Text style={styles.voiceTitle}>Voice dictation in any app</Text>
          <Text style={styles.voiceDescription}>
            Record your voice and transcribe it instantly. Tap{' '}
            <Text style={styles.voiceHighlight}>Voice Recorder</Text>
            {' '}from the menu to get started.
          </Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => navigation.navigate('VoiceRecorder')}
            activeOpacity={0.8}
          >
            <Text style={styles.exploreButtonText}>Start Recording</Text>
          </TouchableOpacity>
        </AppCard>

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            {recordings.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('RecordedAudio')}>
                <Text style={styles.viewAllText}>View all</Text>
              </TouchableOpacity>
            )}
          </View>

          {recordings.length === 0 ? (
            <AppCard style={styles.emptyActivity}>
              <Text style={styles.emptyEmoji}>🎤</Text>
              <Text style={styles.emptyTitle}>No recordings yet</Text>
              <Text style={styles.emptyDescription}>
                Your recent recordings will appear here.
              </Text>
            </AppCard>
          ) : (
            recordings.map((rec, idx) => (
              <TouchableOpacity
                key={rec.id || idx}
                style={styles.activityItem}
                onPress={() => navigation.navigate('RecordedAudio')}
                activeOpacity={0.7}
              >
                <View style={styles.activityIconWrap}>
                  <Text style={styles.activityIcon}>🎵</Text>
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {rec.refinedTranscript || rec.rawTranscript || `Recording ${String(rec.id || '').slice(-4)}`}
                  </Text>
                  <Text style={styles.activityMeta}>
                    {formatDate(rec.createdAt)} · {formatDuration(rec.duration)}
                  </Text>
                </View>
                <Text style={styles.activityChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('VoiceRecorder')}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>🎙️</Text>
            <Text style={styles.quickActionLabel}>Record</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('RecordedAudio')}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>🎵</Text>
            <Text style={styles.quickActionLabel}>My Recordings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('FloatingMic')}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>🎤</Text>
            <Text style={styles.quickActionLabel}>Floating Mic</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>⚙️</Text>
            <Text style={styles.quickActionLabel}>Settings</Text>
          </TouchableOpacity>
        </View>
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

  greetingSection: {
    marginBottom: 20,
  },
  workspaceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },

  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 0,
  },
  halfCard: {
    flex: 1,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginBottom: 10,
  },
  planTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  upgradeLink: {
    alignSelf: 'flex-start',
  },
  upgradeLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  usageInfo: {
    flex: 1,
  },
  usageValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  usageSubLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },

  voiceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  voiceDescription: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  voiceHighlight: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  exploreButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  exploreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  activitySection: {
    marginBottom: 20,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  emptyActivity: {
    alignItems: 'center',
    paddingVertical: 28,
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
  emptyDescription: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
  },

  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  activityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityIcon: {
    fontSize: 18,
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
  activityChevron: {
    fontSize: 20,
    color: Colors.text.light,
    marginLeft: 8,
  },

  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickActionEmoji: {
    fontSize: 28,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
});

export default HomeScreen;
