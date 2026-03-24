import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NativeAudioService from '../services/NativeAudioService';
import { voiceApi } from '../api/voiceApi';
import RNFS from 'react-native-fs';

const VoiceRecorderScreen = ({ navigation }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);     // reserved for future pause-record
  const [duration, setDuration] = useState(0);
  const [filePath, setFilePath] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [transcriptError, setTranscriptError] = useState(null);
  
  // Edit and execution states
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [voiceAssetId, setVoiceAssetId] = useState(null);

  const [lastRecording, setLastRecording] = useState(null); // stores full recording data

  const recordingStartTime = useRef(null);
  const durationInterval = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef(null);

  // ─── Duration timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording && !isPaused) {
      durationInterval.current = setInterval(() => {
        if (recordingStartTime.current) {
          setDuration(Date.now() - recordingStartTime.current);
        }
      }, 100);
    } else {
      clearInterval(durationInterval.current);
    }
    return () => clearInterval(durationInterval.current);
  }, [isRecording, isPaused]);

  // ─── Pulse animation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording && !isPaused) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseRef.current.start();
    } else {
      if (pulseRef.current) {
        pulseRef.current.stop();
      }
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(durationInterval.current);
      NativeAudioService.forceCleanup();
    };
  }, []);

  // ─── Recording controls ───────────────────────────────────────────────────────

  const handleStart = async () => {
    setTranscript(null);
    setTranscriptError(null);

    const result = await NativeAudioService.startRecording();
    if (result.success) {
      recordingStartTime.current = Date.now();
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setFilePath(result.filePath);
    } else {
      Alert.alert('Recording Error', result.error || 'Failed to start recording');
    }
  };

  const handleStop = async () => {
    if (!isRecording) {
      return;
    }

    setIsTranscribing(true);

    const result = await NativeAudioService.stopRecording();

    clearInterval(durationInterval.current);
    recordingStartTime.current = null;
    setIsRecording(false);
    setIsPaused(false);

    if (!result.success) {
      await NativeAudioService.forceCleanup();
      setIsTranscribing(false);
      Alert.alert('Error', `Failed to stop recording: ${result.error}`);
      return;
    }

    setLastRecording(result.recordingData);
    setDuration(result.duration || 0);

    // Auto-transcribe
    await handleTranscription(result.filePath, result.recordingData);
  };

  // ─── Playback ─────────────────────────────────────────────────────────────────

  const handlePlayPause = async () => {
    const path = lastRecording?.filePath || filePath;
    if (!path) {
      Alert.alert('No Recording', 'Record something first before playing.');
      return;
    }

    if (isPlaying) {
      const r = await NativeAudioService.stopPlayback();
      if (r.success) {
        setIsPlaying(false);
      }
    } else {
      const r = await NativeAudioService.playRecording(path);
      if (r.success) {
        setIsPlaying(true);
        // When playback ends naturally, audioRecorderPlayer fires the listener
        // registered inside AudioService. We poll the flag here.
        const check = setInterval(() => {
          if (!NativeAudioService.isPlaying) {
            setIsPlaying(false);
            clearInterval(check);
          }
        }, 500);
      } else {
        Alert.alert('Playback Error', r.error || 'Failed to play recording');
      }
    }
  };

  // ─── Transcription ────────────────────────────────────────────────────────────

  const handleTranscription = async (audioFilePath, recordingData) => {
    try {
      console.log('[VoiceRecorderScreen] transcribing:', audioFilePath);

      // Final file check
      const absPath = audioFilePath.startsWith('file://')
        ? audioFilePath.slice(7)
        : audioFilePath;

      const exists = await RNFS.exists(absPath);
      if (!exists) {
        throw new Error('Audio file missing before upload: ' + absPath);
      }

      const result = await voiceApi.transcribeAudio(audioFilePath, {
        language: 'en-US',
        enablePunctuation: true,
        enableTimestamps: false,
      });

      if (result.success) {
        const { rawTranscript, refinedTranscript, voiceAssetId: assetId } = result.data;

        if (recordingData) {
          const updated = { ...recordingData, rawTranscript, refinedTranscript, voiceAssetId: assetId };
          await NativeAudioService.updateRecordingTranscript(recordingData.id, updated);
          setLastRecording(updated);
        }

        // Store transcript and voice asset ID for editing/execution
        const finalTranscript = refinedTranscript || rawTranscript;
        setTranscript(finalTranscript);
        setEditableTranscript(finalTranscript);
        setVoiceAssetId(assetId);
        setTranscriptError(null);
        
        // Directly show edit screen without alert
        setIsEditingTranscript(true);
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error) {
      console.error('[VoiceRecorderScreen] transcription error:', error);
      const msg = error.message || 'Transcription failed';
      setTranscriptError(msg);
      setTranscript(null);

      Alert.alert(
        '❌ Upload / Transcription Failed',
        msg,
        [
          {
            text: 'Save Without Transcription',
            onPress: () => {
              setIsTranscribing(false);
              setTranscriptError(null);
              Alert.alert('Saved', 'Recording saved locally without transcription.');
            },
          },
          {
            text: 'Retry',
            onPress: () =>
              handleTranscription(
                lastRecording?.filePath || filePath,
                lastRecording,
              ),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  // ─── Transcript Edit & Execute Handlers ───────────────────────────────────────

  const handleEditTranscript = () => {
    setIsEditingTranscript(true);
    setEditableTranscript(transcript);
  };

  const handleSaveTranscript = async () => {
    if (!voiceAssetId) {
      Alert.alert('Error', 'No voice asset ID available for update');
      return;
    }

    try {
      const hasChanged = editableTranscript.trim() !== transcript;
      
      if (hasChanged) {
        const updateResult = await voiceApi.updateTranscript(voiceAssetId, editableTranscript.trim());
        
        if (updateResult.success) {
          setTranscript(editableTranscript.trim());
          
          // Update local recording if exists
          if (lastRecording) {
            const updated = { ...lastRecording, refinedTranscript: editableTranscript.trim() };
            await NativeAudioService.updateRecordingTranscript(lastRecording.id, updated);
            setLastRecording(updated);
          }
          
          Alert.alert('Success', 'Transcript updated successfully!');
        } else {
          Alert.alert('Error', updateResult.error);
          return;
        }
      }

      setIsEditingTranscript(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to save transcript');
    }
  };

  const handleExecuteVoiceCommand = async () => {
    if (!voiceAssetId) {
      Alert.alert('Error', 'No voice asset ID available for execution');
      return;
    }

    try {
      setIsExecuting(true);

      const currentTranscript = isEditingTranscript ? editableTranscript.trim() : transcript;
      const hasChanged = currentTranscript !== transcript;

      console.log('[VoiceRecorderScreen] Executing voice command');
      console.log('[VoiceRecorderScreen] Original transcript:', transcript);
      console.log('[VoiceRecorderScreen] Current transcript:', currentTranscript);
      console.log('[VoiceRecorderScreen] Has changed:', hasChanged);

      let finalVoiceAssetId = voiceAssetId;

      // If transcript has changed, update it first
      if (hasChanged && isEditingTranscript) {
        console.log('[VoiceRecorderScreen] Transcript changed, updating with PUT first');
        const updateResult = await voiceApi.updateTranscript(voiceAssetId, currentTranscript);
        
        if (updateResult.success) {
          finalVoiceAssetId = updateResult.data.voiceAssetId;
          setVoiceAssetId(finalVoiceAssetId);
          setTranscript(currentTranscript);
          
          // Update local recording if exists
          if (lastRecording) {
            const updated = { ...lastRecording, refinedTranscript: currentTranscript };
            await NativeAudioService.updateRecordingTranscript(lastRecording.id, updated);
            setLastRecording(updated);
          }
          
          console.log('[VoiceRecorderScreen] Transcript updated successfully');
        } else {
          throw new Error(`Failed to update transcript: ${updateResult.error}`);
        }
      }

      // Execute voice command with POST
      console.log('[VoiceRecorderScreen] Executing voice command with POST');
      const executeResult = await voiceApi.executeVoiceCommand(finalVoiceAssetId, {
        timestamp: new Date().toISOString(),
      });

      if (executeResult.success) {
        console.log('[VoiceRecorderScreen] Command executed successfully');
        setIsEditingTranscript(false);
        
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
      console.error('[VoiceRecorderScreen] Execution failed:', error);
      Alert.alert('Execution Failed', error.message || 'Failed to execute voice command');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTranscript(false);
    setEditableTranscript(transcript);
  };

  // ─── Derived state ────────────────────────────────────────────────────────────

  const hasRecording = Boolean(lastRecording?.filePath || filePath);

  const statusText = isRecording
    ? isPaused
      ? '⏸️  Recording Paused'
      : '🎙️  Recording…'
    : '🎤  Ready to Record';

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.headerIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Recorder</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RecordedAudio')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.headerIcon}>🎵</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Recording card */}
        <Animated.View
          style={[
            styles.recordingCard,
            isRecording && !isPaused && styles.recordingCardActive,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Text style={styles.recordingEmoji}>
            {isRecording ? '🎙️' : '🎤'}
          </Text>
          <Text style={styles.statusText}>{statusText}</Text>
          {isRecording && (
            <Text style={styles.durationText}>
              {NativeAudioService.formatDuration(duration)}
            </Text>
          )}
          {!isRecording && hasRecording && (
            <Text style={styles.lastRecordingLabel}>
              Last recording saved ✓
            </Text>
          )}
        </Animated.View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          {!isRecording ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnRecord]}
              onPress={handleStart}
              disabled={isTranscribing}
            >
              <Text style={styles.btnIcon}>⏺</Text>
              <Text style={styles.btnLabel}>Start</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnStop]}
              onPress={handleStop}
            >
              <Text style={styles.btnIcon}>⏹</Text>
              <Text style={styles.btnLabel}>Stop & Send</Text>
            </TouchableOpacity>
          )}

          {hasRecording && !isRecording && (
            <TouchableOpacity
              style={[styles.btn, isPlaying ? styles.btnStopPlay : styles.btnPlay]}
              onPress={handlePlayPause}
              disabled={isTranscribing}
            >
              <Text style={styles.btnIcon}>{isPlaying ? '⏹' : '▶️'}</Text>
              <Text style={styles.btnLabel}>{isPlaying ? 'Stop' : 'Play'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upload / Transcription status */}
        {isTranscribing && (
          <View style={styles.infoCard}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.infoTitle}>🔍  Uploading & Transcribing…</Text>
            <Text style={styles.infoSubtext}>Sending to 192.168.0.231:4000</Text>
          </View>
        )}

        {/* Transcript result */}
        {transcript && !isTranscribing && (
          <View style={styles.successCard}>
            {isEditingTranscript ? (
              <View style={styles.editContainer}>
                <Text style={styles.editTitle}>✏️ Edit Transcript:</Text>
                <TextInput
                  style={styles.transcriptInput}
                  multiline
                  value={editableTranscript}
                  onChangeText={setEditableTranscript}
                  placeholder="Edit transcript..."
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editButton, styles.saveButton]}
                    onPress={handleSaveTranscript}
                  >
                    <Text style={styles.editButtonText}>💾 Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.sendButton]}
                    onPress={handleExecuteVoiceCommand}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
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
                <Text style={styles.successTitle}>✅ Transcription Complete</Text>
                <Text style={styles.transcriptText}>{transcript}</Text>
                <View style={styles.transcriptActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={handleEditTranscript}
                  >
                    <Text style={styles.editBtnText}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editBtn, styles.sendBtn]}
                    onPress={handleExecuteVoiceCommand}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.editBtnText}>📤 Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Error */}
        {transcriptError && !isTranscribing && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>❌  Upload Failed</Text>
            <Text style={styles.errorText}>{transcriptError}</Text>
          </View>
        )}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Quick Tips</Text>
          {[
            ['👆', 'Tap Start to begin recording'],
            ['⏹', 'Tap Stop & Send to upload to backend'],
            ['▶️', 'Play back the recorded audio'],
            ['📁', 'Files saved in MP4/AAC format'],
          ].map(([emoji, text]) => (
            <View key={text} style={styles.tipRow}>
              <Text style={styles.tipEmoji}>{emoji}</Text>
              <Text style={styles.tipText}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#1F2937' },
  headerIcon: { fontSize: 24 },

  // Scroll content
  content: { padding: 20, paddingBottom: 40 },

  // Recording card
  recordingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    marginBottom: 28,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recordingCardActive: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  recordingEmoji: { fontSize: 64, marginBottom: 12 },
  statusText: { fontSize: 20, fontWeight: '600', color: '#374151', textAlign: 'center' },
  durationText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#3B82F6',
    fontFamily: 'monospace',
    marginTop: 8,
  },
  lastRecordingLabel: { marginTop: 8, fontSize: 13, color: '#6B7280' },

  // Controls row
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 28,
    elevation: 2,
    minWidth: 110,
  },
  btnRecord: { backgroundColor: '#EF4444' },
  btnStop: { backgroundColor: '#1F2937' },
  btnPlay: { backgroundColor: '#3B82F6' },
  btnStopPlay: { backgroundColor: '#6B7280' },
  btnIcon: { fontSize: 22, marginBottom: 4 },
  btnLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  // Info / loading card
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
  },
  infoTitle: { fontSize: 17, fontWeight: '600', color: '#1F2937', marginTop: 12 },
  infoSubtext: { fontSize: 13, color: '#6B7280', marginTop: 4 },

  // Success card
  successCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  successTitle: { fontSize: 16, fontWeight: '600', color: '#10B981', marginBottom: 10 },
  transcriptText: { fontSize: 15, color: '#374151', lineHeight: 22, marginBottom: 14 },
  transcriptDisplay: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
  },
  transcriptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flex: 1,
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: '#8B5CF6',
  },
  editBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  
  // Edit mode styles
  editContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  editTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 12,
  },
  transcriptInput: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    paddingVertical: 10,
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

  // Error card
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#EF4444', marginBottom: 6 },
  errorText: { fontSize: 14, color: '#7F1D1D', lineHeight: 20 },

  // Tips
  tipsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 2,
  },
  tipsTitle: { fontSize: 17, fontWeight: '600', color: '#1F2937', marginBottom: 14 },
  tipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tipEmoji: { fontSize: 20, marginRight: 12 },
  tipText: { fontSize: 14, color: '#6B7280', flex: 1 },
});

export default VoiceRecorderScreen;
