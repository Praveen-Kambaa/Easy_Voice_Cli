import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, RefreshControl, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NativeAudioService from '../services/NativeAudioService';
import { voiceApi } from '../api/voiceApi';

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
      const storedRecordings = await NativeAudioService.getAllRecordings();
      setRecordings(storedRecordings.reverse()); // Show newest first
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
    } catch (error) {
      Alert.alert('Error', 'Failed to play audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handlePause = async (recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'paused' }));
      const result = await NativeAudioService.pausePlayback();
      
      if (!result.success) {
        setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pause audio');
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
    }
  };

  const handleStop = async (recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      const result = await NativeAudioService.stopPlayback();
      
      if (!result.success) {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
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
                Alert.alert('Success', 'Recording deleted successfully');
              } else {
                Alert.alert('Error', result.error);
              }
            } catch (error) {
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
      // Check if transcript has changed
      const originalTranscript = recording.refinedTranscript || recording.rawTranscript;
      const hasChanged = transcriptText.trim() !== originalTranscript;

      if (hasChanged) {
        // Update transcript via API
        const updateResult = await voiceApi.updateTranscript(recording.voiceAssetId, transcriptText.trim());
        
        if (updateResult.success) {
          // Update local recording
          const updatedRecording = {
            ...recording,
            refinedTranscript: transcriptText.trim(),
            updatedAt: new Date().toISOString(),
          };
          
          await NativeAudioService.updateRecordingTranscript(recording.id, updatedRecording);
          
          // Update recordings list
          setRecordings(prev => prev.map(r => r.id === recording.id ? updatedRecording : r));
          
          Alert.alert('Success', 'Transcript updated successfully!');
        } else {
          Alert.alert('Error', updateResult.error);
          return;
        }
      }

      setEditingTranscript(null);
      setTranscriptText('');
    } catch (error) {
      Alert.alert('Error', 'Failed to save transcript');
    }
  };

  const handleExecuteVoiceCommand = async (recording) => {
    try {
      setExecutingStates(prev => ({ ...prev, [recording.id]: true }));

      // Get current transcript text (either from editing state or saved transcript)
      const currentTranscript = isEditing ? transcriptText.trim() : (recording.refinedTranscript || recording.rawTranscript);
      const originalTranscript = recording.rawTranscript;
      
      console.log('[RecordedAudioScreen] Executing voice command');
      console.log('[RecordedAudioScreen] Original transcript:', originalTranscript);
      console.log('[RecordedAudioScreen] Current transcript:', currentTranscript);
      console.log('[RecordedAudioScreen] Is editing:', isEditing);

      let voiceAssetId = recording.voiceAssetId;
      let hasChanged = currentTranscript !== originalTranscript;

      // If transcript has changed and we're not in edit mode, update it first
      if (hasChanged && !isEditing && recording.voiceAssetId) {
        console.log('[RecordedAudioScreen] Transcript changed, updating with PUT first');
        const updateResult = await voiceApi.updateTranscript(recording.voiceAssetId, currentTranscript);
        
        if (updateResult.success) {
          voiceAssetId = updateResult.data.voiceAssetId;
          console.log('[RecordedAudioScreen] Transcript updated successfully');
          
          // Update local recording state
          const updatedRecording = {
            ...recording,
            refinedTranscript: currentTranscript,
            updatedAt: new Date().toISOString(),
          };
          
          await NativeAudioService.updateRecordingTranscript(recording.id, updatedRecording);
          setRecordings(prev => prev.map(r => r.id === recording.id ? updatedRecording : r));
        } else {
          throw new Error(`Failed to update transcript: ${updateResult.error}`);
        }
      }
      
      // If in edit mode, save first then execute
      if (isEditing) {
        console.log('[RecordedAudioScreen] In edit mode, saving transcript first');
        await handleSaveTranscript(recording);
        // Get the updated voiceAssetId after saving
        const updatedRecording = recordings.find(r => r.id === recording.id);
        voiceAssetId = updatedRecording?.voiceAssetId || recording.voiceAssetId;
      }

      // Execute voice command with POST
      console.log('[RecordedAudioScreen] Executing voice command with POST');
      const executeResult = await voiceApi.executeVoiceCommand(voiceAssetId, {
        timestamp: new Date().toISOString(),
      });

      if (executeResult.success) {
        console.log('[RecordedAudioScreen] Command executed successfully');
        Alert.alert(
          'Command Executed! 🎉',
          `Your voice command has been processed successfully.\n\n${hasChanged ? '(Transcript was updated before execution)' : '(Original transcript used)'}`,
          [
            { text: 'OK', style: 'cancel' },
            { text: 'View Result', onPress: () => console.log('Navigate to result screen') }
          ]
        );
      } else {
        throw new Error(executeResult.error);
      }
    } catch (error) {
      console.error('[RecordedAudioScreen] Execution failed:', error);
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
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
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
      <View style={styles.recordingItem}>
        <View style={styles.recordingInfo}>
          <View style={styles.recordingHeader}>
            <Text style={styles.recordingEmoji}>🎵</Text>
            <View style={styles.recordingDetails}>
              <Text style={styles.recordingName}>Recording {item.id.slice(-6)}</Text>
              <Text style={styles.recordingDate}>{formatDate(item.createdAt)}</Text>
            </View>
          </View>
          
          <View style={styles.recordingMeta}>
            <View style={styles.durationBadge}>
              <Text style={styles.durationEmoji}>⏱️</Text>
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
            <View style={styles.formatBadge}>
              <Text style={styles.formatText}>M4A</Text>
            </View>
          </View>
        </View>

        {/* Transcript Section */}
        {(item.rawTranscript || item.refinedTranscript) && (
          <View style={styles.transcriptSection}>
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  style={styles.transcriptInput}
                  multiline
                  value={transcriptText}
                  onChangeText={setTranscriptText}
                  placeholder="Edit transcript..."
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editButton, styles.saveButton]}
                    onPress={() => handleSaveTranscript(item)}
                  >
                    <Text style={styles.editButtonText}>💾 Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.sendButton]}
                    onPress={() => handleExecuteVoiceCommand(item)}
                    disabled={executingStates[item.id]}
                  >
                    {executingStates[item.id] ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.editButtonText}>📤 Send</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.cancelButton]}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.editButtonText}>❌ Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.transcriptDisplay}>
                <Text style={styles.transcriptLabel}>📝 Transcript:</Text>
                <Text style={styles.transcriptText}>
                  {item.refinedTranscript || item.rawTranscript}
                </Text>
                <View style={styles.transcriptActions}>
                  <TouchableOpacity
                    style={styles.editTranscriptButton}
                    onPress={() => handleEditTranscript(item)}
                  >
                    <Text style={styles.editTranscriptText}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editTranscriptButton, styles.sendTranscriptButton]}
                    onPress={() => handleExecuteVoiceCommand(item)}
                    disabled={executingStates[item.id]}
                  >
                    {executingStates[item.id] ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <Text style={styles.editTranscriptText}>📤 Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.recordingActions}>
          <View style={styles.playbackControls}>
            {playingState === 'playing' ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.pauseButton]}
                onPress={() => handlePause(item.id)}
              >
                <Text style={styles.buttonEmoji}>⏸️</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, styles.playButton]}
                onPress={() => handlePlay(item.filePath, item.id)}
              >
                <Text style={styles.buttonEmoji}>▶️</Text>
              </TouchableOpacity>
            )}
            
            {playingState !== 'stopped' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.stopButton]}
                onPress={() => handleStop(item.id)}
              >
                <Text style={styles.buttonEmoji}>⏹️</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.moreActions}>
            {item.voiceAssetId && (
              <TouchableOpacity
                style={[styles.actionButton, styles.executeButton]}
                onPress={() => handleExecuteVoiceCommand(item)}
                disabled={isExecuting || isEditing}
              >
                {isExecuting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonEmoji}>⚡</Text>
                )}
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDelete(item.id)}
            >
              <Text style={styles.buttonEmoji}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎤</Text>
      <Text style={styles.emptyTitle}>No Recordings Yet</Text>
      <Text style={styles.emptyDescription}>
        Start recording your voice to see them here!
      </Text>
      <TouchableOpacity
        style={styles.recordButton}
        onPress={() => navigation.navigate('VoiceRecorder')}
      >
        <Text style={styles.recordEmoji}>🎙️</Text>
        <Text style={styles.recordButtonText}>Start Recording</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <Text style={styles.headerIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Recordings</Text>
        <TouchableOpacity onPress={() => navigation.navigate('VoiceRecorder')}>
          <Text style={styles.headerIcon}>➕</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={recordings}
        renderItem={renderRecordingItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerIcon: {
    fontSize: 24,
  },
  listContainer: {
    padding: 20,
  },
  recordingItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  recordingInfo: {
    marginBottom: 16,
  },
  recordingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordingDetails: {
    flex: 1,
    marginLeft: 12,
  },
  recordingEmoji: {
    fontSize: 24,
  },
  recordingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  recordingDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  recordingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  durationText: {
    fontSize: 12,
    color: '#6B7280',
  },
  formatBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  formatText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  recordingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonEmoji: {
    fontSize: 18,
  },
  playButton: {
    backgroundColor: '#10B981',
  },
  pauseButton: {
    backgroundColor: '#F59E0B',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  uploadButton: {
    backgroundColor: '#3B82F6',
  },
  deleteButton: {
    backgroundColor: '#6B7280',
  },
  executeButton: {
    backgroundColor: '#8B5CF6',
  },
  // Transcript UI Styles
  transcriptSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  transcriptDisplay: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
  },
  transcriptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  transcriptText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    marginBottom: 12,
  },
  editTranscriptButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EBF5FF',
    borderRadius: 6,
  },
  editTranscriptText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  transcriptActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  sendTranscriptButton: {
    backgroundColor: '#EBF5FF',
  },
  editContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  transcriptInput: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#10B981',
  },
  sendButton: {
    backgroundColor: '#3B82F6',
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  recordEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default RecordedAudioScreen;
