import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  Mic,
  MicOff,
  Music,
  Circle,
  Square,
  Play,
  Pencil,
  Send,
  X,
  Info,
  Lightbulb,
  HelpCircle,
} from 'lucide-react-native';
import { FileSystem } from 'react-native-file-access';
import NativeAudioService from '../../services/NativeAudioService';
import { voiceApi } from '../../api/voiceApi';
import { AppHeader } from '../../components/Header/AppHeader';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';

const VoiceCommandScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [filePath, setFilePath] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [transcriptError, setTranscriptError] = useState(null);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [voiceAssetId, setVoiceAssetId] = useState(null);
  const [lastRecording, setLastRecording] = useState(null);

  const recordingStartTime = useRef(null);
  const durationInterval = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef(null);

  // ── Duration timer ──────────────────────────────────────────────────────────
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

  // ── Pulse animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording && !isPaused) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(durationInterval.current);
      NativeAudioService.forceCleanup();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const refreshIfAllowed = () => {
        if (isGlobalAlertModalVisible()) {
          return;
        }
        if (!isRecording && !isTranscribing) {
          setLastRecording(null);
          setFilePath('');
          setDuration(0);
          setTranscript(null);
          setTranscriptError(null);
          setEditableTranscript('');
          setIsEditingTranscript(false);
          setVoiceAssetId(null);
          setIsExecuting(false);
          setIsPlaying(false);
          recordingStartTime.current = null;
        }
      };

      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(refreshIfAllowed);
      });

      return () => {
        cancelAnimationFrame(raf1);
        if (raf2 != null) {
          cancelAnimationFrame(raf2);
        }
        NativeAudioService.stopPlayback().catch(() => {});
        setIsPlaying(false);
      };
    }, [isRecording, isTranscribing]),
  );

  // ── Recording controls ──────────────────────────────────────────────────────
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
      showAlert('Recording Error', result.error || 'Failed to start recording');
    }
  };

  const handleStop = async () => {
    if (!isRecording) return;
    setIsTranscribing(true);
    const result = await NativeAudioService.stopRecording();
    clearInterval(durationInterval.current);
    recordingStartTime.current = null;
    setIsRecording(false);
    setIsPaused(false);
    if (!result.success) {
      await NativeAudioService.forceCleanup();
      setIsTranscribing(false);
      showAlert('Error', `Failed to stop recording: ${result.error}`);
      return;
    }
    setLastRecording(result.recordingData);
    setDuration(result.duration || 0);
    await handleTranscription(result.filePath, result.recordingData);
  };

  // ── Playback ────────────────────────────────────────────────────────────────
  const handlePlayPause = async () => {
    const path = lastRecording?.filePath || filePath;
    if (!path) {
      showAlert('No Recording', 'Record something first before playing.');
      return;
    }
    if (isPlaying) {
      const r = await NativeAudioService.stopPlayback();
      if (r.success) setIsPlaying(false);
    } else {
      const r = await NativeAudioService.playRecording(path);
      if (r.success) {
        setIsPlaying(true);
        const check = setInterval(() => {
          if (!NativeAudioService.isPlaying) {
            setIsPlaying(false);
            clearInterval(check);
          }
        }, 500);
      } else {
        showAlert('Playback Error', r.error || 'Failed to play recording');
      }
    }
  };

  // ── Transcription ───────────────────────────────────────────────────────────
  const handleTranscription = async (audioFilePath, recordingData) => {
    try {
      const absPath = audioFilePath.startsWith('file://')
        ? audioFilePath.slice(7)
        : audioFilePath;
      const exists = await FileSystem.exists(absPath);
      if (!exists) throw new Error('Audio file missing before upload: ' + absPath);

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
        const finalTranscript = refinedTranscript || rawTranscript;
        setTranscript(finalTranscript);
        setEditableTranscript(finalTranscript);
        setVoiceAssetId(assetId);
        setTranscriptError(null);
        setIsEditingTranscript(true);
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error) {
      const msg = error.message || 'Transcription failed';
      setTranscriptError(msg);
      setTranscript(null);
      showAlert(
        'Upload / Transcription Failed',
        msg,
        [
          {
            text: 'Save Without Transcription',
            onPress: () => {
              setIsTranscribing(false);
              setTranscriptError(null);
              showAlert('Saved', 'Recording saved locally without transcription.');
            },
          },
          {
            text: 'Retry',
            onPress: () => handleTranscription(lastRecording?.filePath || filePath, lastRecording),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  // ── Transcript edit & execute ────────────────────────────────────────────────
  const handleEditTranscript = () => {
    setIsEditingTranscript(true);
    setEditableTranscript(transcript);
  };

  const handleSaveTranscript = async () => {
    if (!voiceAssetId) {
      showAlert('Error', 'No voice asset ID available for update');
      return;
    }
    try {
      const hasChanged = editableTranscript.trim() !== transcript;
      if (hasChanged) {
        const updateResult = await voiceApi.updateTranscript(voiceAssetId, editableTranscript.trim());
        if (updateResult.success) {
          setTranscript(editableTranscript.trim());
          if (lastRecording) {
            const updated = { ...lastRecording, refinedTranscript: editableTranscript.trim() };
            await NativeAudioService.updateRecordingTranscript(lastRecording.id, updated);
            setLastRecording(updated);
          }
          showAlert('Success', 'Transcript updated successfully!');
        } else {
          showAlert('Error', updateResult.error);
          return;
        }
      }
      setIsEditingTranscript(false);
    } catch {
      showAlert('Error', 'Failed to save transcript');
    }
  };

  const handleExecuteVoiceCommand = async () => {
    if (!voiceAssetId) {
      showAlert('Error', 'No voice asset ID available for execution');
      return;
    }
    try {
      setIsExecuting(true);
      const currentTranscript = isEditingTranscript ? editableTranscript.trim() : transcript;
      const hasChanged = currentTranscript !== transcript;
      let finalVoiceAssetId = voiceAssetId;

      if (hasChanged && isEditingTranscript) {
        const updateResult = await voiceApi.updateTranscript(voiceAssetId, currentTranscript);
        if (updateResult.success) {
          finalVoiceAssetId = updateResult.data.voiceAssetId;
          setVoiceAssetId(finalVoiceAssetId);
          setTranscript(currentTranscript);
          if (lastRecording) {
            const updated = { ...lastRecording, refinedTranscript: currentTranscript };
            await NativeAudioService.updateRecordingTranscript(lastRecording.id, updated);
            setLastRecording(updated);
          }
        } else {
          throw new Error(`Failed to update transcript: ${updateResult.error}`);
        }
      }

      const executeResult = await voiceApi.executeVoiceCommand(finalVoiceAssetId, {
        timestamp: new Date().toISOString(),
      });

      if (executeResult.success) {
        setIsEditingTranscript(false);
        showAlert(
          'Command Executed!',
          `Voice command processed successfully.\n\n${hasChanged ? '(Transcript was updated before execution)' : '(Original transcript used)'}`,
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(executeResult.error);
      }
    } catch (error) {
      showAlert('Execution Failed', error.message || 'Failed to execute voice command');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTranscript(false);
    setEditableTranscript(transcript);
  };

  // ── Derived state ────────────────────────────────────────────────────────────
  const hasRecording = Boolean(lastRecording?.filePath || filePath);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.safeArea}>
      <AppHeader
        title="Voice Command"
        rightComponent={
          hasRecording ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('RecordedAudio')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Music size={22} color={Colors.text.primary} strokeWidth={1.8} />
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Recording card */}
        <Animated.View
          style={[
            styles.recordingCard,
            isRecording && !isPaused && styles.recordingCardActive,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={styles.recordingIconWrap}>
            {isRecording
              ? <Mic size={48} color={isRecording && !isPaused ? Colors.recording.active : Colors.text.secondary} strokeWidth={1.5} />
              : <MicOff size={48} color={Colors.text.light} strokeWidth={1.5} />}
          </View>
          <Text style={styles.statusText}>
            {isRecording
              ? isPaused ? 'Recording Paused' : 'Recording…'
              : 'Ready to Record'}
          </Text>
          {isRecording && (
            <Text style={styles.durationText}>
              {NativeAudioService.formatDuration(duration)}
            </Text>
          )}
          {!isRecording && hasRecording && (
            <Text style={styles.savedLabel}>Last recording saved ✓</Text>
          )}
        </Animated.View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          {!isRecording ? (
            <TouchableOpacity
              style={[styles.controlBtn, styles.recordBtn]}
              onPress={handleStart}
              disabled={isTranscribing}
              activeOpacity={0.85}
            >
              <Circle size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.controlBtnLabel}>Start</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.controlBtn, styles.stopBtn]}
              onPress={handleStop}
              activeOpacity={0.85}
            >
              <Square size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.controlBtnLabel}>Stop & Send</Text>
            </TouchableOpacity>
          )}

          {hasRecording && !isRecording && (
            <TouchableOpacity
              style={[styles.controlBtn, isPlaying ? styles.stopPlayBtn : styles.playBtn]}
              onPress={handlePlayPause}
              disabled={isTranscribing}
              activeOpacity={0.85}
            >
              {isPlaying
                ? <Square size={20} color="#FFFFFF" strokeWidth={2} />
                : <Play size={20} color="#FFFFFF" strokeWidth={2} />}
              <Text style={styles.controlBtnLabel}>{isPlaying ? 'Stop' : 'Play'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Uploading indicator */}
        {isTranscribing && (
          <AppCard style={styles.infoCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.infoTitle}>Uploading & Transcribing…</Text>
            <Text style={styles.infoSubtext}>Sending audio to server</Text>
          </AppCard>
        )}

        {/* Transcript result */}
        {transcript && !isTranscribing && (
          <AppCard
            style={[styles.transcriptCard, { borderLeftColor: Colors.status.granted, borderLeftWidth: 3 }]}
          >
            {isEditingTranscript ? (
              <>
                <Text style={styles.editLabel}>Edit Transcript</Text>
                <TextInput
                  style={styles.transcriptInput}
                  multiline
                  value={editableTranscript}
                  onChangeText={setEditableTranscript}
                  placeholder="Edit transcript…"
                  autoFocus
                />
                <View style={styles.editActionsRow}>
                  <PrimaryButton
                    title="Save"
                    onPress={handleSaveTranscript}
                    variant="ghost"
                    style={styles.editActionBtn}
                    textStyle={{ color: Colors.status.granted }}
                  />
                  <PrimaryButton
                    title="Send"
                    onPress={handleExecuteVoiceCommand}
                    loading={isExecuting}
                    style={[styles.editActionBtn, { backgroundColor: Colors.primary }]}
                  />
                  <PrimaryButton
                    title="Cancel"
                    onPress={handleCancelEdit}
                    variant="danger"
                    style={styles.editActionBtn}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.transcriptDoneLabel}>Transcription Complete</Text>
                <Text style={styles.transcriptText}>{transcript}</Text>
                <View style={styles.transcriptActionsRow}>
                  <PrimaryButton
                    title="Edit"
                    onPress={handleEditTranscript}
                    variant="outline"
                    style={styles.transcriptActionBtn}
                  />
                  <PrimaryButton
                    title="Send"
                    onPress={handleExecuteVoiceCommand}
                    loading={isExecuting}
                    style={styles.transcriptActionBtn}
                  />
                </View>
              </>
            )}
          </AppCard>
        )}

        {/* Error */}
        {transcriptError && !isTranscribing && (
          <AppCard
            style={[styles.errorCard, { borderLeftColor: Colors.status.blocked, borderLeftWidth: 3 }]}
          >
            <Text style={styles.errorTitle}>Upload Failed</Text>
            <Text style={styles.errorText}>{transcriptError}</Text>
          </AppCard>
        )}

        {/* Tips */}
        <AppCard>
          <Text style={styles.tipsTitle}>Quick Tips</Text>
          {[
            { Icon: Circle, text: 'Tap Start to begin recording', color: Colors.recording.active },
            { Icon: Square, text: 'Tap Stop & Send to upload to backend', color: Colors.primary },
            { Icon: Play, text: 'Play back the recorded audio', color: Colors.status.info },
            { Icon: Music, text: 'Files saved in MP4/AAC format', color: Colors.text.secondary },
          ].map(({ Icon, text, color }) => (
            <View key={text} style={styles.tipRow}>
              <View style={styles.tipIconWrap}>
                <Icon size={16} color={color} strokeWidth={2} />
              </View>
              <Text style={styles.tipText}>{text}</Text>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  recordingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  recordingCardActive: {
    borderColor: Colors.recording.active,
    backgroundColor: Colors.recording.activeBg,
  },
  recordingIconWrap: {
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  durationText: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.primary,
    fontFamily: 'monospace',
    marginTop: 10,
  },
  savedLabel: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.text.secondary,
  },

  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 24,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recordBtn: { backgroundColor: Colors.recording.active },
  stopBtn: { backgroundColor: Colors.primary },
  playBtn: { backgroundColor: Colors.status.info },
  stopPlayBtn: { backgroundColor: Colors.text.secondary },
  controlBtnIcon: { marginBottom: 4 },
  controlBtnLabel: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  infoCard: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 12,
  },
  infoSubtext: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 4,
  },

  transcriptCard: {
    marginBottom: 20,
  },
  transcriptDoneLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.granted,
    marginBottom: 10,
  },
  transcriptText: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
    marginBottom: 14,
  },
  transcriptActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  transcriptActionBtn: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  transcriptInput: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
  },

  errorCard: {
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.blocked,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
  },

  tipsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 14,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tipIconWrap: {
    width: 26,
    alignItems: 'center',
    marginRight: 12,
  },
  tipText: {
    fontSize: 13,
    color: Colors.text.secondary,
    flex: 1,
  },
});

export default VoiceCommandScreen;
