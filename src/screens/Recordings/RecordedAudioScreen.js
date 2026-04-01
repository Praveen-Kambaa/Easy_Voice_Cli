import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { Play, Square, Music2, Trash2, Pencil, Zap, Plus } from 'lucide-react-native';
import NativeAudioService, { VOICE_RECORDINGS_UPDATED_EVENT } from '../../services/NativeAudioService';
import { voiceApi } from '../../api/voiceApi';
import { AppHeader } from '../../components/Header/AppHeader';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';
import { formatDateTime, formatCompactDateTime } from '../../utils/dateTimeFormat';
import {
  logActivity,
  ActivityCategory,
  getByCategory,
  ACTIVITY_HISTORY_UPDATED_EVENT,
} from '../../services/appActivityHistoryService';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';

const RecordedAudioScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const [recordings, setRecordings] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [playingStates, setPlayingStates] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [executingStates, setExecutingStates] = useState({});

  const loadRecordings = useCallback(async () => {
    try {
      const [stored, acts] = await Promise.all([
        NativeAudioService.getAllRecordings(),
        getByCategory(ActivityCategory.RECORDINGS, 30),
      ]);
      setRecordings(stored.reverse());
      setRecentActivities(acts);
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          loadRecordings();
          if (!isGlobalAlertModalVisible()) {
            setPlayingStates({});
            setEditingTranscript(null);
            setTranscriptText('');
            setExecutingStates({});
          }
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2 != null) {
          cancelAnimationFrame(raf2);
        }
        NativeAudioService.stopPlayback().catch(() => {});
        setPlayingStates({});
      };
    }, [loadRecordings]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(VOICE_RECORDINGS_UPDATED_EVENT, () => {
      loadRecordings();
    });
    const subAct = DeviceEventEmitter.addListener(ACTIVITY_HISTORY_UPDATED_EVENT, () => {
      loadRecordings();
    });
    return () => {
      sub.remove();
      subAct.remove();
    };
  }, [loadRecordings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecordings();
    setRefreshing(false);
  };

  const handlePlay = async (filePath, recordingId) => {
    try {
      // Stop any currently playing
      const current = Object.entries(playingStates).find(([, v]) => v === 'playing');
      if (current) {
        setPlayingStates(prev => ({ ...prev, [current[0]]: 'stopped' }));
        await NativeAudioService.stopPlayback();
      }
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'playing' }));

      // Pass onComplete callback — fires when native audio finishes naturally
      const result = await NativeAudioService.playRecording(filePath, () => {
        setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      });

      if (!result.success) {
        showAlert('Playback Error', result.error);
        setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      } else {
        await logActivity(ActivityCategory.RECORDINGS, 'playback_started', {
          label: 'Played recording',
          meta: `ID …${String(recordingId).slice(-6)}`,
        });
      }
    } catch {
      showAlert('Error', 'Failed to play audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handleStop = async (recordingId) => {
    setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    await NativeAudioService.stopPlayback();
    // stopPlayback already handles "no audio playing" silently
  };

  const handleDelete = async (recordingId) => {
    showAlert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await NativeAudioService.deleteRecording(recordingId);
              if (result.success) {
                await logActivity(ActivityCategory.RECORDINGS, 'recording_deleted', {
                  label: 'Recording deleted',
                  meta: `ID …${String(recordingId).slice(-6)}`,
                });
                await loadRecordings();
              } else {
                showAlert('Error', result.error);
              }
            } catch {
              showAlert('Error', 'Failed to delete recording');
            }
          },
        },
      ]
    );
  };

  const handleEditTranscript = (recording) => {
    setEditingTranscript(recording.id);
    setTranscriptText(recording.refinedTranscript || recording.rawTranscript || '');
  };

  const handleSaveTranscript = async (recording) => {
    try {
      const original = recording.refinedTranscript || recording.rawTranscript;
      const hasChanged = transcriptText.trim() !== original;
      if (hasChanged) {
        const updateResult = await voiceApi.updateTranscript(recording.voiceAssetId, transcriptText.trim());
        if (updateResult.success) {
          const updated = { ...recording, refinedTranscript: transcriptText.trim(), updatedAt: new Date().toISOString() };
          await NativeAudioService.updateRecordingTranscript(recording.id, updated);
          setRecordings(prev => prev.map(r => r.id === recording.id ? updated : r));
          showAlert('Saved', 'Transcript updated successfully.');
          await logActivity(ActivityCategory.RECORDINGS, 'transcript_updated', {
            label: 'Transcript saved',
            meta: transcriptText.trim().slice(0, 160),
          });
        } else {
          showAlert('Error', updateResult.error);
          return;
        }
      }
      setEditingTranscript(null);
      setTranscriptText('');
    } catch {
      showAlert('Error', 'Failed to save transcript');
    }
  };

  const handleExecuteVoiceCommand = async (recording) => {
    const isEditing = editingTranscript === recording.id;
    try {
      setExecutingStates(prev => ({ ...prev, [recording.id]: true }));
      const currentTranscript = isEditing
        ? transcriptText.trim()
        : recording.refinedTranscript || recording.rawTranscript;
      let voiceAssetId = recording.voiceAssetId;

      if (isEditing) {
        await handleSaveTranscript(recording);
        const updatedRec = recordings.find(r => r.id === recording.id);
        voiceAssetId = updatedRec?.voiceAssetId || recording.voiceAssetId;
      }

      const executeResult = await voiceApi.executeVoiceCommand(voiceAssetId, {
        transcript: currentTranscript,
        timestamp: new Date().toISOString(),
      });

      if (executeResult.success) {
        await logActivity(ActivityCategory.RECORDINGS, 'command_executed', {
          label: 'Voice command sent',
          meta: currentTranscript.slice(0, 160),
        });
        showAlert('Command Executed!', 'Voice command processed successfully.', [{ text: 'OK' }]);
      } else {
        throw new Error(executeResult.error);
      }
    } catch (error) {
      showAlert('Execution Failed', error.message || 'Failed to execute voice command');
    } finally {
      setExecutingStates(prev => ({ ...prev, [recording.id]: false }));
    }
  };

  const handleCancelEdit = () => {
    setEditingTranscript(null);
    setTranscriptText('');
  };

  const formatDuration = (milliseconds) => {
    const s = Math.floor((milliseconds || 0) / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const renderRecordingItem = ({ item, index }) => {
    const isPlaying = playingStates[item.id] === 'playing';
    const isEditing = editingTranscript === item.id;
    const isExecuting = executingStates[item.id] || false;
    const hasTranscript = !!(item.rawTranscript || item.refinedTranscript);

    return (
      <View style={styles.playerCard}>
        {/* Card top: track info + delete */}
        <View style={styles.trackHeader}>
          <View style={styles.trackIconCircle}>
            <Music2 size={18} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <View style={styles.trackMeta}>
            <Text style={styles.trackTitle}>Recording {String(item.id).slice(-6)}</Text>
            <Text style={styles.trackDate}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash2 size={14} color={Colors.recording.active} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Dark player bar */}
        <View style={styles.playerBar}>
          <View style={styles.playerLeft}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            <View style={styles.formatChip}>
              <Text style={styles.formatChipText}>M4A</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.playPauseBtn, isPlaying && styles.stopBtnStyle]}
            onPress={() => isPlaying ? handleStop(item.id) : handlePlay(item.filePath, item.id)}
            activeOpacity={0.8}
          >
            {isPlaying
              ? <Square size={15} color="#FFFFFF" strokeWidth={2} />
              : <Play size={15} color="#FFFFFF" strokeWidth={2} />}
            <Text style={styles.playPauseBtnLabel}>{isPlaying ? 'Stop' : 'Play'}</Text>
          </TouchableOpacity>

          {item.voiceAssetId && (
            <TouchableOpacity
              style={styles.executeBtn}
              onPress={() => handleExecuteVoiceCommand(item)}
              disabled={isExecuting || isEditing}
              activeOpacity={0.8}
            >
              {isExecuting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Zap size={13} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.executeBtnLabel}>Send</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Transcript section */}
        {hasTranscript && (
          <View style={styles.transcriptSection}>
            {isEditing ? (
              <>
                <TextInput
                  style={styles.transcriptInput}
                  multiline
                  value={transcriptText}
                  onChangeText={setTranscriptText}
                  placeholder="Edit transcript…"
                  placeholderTextColor={Colors.text.light}
                  autoFocus
                />
                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    style={[styles.editActionBtn, styles.saveBtn]}
                    onPress={() => handleSaveTranscript(item)}
                  >
                    <Text style={styles.saveActionText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editActionBtn, styles.sendEditBtn]}
                    onPress={() => handleExecuteVoiceCommand(item)}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.sendEditText}>Send</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editActionBtn, styles.cancelEditBtn]}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.transcriptLabel}>TRANSCRIPT</Text>
                <Text style={styles.transcriptBody} numberOfLines={3}>
                  {item.refinedTranscript || item.rawTranscript}
                </Text>
                <TouchableOpacity
                  style={styles.editTranscriptBtn}
                  onPress={() => handleEditTranscript(item)}
                >
                  <Pencil size={12} color={Colors.text.primary} strokeWidth={2} />
                  <Text style={styles.editTranscriptBtnText}>Edit Transcript</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderActivityFooter = () => {
    if (recentActivities.length === 0) return null;
    return (
      <View style={styles.activitySection}>
        <Text style={styles.activitySectionTitle}>Recent actions</Text>
        {recentActivities.map((a) => (
          <View key={a.id} style={styles.activityLogRow}>
            <View style={styles.activityLogMain}>
              <Text style={styles.activityLogLabel}>{a.label}</Text>
              {a.meta ? <Text style={styles.activityLogMeta} numberOfLines={2}>{a.meta}</Text> : null}
            </View>
            <Text style={styles.activityLogTime}>{formatCompactDateTime(a.createdAt)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Music2 size={40} color="#FFFFFF" strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>No Recordings Yet</Text>
      <Text style={styles.emptyDesc}>Start recording your voice to see them here</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('VoiceRecorder')}
        activeOpacity={0.85}
      >
        <Text style={styles.emptyBtnText}>🎙️  Start Recording</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="My Recordings"
        rightComponent={
          <TouchableOpacity
            onPress={() => navigation.navigate('VoiceRecorder')}
            style={styles.addBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={recordings}
        renderItem={renderRecordingItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderActivityFooter}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
    flexGrow: 1,
  },
  activitySection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  activitySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  activityLogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  activityLogMain: {
    flex: 1,
  },
  activityLogLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  activityLogMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  activityLogTime: {
    fontSize: 11,
    color: Colors.text.light,
    flexShrink: 0,
    maxWidth: '38%',
    textAlign: 'right',
  },

  // Player card
  playerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },

  // Track header
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 12,
    gap: 12,
  },
  trackIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackIconText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  trackMeta: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  trackDate: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.recording.activeBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteBtnText: {
    fontSize: 12,
    color: Colors.recording.active,
    fontWeight: '700',
  },

  // Dark player bar
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  playerLeft: {
    flex: 1,
    gap: 6,
  },
  durationText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  formatChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  formatChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.5,
  },
  playPauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.recording.play,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  stopBtnStyle: {
    backgroundColor: Colors.recording.active,
  },
  playPauseBtnIcon: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  playPauseBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  executeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
  },
  executeBtnIcon: {
    fontSize: 13,
  },
  executeBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Transcript section
  transcriptSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  transcriptLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.light,
    letterSpacing: 1,
    marginBottom: 8,
  },
  transcriptBody: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
    marginBottom: 10,
  },
  editTranscriptBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editTranscriptBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },

  // Edit mode
  transcriptInput: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: Colors.recording.play,
  },
  saveActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sendEditBtn: {
    backgroundColor: Colors.primary,
  },
  sendEditText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelEditBtn: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default RecordedAudioScreen;
