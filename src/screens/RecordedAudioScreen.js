import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AudioRecorderService from '../services/AudioRecorderService';
import { AudioStorageService } from '../services/AudioStorageService';
import { uploadAudio } from '../services/api/audioApi';

const RecordedAudioScreen = ({ navigation }) => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playingStates, setPlayingStates] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const storedRecordings = await AudioStorageService.getRecordings();
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
      const result = await AudioRecorderService.startPlayback(filePath);
      
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
      await AudioRecorderService.pausePlayback();
    } catch (error) {
      Alert.alert('Error', 'Failed to pause audio');
    }
  };

  const handleStop = async (recordingId) => {
    try {
      setPlayingStates(prev => ({ ...prev, [recordingId]: 'stopped' }));
      await AudioRecorderService.stopPlayback();
    } catch (error) {
      Alert.alert('Error', 'Failed to stop audio');
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
              const result = await AudioStorageService.deleteRecording(recordingId);
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

  const handleUpload = async (recording) => {
    try {
      setLoading(true);
      const result = await uploadAudio(recording.filePath);
      
      if (result.success) {
        Alert.alert('Success', 'Audio uploaded successfully!');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload audio');
    } finally {
      setLoading(false);
    }
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
            <TouchableOpacity
              style={[styles.actionButton, styles.uploadButton]}
              onPress={() => handleUpload(item)}
              disabled={loading}
            >
              <Text style={styles.buttonEmoji}>☁️</Text>
            </TouchableOpacity>
            
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
