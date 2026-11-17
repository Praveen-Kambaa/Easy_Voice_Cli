import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Clipboard,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Play,
  Pause,
  FileText,
  Share2,
  Copy,
  X,
  BadgeCheck,
  Volume2,
  Star,
  MoreVertical,
  Clock,
  Cloud,
  ListFilter,
  User,
  Bell,
} from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AskAiIcon } from '../../components/common/AskAiIcon';
import { useTheme } from '../../context/ThemeContext';
import { PhoneCallsModule } from '../../native/phoneCalls';
import { formatTime, formatDateOnly } from '../../utils/dateTimeFormat';
import NativeAudioService from '../../services/NativeAudioService';
import { useAlert } from '../../context/AlertContext';

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

function normalizePhone(p) {
  return String(p || '').replace(/\D+/g, '');
}

const CallLogsScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const showAlert = useAlert();

  const [callLogs, setCallLogs] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'recorded' | 'transcribed'
  const [refreshing, setRefreshing] = useState(false);
  const [recordingTranscriptMap, setRecordingTranscriptMap] = useState({});

  const [playingPath, setPlayingPath] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState('1.0x');
  const [transcriptModal, setTranscriptModal] = useState({
    visible: false,
    title: '',
    text: '',
  });

  const fetchCallLogs = useCallback(async () => {
    if (!PhoneCallsModule?.getCallLogs) return [];
    try {
      const logs = await PhoneCallsModule.getCallLogs(50);
      const arr = Array.isArray(logs) ? logs : [];
      setCallLogs(arr);
      return arr;
    } catch {
      return [];
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    if (!PhoneCallsModule?.getCallRecordings) return [];
    try {
      const recs = await PhoneCallsModule.getCallRecordings();
      const arr = Array.isArray(recs) ? recs : [];
      setRecordings(arr);
      return arr;
    } catch {
      return [];
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([fetchCallLogs(), fetchRecordings()]);
      const cache = await readCallTranscriptCache();
      setRecordingTranscriptMap(cache);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [fetchCallLogs, fetchRecordings]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      return () => {
        NativeAudioService.stopPlayback().catch(() => {});
        setPlayingPath(null);
      };
    }, [refreshAll]),
  );

  const togglePlayback = async (recPath) => {
    if (!recPath) {
      showAlert('Audio Playback', 'Playing simulated call audio (04:12)');
      return;
    }
    if (playingPath === recPath && NativeAudioService.isPlaying) {
      await NativeAudioService.stopPlayback();
      setPlayingPath(null);
      return;
    }
    setPlayingPath(recPath);
    await NativeAudioService.playRecording(recPath, () => {
      setPlayingPath(null);
    });
  };

  const handleCycleSpeed = () => {
    if (playbackSpeed === '1.0x') setPlaybackSpeed('1.5x');
    else if (playbackSpeed === '1.5x') setPlaybackSpeed('2.0x');
    else setPlaybackSpeed('1.0x');
  };

  const handleShareTranscript = async (text) => {
    try {
      await Share.share({ message: text });
    } catch {
      // dismissed
    }
  };

  const handleCopy = (text) => {
    Clipboard.setString(text);
    showAlert('Copied', 'Text copied to clipboard.');
  };

  // Determine call items based on activeFilter
  const displayCalls = useMemo(() => {
    let list = callLogs;
    if (activeFilter === 'recorded') {
      list = callLogs.filter((c) =>
        recordings.some((r) => normalizePhone(r.phoneNumber) === normalizePhone(c.phoneNumber)),
      );
    } else if (activeFilter === 'transcribed') {
      list = callLogs.filter((c) =>
        recordings.some((r) => r.audioPath && recordingTranscriptMap[r.audioPath]),
      );
    }
    return list;
  }, [callLogs, recordings, recordingTranscriptMap, activeFilter]);

  const totalCallsCount = callLogs.length;
  const recordedCallsCount = recordings.length;
  const transcribedCallsCount = Object.keys(recordingTranscriptMap).length;

  const featuredRecording = recordings[0] || null;
  const featuredCall = useMemo(() => {
    if (!featuredRecording) return null;
    const match = callLogs.find(
      (c) => normalizePhone(c.phoneNumber) === normalizePhone(featuredRecording.phoneNumber)
    );
    const txObj = featuredRecording.audioPath ? recordingTranscriptMap[featuredRecording.audioPath] : null;
    const txText = txObj?.refinedTranscript || txObj?.rawTranscript || '';
    return {
      contactName: match?.name || featuredRecording.contactName || 'Recorded Call',
      phoneNumber: match?.phoneNumber || featuredRecording.phoneNumber || '—',
      date: featuredRecording.timestamp ? new Date(featuredRecording.timestamp).toLocaleDateString() : '',
      time: featuredRecording.timestamp ? new Date(featuredRecording.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      duration: featuredRecording.duration ? `${Math.floor(featuredRecording.duration / 60)}:${String(featuredRecording.duration % 60).padStart(2, '0')}` : '0:00',
      audioPath: featuredRecording.audioPath,
      transcript: txText,
      summary: txText ? txText.slice(0, 120) : '',
    };
  }, [featuredRecording, callLogs, recordingTranscriptMap]);

  return (
    <ScreenContainer>
      <AppHeader
        title="Calls"
        showHomeBrand
        brandIcon={<Phone size={14} color={colors.primary} strokeWidth={2.4} />}
        forceMenu
        rightComponent={
          <View style={styles.headerRightRow}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => showAlert('Calls', 'Phone call recorder is ready and active.')}
              accessibilityLabel="Phone"
            >
              <Phone size={19} color={colors.text.primary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => showAlert('Notifications', 'No unread notifications.')}
              accessibilityLabel="Notifications"
            >
              <Bell size={19} color={colors.text.primary} strokeWidth={2.2} />
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refreshAll();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Subheader bar commented out to avoid duplicate Calls title and unwanted subheader */}
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
          <Text style={styles.subHeaderTitle}>Calls</Text>

          <View style={styles.autoRecordBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.autoRecordText}>Auto-Record ON</Text>
          </View>

          <View style={styles.subHeaderIcons}>
            <TouchableOpacity
              style={styles.subHeaderIconBtn}
              onPress={() => showAlert('Search', 'Search call history...')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Search size={18} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.subHeaderIconBtn}
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <SlidersHorizontal size={18} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
        */}

        {/* Filter Pills Row */}
        <View style={styles.filterPillsRow}>
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === 'all' && styles.filterPillTextActive,
              ]}
            >
              All Calls {totalCallsCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'recorded' && styles.filterPillActive]}
            onPress={() => setActiveFilter('recorded')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === 'recorded' && styles.filterPillTextActive,
              ]}
            >
              Recorded {recordedCallsCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'transcribed' && styles.filterPillActive]}
            onPress={() => setActiveFilter('transcribed')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === 'transcribed' && styles.filterPillTextActive,
              ]}
            >
              Transcribed {transcribedCallsCount}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hero Featured Call Card - only displayed if there is an actual recorded call */}
        {featuredCall ? (
          <View style={styles.heroCallCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.callerIconBoxGreen}>
                <PhoneIncoming size={20} color="#15803D" strokeWidth={2.4} />
              </View>

              <View style={styles.callerInfoCol}>
                <View style={styles.callerNameRow}>
                  <Text style={styles.callerName}>{featuredCall.contactName}</Text>
                  <BadgeCheck size={16} color={colors.primary} strokeWidth={2.4} />
                </View>
                <Text style={styles.callerPhone}>{featuredCall.phoneNumber}</Text>
              </View>

              <View style={styles.callTimestampCol}>
                <Text style={styles.callTime}>{featuredCall.time}</Text>
                <Text style={styles.callDate}>{featuredCall.date}</Text>
              </View>
            </View>

            {/* Badges row */}
            <View style={styles.metaBadgesRow}>
              <View style={styles.metaBadgeGray}>
                <Clock size={11} color={colors.text.secondary} strokeWidth={2} />
                <Text style={styles.metaBadgeGrayText}>{featuredCall.duration}</Text>
              </View>
              <View style={styles.metaBadgeBlue}>
                <Volume2 size={11} color={colors.primary} strokeWidth={2} />
                <Text style={styles.metaBadgeBlueText}>HD Audio</Text>
              </View>
            </View>

            {/* Audio Player Container */}
            <View style={styles.audioPlayerBox}>
              <TouchableOpacity
                style={styles.playerPlayBtn}
                onPress={() => togglePlayback(featuredCall.audioPath)}
                activeOpacity={0.88}
              >
                {playingPath === featuredCall.audioPath ? (
                  <Pause size={16} color="#FFFFFF" strokeWidth={2.4} />
                ) : (
                  <Play size={16} color="#FFFFFF" strokeWidth={2.4} fill="#FFFFFF" />
                )}
              </TouchableOpacity>

              <View style={styles.playerWaveform}>
                <View style={[styles.playerBar, styles.waveBarH8]} />
                <View style={[styles.playerBar, styles.waveBarH16]} />
                <View style={[styles.playerBar, styles.waveBarH22]} />
                <View style={[styles.playerBar, styles.waveBarH14]} />
                <View style={[styles.playerBar, styles.waveBarH26]} />
                <View style={[styles.playerBar, styles.waveBarH18]} />
                <View style={[styles.playerBar, styles.waveBarH10]} />
                <View style={[styles.playerBar, styles.waveBarH20]} />
                <View style={[styles.playerBar, styles.waveBarH14]} />
                <View style={[styles.playerBar, styles.waveBarH7]} />
              </View>

              <Text style={styles.playerTotalText}>
                {featuredCall.duration}
              </Text>

              <TouchableOpacity
                style={styles.speedChip}
                onPress={handleCycleSpeed}
                activeOpacity={0.8}
              >
                <Text style={styles.speedChipText}>{playbackSpeed}</Text>
              </TouchableOpacity>
            </View>

            {/* Player Actions Row */}
            {featuredCall.transcript ? (
              <View style={styles.playerActionsRow}>
                <TouchableOpacity
                  style={styles.playerActionBtn}
                  onPress={() =>
                    setTranscriptModal({
                      visible: true,
                      title: featuredCall.contactName,
                      text: featuredCall.transcript,
                    })
                  }
                  activeOpacity={0.8}
                >
                  <FileText size={14} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.playerActionText}>Transcript</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playerActionBtn}
                  onPress={() =>
                    setTranscriptModal({
                      visible: true,
                      title: 'Summary',
                      text: featuredCall.summary,
                    })
                  }
                  activeOpacity={0.8}
                >
                  <ListFilter size={14} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.playerActionText}>Summary</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playerActionBtn}
                  onPress={() => handleShareTranscript(featuredCall.transcript)}
                  activeOpacity={0.8}
                >
                  <Share2 size={14} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.playerActionText}>Share</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* AI Speech Recognition Highlight Box */}
            {featuredCall.transcript ? (
              <View style={styles.aiRecognitionBox}>
                <View style={styles.aiRecognitionHeader}>
                  <View style={styles.aiRecognitionLeft}>
                    <AskAiIcon size={14} />
                    <Text style={styles.aiRecognitionKicker}>AI Speech Recognition</Text>
                  </View>
                </View>
                <Text style={styles.aiTranscriptQuote}>
                  &ldquo;{featuredCall.transcript}&rdquo;
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Call Log Items List or Empty State */}
        {displayCalls.length === 0 ? (
          <View style={styles.emptyCallCard}>
            <PhoneIncoming size={28} color={colors.primary} strokeWidth={2.2} />
            <Text style={styles.emptyCallTitle}>No call logs recorded yet</Text>
            <Text style={styles.emptyCallSub}>
              {activeFilter === 'recorded'
                ? 'No calls with audio recordings found.'
                : activeFilter === 'transcribed'
                ? 'No calls with transcripts found.'
                : 'Incoming and outgoing calls with recording will appear here.'}
            </Text>
          </View>
        ) : (
          displayCalls.map((item, index) => {
            const isMissed = item.callType === 'missed';
            const isOutgoing = item.callType === 'outgoing';
            const Icon = isMissed ? PhoneMissed : isOutgoing ? PhoneOutgoing : PhoneIncoming;
            const iconBg = isMissed
              ? isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2'
              : isOutgoing
              ? isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF'
              : isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7';
            const iconColor = isMissed ? '#DC2626' : isOutgoing ? colors.primary : '#15803D';

            return (
              <View key={`call_${item.id || index}`} style={styles.callRowCard}>
                <View style={[styles.callRowIconWrap, { backgroundColor: iconBg }]}>
                  <Icon size={18} color={iconColor} strokeWidth={2.4} />
                </View>

                <View style={styles.callRowContent}>
                  <Text style={styles.callRowName} numberOfLines={1}>
                    {item.contactName || item.phoneNumber || 'Unknown'}
                  </Text>
                  <Text style={styles.callRowPhone} numberOfLines={1}>
                    {item.phoneNumber || '—'}
                  </Text>
                  <View style={styles.callRowSubDetails}>
                    {item.durationText ? (
                      <View style={styles.miniDurationRow}>
                        <Clock size={11} color={colors.text.secondary} strokeWidth={2} />
                        <Text style={styles.miniDurationText}>{item.durationText}</Text>
                      </View>
                    ) : null}
                    {item.badgeLabel ? (
                      <View
                        style={[
                          styles.miniBadge,
                          item.badgeType === 'red' && styles.miniBadgeRed,
                          item.badgeType === 'blue' && styles.miniBadgeBlue,
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniBadgeText,
                            item.badgeType === 'red' && styles.miniBadgeTextRed,
                            item.badgeType === 'blue' && styles.miniBadgeTextBlue,
                          ]}
                        >
                          {item.badgeLabel}
                        </Text>
                      </View>
                    ) : item.typeLabel ? (
                      <Text style={styles.typeLabelText}>{item.typeLabel}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.callRowRight}>
                  <Text style={styles.callRowTime}>{item.time || formatTime(item.timestamp)}</Text>
                  <Text style={styles.callRowDate}>
                    {item.date || formatDateOnly(item.timestamp)}
                  </Text>
                  <View style={styles.callRowButtons}>
                    {item.starred && (
                      <TouchableOpacity style={styles.starBtn}>
                        <Star size={15} color={colors.text.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                    {item.hasRecording || item.audioPath ? (
                      <TouchableOpacity
                        style={styles.playMiniBtn}
                        onPress={() => togglePlayback(item.audioPath)}
                      >
                        <Play size={13} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.moreMiniBtn}>
                        <MoreVertical size={16} color={colors.text.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Bottom indicator */}
        <View style={styles.bottomFooterInfo}>
          <View style={styles.dragBar} />
          <Text style={styles.bottomFooterText}>
            {`Showing ${displayCalls.length} of ${totalCallsCount} call${totalCallsCount === 1 ? '' : 's'}`}
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Transcript / Summary Modal */}
      <Modal
        visible={transcriptModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setTranscriptModal({ visible: false, title: '', text: '' })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {transcriptModal.title || 'Call Transcript'}
              </Text>
              <TouchableOpacity
                onPress={() => setTranscriptModal({ visible: false, title: '', text: '' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTranscriptText}>{transcriptModal.text}</Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCopyBtn}
                onPress={() => handleCopy(transcriptModal.text)}
              >
                <Copy size={15} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.modalCopyBtnText}>Copy Text</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setTranscriptModal({ visible: false, title: '', text: '' })}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      gap: 14,
    },
    bottomSpacer: {
      height: 8,
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
      fontSize: 19,
      fontWeight: '800',
      color: colors.text.primary,
      marginLeft: 10,
    },
    autoRecordBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      marginLeft: 6,
    },
    greenDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    autoRecordText: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    subHeaderIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginLeft: 'auto',
    },
    subHeaderIconBtn: {
      padding: 4,
    },
    filterPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
    },
    heroCallCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 10,
      elevation: 3,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    callerIconBoxGreen: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    callerInfoCol: {
      flex: 1,
    },
    callerNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    callerName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    callerPhone: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    callTimestampCol: {
      alignItems: 'flex-end',
    },
    callTime: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
    },
    callDate: {
      fontSize: 10,
      color: colors.text.secondary,
      marginTop: 2,
    },
    metaBadgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metaBadgeGray: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    metaBadgeGrayText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    metaBadgeBlue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.14)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    metaBadgeBlueText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    metaBadgeGreen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    metaBadgeGreenText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    audioPlayerBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.08)' : '#EFF6FF',
      borderRadius: 16,
      padding: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.2)' : '#DBEAFE',
    },
    playerPlayBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#0F56B3',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerWaveform: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    playerBar: {
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.primary,
    },
    playerElapsedText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text.primary,
    },
    playerTotalText: {
      fontSize: 10,
      color: colors.text.secondary,
    },
    speedChip: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    speedChipText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.primary,
    },
    volumeIconBtn: {
      padding: 2,
    },
    playerActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playerActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    playerActionText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.primary,
    },
    aiRecognitionBox: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      gap: 6,
    },
    aiRecognitionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    aiRecognitionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    aiRecognitionKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    accuracyBadge: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
    },
    accuracyBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    aiTranscriptQuote: {
      fontSize: 12,
      color: colors.text.primary,
      lineHeight: 18,
    },
    callsListSection: {
      gap: 10,
    },
    callRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 12,
    },
    callRowIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callRowContent: {
      flex: 1,
    },
    callRowName: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    callRowPhone: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 1,
    },
    callRowSubDetails: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    miniDurationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    miniDurationText: {
      fontSize: 10,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    miniBadge: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    miniBadgeRed: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
    },
    miniBadgeBlue: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
    },
    miniBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    miniBadgeTextRed: {
      color: '#DC2626',
    },
    miniBadgeTextBlue: {
      color: colors.primary,
    },
    typeLabelText: {
      fontSize: 10,
      color: colors.text.secondary,
    },
    callRowRight: {
      alignItems: 'flex-end',
      gap: 2,
    },
    callRowTime: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.primary,
    },
    callRowDate: {
      fontSize: 10,
      color: colors.text.secondary,
    },
    callRowButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    starBtn: {
      padding: 4,
    },
    playMiniBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreMiniBtn: {
      padding: 4,
    },
    bottomFooterInfo: {
      alignItems: 'center',
      paddingVertical: 12,
      gap: 6,
    },
    dragBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderLight,
    },
    bottomFooterText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 18,
      gap: 12,
      maxHeight: '75%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
      flex: 1,
    },
    modalBody: {
      maxHeight: 250,
    },
    modalTranscriptText: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.text.primary,
    },
    modalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingTop: 8,
    },
    modalCopyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
    },
    modalCopyBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    modalCloseBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
    },
    modalCloseBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    emptyCallCard: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 12,
    },
    emptyCallTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
      marginTop: 8,
    },
    emptyCallSub: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    waveBarH7: { height: 7 },
    waveBarH8: { height: 8 },
    waveBarH10: { height: 10 },
    waveBarH14: { height: 14 },
    waveBarH16: { height: 16 },
    waveBarH18: { height: 18 },
    waveBarH20: { height: 20 },
    waveBarH22: { height: 22 },
    waveBarH26: { height: 26 },
  });
}

export default CallLogsScreen;
