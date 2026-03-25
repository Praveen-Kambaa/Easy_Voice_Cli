import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import NativeAudioService from '../../services/NativeAudioService';
import { voiceApi } from '../../api/voiceApi';
import { AppHeader } from '../../components/Header/AppHeader';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { Colors } from '../../theme/Colors';

const RecordedAudioScreen = ({ navigation }) => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playingStates, setPlayingStates] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [executingStates, setExecutingStates] = useState({});

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const stored = await NativeAudioService.getAllRecordings();
      setRecordings(stored.reverse());
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecordings();
    setRefreshing(false);
  };

  const handlePlay = async (filePath, recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'playing' }));
      const result = await NativeAudioService.playRecording(filePath);
      if (!result.success) {
        Alert.alert('Error', result.error);
        setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      }
    } catch {
      Alert.alert('Error', 'Failed to play audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handlePause = async (recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'paused' }));
      const result = await NativeAudioService.pausePlayback();
      if (!result.success) setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    } catch {
      Alert.alert('Error', 'Failed to pause audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handleStop = async (recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      const result = await NativeAudioService.stopPlayback();
      if (!result.success) Alert.alert('Error', result.error);
    } catch {
      Alert.alert('Error', 'Failed to stop audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handleDelete = async (recordingId) => {
    Alert.alert(
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
                await loadRecordings();
                Alert.alert('Deleted', 'Recording deleted successfully');
              } else {
                Alert.alert('Error', result.error);
              }
            } catch {
              Alert.alert('Error', 'Failed to delete recording');
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
          Alert.alert('Success', 'Transcript updated successfully!');
        } else {
          Alert.alert('Error', updateResult.error);
          return;
        }
      }
      setEditingTranscript(null);
      setTranscriptText('');
    } catch {
      Alert.alert('Error', 'Failed to save transcript');
    }
  };

  const handleExecuteVoiceCommand = async (recording) => {
    const isEditing = editingTranscript === recording.id;
    try {
      setExecutingStates(prev => ({ ...prev, [recording.id]: true }));
      const currentTranscript = isEditing
        ? transcriptText.trim()
        : recording.refinedTranscript || recording.rawTranscript;
      const originalTranscript = recording.rawTranscript;
      let voiceAssetId = recording.voiceAssetId;
      let hasChanged = currentTranscript !== originalTranscript;

      if (hasChanged && !isEditing && recording.voiceAssetId) {
        const updateResult = await voiceApi.updateTranscript(recording.voiceAssetId, currentTranscript);
        if (updateResult.success) {
          voiceAssetId = updateResult.data.voiceAssetId;
          const updated = { ...recording, refinedTranscript: currentTranscript, updatedAt: new Date().toISOString() };
          await NativeAudioService.updateRecordingTranscript(recording.id, updated);
          setRecordings(prev => prev.map(r => r.id === recording.id ? updated : r));
        } else {
          throw new Error(`Failed to update transcript: ${updateResult.error}`);
        }
      }

      if (isEditing) {
        await handleSaveTranscript(recording);
        const updatedRec = recordings.find(r => r.id === recording.id);
        voiceAssetId = updatedRec?.voiceAssetId || recording.voiceAssetId;
      }

      const executeResult = await voiceApi.executeVoiceCommand(voiceAssetId, {
        timestamp: new Date().toISOString(),
      });

      if (executeResult.success) {
        Alert.alert(
          'Command Executed!',
          `Voice command processed successfully.\n\n${hasChanged ? '(Transcript was updated before execution)' : '(Original transcript used)'}`,
          [{ text: 'OK', style: 'cancel' }]
        );
      } else {
        throw new Error(executeResult.error);
      }
    } catch (error) {
      Alert.alert('Execution Failed', error.message || 'Failed to execute voice command');
    } finally {
      setExecutingStates(prev => ({ ...prev, [recording.id]: false }));
    }
  };

  const handleCancelEdit = () => {
    setEditingTranscript(null);
    setTranscriptText('');
  };

  const formatDuration = (milliseconds) => {
    const s = Math.floor(milliseconds / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderRecordingItem = ({ item }) => {
    const playingState = playingStates[item.id] || 'stopped';
    const isEditing = editingTranscript === item.id;
    const isExecuting = executingStates[item.id] || false;

    return (
      <AppCard style={styles.recordingCard}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Text style={styles.recordingEmoji}>🎵</Text>
          </View>
          <View style={styles.recordingDetails}>
            <Text style={styles.recordingName}>Recording {String(item.id).slice(-6)}</Text>
            <Text style={styles.recordingDate}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        {/* Meta badges */}
        <View style={styles.metaRow}>
          <View style={styles.durationBadge}>
            <Text style={styles.badgeText}>⏱ {formatDuration(item.duration)}</Text>
          </View>
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>M4A</Text>
          </View>
        </View>

        {/* Transcript section */}
        {(item.rawTranscript || item.refinedTranscript) && (
          <View style={styles.transcriptSection}>
            {isEditing ? (
              <>
                <TextInput
                  style={styles.transcriptInput}
                  multiline
                  value={transcriptText}
                  onChangeText={setTranscriptText}
                  placeholder="Edit transcript…"
                  autoFocus
                />
                <View style={styles.editActionsRow}>
                  <PrimaryButton
                    title="Save"
                    onPress={() => handleSaveTranscript(item)}
                    variant="ghost"
                    style={styles.editBtn}
                    textStyle={{ color: Colors.status.granted }}
                  />
                  <PrimaryButton
                    title="Send"
                    onPress={() => handleExecuteVoiceCommand(item)}
                    loading={executingStates[item.id]}
                    style={styles.editBtn}
                  />
                  <PrimaryButton
                    title="Cancel"
                    onPress={handleCancelEdit}
                    variant="danger"
                    style={styles.editBtn}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.transcriptLabel}>Transcript</Text>
                <Text style={styles.transcriptText} numberOfLines={3}>
                  {item.refinedTranscript || item.rawTranscript}
                </Text>
                <View style={styles.transcriptActionsRow}>
                  <TouchableOpacity
                    style={styles.smallActionBtn}
                    onPress={() => handleEditTranscript(item)}
                  >
                    <Text style={styles.smallActionText}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, styles.sendActionBtn]}
                    onPress={() => handleExecuteVoiceCommand(item)}
                    disabled={executingStates[item.id]}
                  >
                    {executingStates[item.id] ? (
                      <ActivityIndicator size="small" color={Colors.status.info} />
                    ) : (
                      <Text style={[styles.smallActionText, { color: Colors.status.info }]}>📤 Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Playback + action buttons */}
        <View style={styles.actionsRow}>
          <View style={styles.playbackRow}>
            {playingState === 'playing' ? (
              <TouchableOpacity style={[styles.iconBtn, styles.pauseBtn]} onPress={() => handlePause(item.id)}>
                <Text style={styles.iconBtnText}>⏸️</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.iconBtn, styles.playBtn]} onPress={() => handlePlay(item.filePath, item.id)}>
                <Text style={styles.iconBtnText}>▶️</Text>
              </TouchableOpacity>
            )}
            {playingState !== 'stopped' && (
              <TouchableOpacity style={[styles.iconBtn, styles.stopPlayBtn]} onPress={() => handleStop(item.id)}>
                <Text style={styles.iconBtnText}>⏹️</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.moreActionsRow}>
            {item.voiceAssetId && (
              <TouchableOpacity
                style={[styles.iconBtn, styles.executeBtn]}
                onPress={() => handleExecuteVoiceCommand(item)}
                disabled={isExecuting || isEditing}
              >
                {isExecuting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.iconBtnText}>⚡</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.iconBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
              <Text style={styles.iconBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppCard>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎤</Text>
      <Text style={styles.emptyTitle}>No Recordings Yet</Text>
      <Text style={styles.emptyDescription}>Start recording your voice to see them here!</Text>
      <TouchableOpacity
        style={styles.startBtn}
        onPress={() => navigation.navigate('VoiceRecorder')}
      >
        <Text style={styles.startBtnText}>🎙️  Start Recording</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.safeArea}>
      <AppHeader
        title="My Recordings"
        rightComponent={
          <TouchableOpacity
            onPress={() => navigation.navigate('VoiceRecorder')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.addIcon}>➕</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={recordings}
        renderItem={renderRecordingItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },
  addIcon: {
    fontSize: 22,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  recordingCard: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recordingEmoji: {
    fontSize: 20,
  },
  recordingDetails: {
    flex: 1,
  },
  recordingName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  recordingDate: {
    fontSize: 12,
    color: Colors.text.secondary,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  durationBadge: {
    backgroundColor: Colors.backgroundAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  formatBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  formatBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  transcriptSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginBottom: 12,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
    marginBottom: 10,
  },
  transcriptActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendActionBtn: {
    borderColor: Colors.status.infoBg,
    backgroundColor: Colors.status.infoBg,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },

  transcriptInput: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: 'top',
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    minHeight: 38,
    paddingVertical: 0,
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playbackRow: {
    flexDirection: 'row',
    gap: 8,
  },
  moreActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 16,
  },
  playBtn: { backgroundColor: Colors.recording.play },
  pauseBtn: { backgroundColor: Colors.recording.pause },
  stopPlayBtn: { backgroundColor: Colors.status.blocked },
  executeBtn: { backgroundColor: '#8B5CF6' },
  deleteBtn: { backgroundColor: Colors.backgroundAlt, borderWidth: 1, borderColor: Colors.border },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  startBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 10,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RecordedAudioScreen;
