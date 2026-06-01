import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from 'react';
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
  Clipboard,
  NativeModules,
  Keyboard,
} from 'react-native';
import {
  Mic,
  MicOff,
  Music,
  History,
  Circle,
  Square,
  Play,
  RotateCw,
  Save,
} from 'lucide-react-native';
import { FileSystem } from 'react-native-file-access';
import NativeAudioService from '../../services/NativeAudioService';
import { voiceApi } from '../../api/voiceApi';
import {
  transcribeForVoiceCommand,
  executeEditedVoiceCommand,
} from '../../services/voiceCommandWorkflow';
import { AppHeader } from '../../components/Header/AppHeader';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';

/**
 * Voice Command — full screen from the drawer, or embedded on Home (`embedded` prop).
 * Ref exposes `startRecording()` for the Home “Start Voice Command” button.
 */
const VoiceRecorderScreen = forwardRef(function VoiceRecorderScreen(
  { navigation, embedded = false, homeEmbedded = false },
  ref,
) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const transcriptInputRef = useRef(null);

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

  useEffect(() => {
    if (isRecording && !isPaused) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  useEffect(() => {
    return () => {
      clearInterval(durationInterval.current);
      NativeAudioService.forceCleanup();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!embedded) {
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
      }

      return () => {
        NativeAudioService.stopPlayback().catch(() => {});
        setIsPlaying(false);
      };
    }, [isRecording, isTranscribing, embedded]),
  );

  const handleStart = useCallback(async () => {
    if (isRecording) return;
    setTranscript(null);
    setTranscriptError(null);
    const result = await NativeAudioService.startRecording();
    if (result.success) {
      recordingStartTime.current = Date.now();
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setFilePath(result.filePath);
      await logActivity(ActivityCategory.VOICE_RECORDER, 'recording_started', {
        label: 'Recording started',
      });
      return true;
    } else {
      showAlert('Recording Error', result.error || 'Failed to start recording');
      return false;
    }
  }, [showAlert, isRecording]);

  useImperativeHandle(
    ref,
    () => ({
      startRecording: handleStart,
      stopRecording: handleStop,
    }),
    [handleStart],
  );

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
    await logActivity(ActivityCategory.VOICE_RECORDER, 'recording_stopped', {
      label: 'Recording saved',
      meta: `Duration ${NativeAudioService.formatDuration(result.duration || 0)}`,
    });
    await handleTranscription(result.filePath, result.recordingData);
  };

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

  const handlePickExistingAudio = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    try {
      const pickedUri = await NativeModules.AudioPickerModule?.pickAudio?.();
      if (!pickedUri) {
        showAlert('Upload audio', 'Could not access the selected file.');
        return;
      }

      setTranscript(null);
      setTranscriptError(null);
      setIsEditingTranscript(false);
      setEditableTranscript('');
      setVoiceAssetId(null);

      setLastRecording(null);
      setFilePath(pickedUri);
      setDuration(0);

      setIsTranscribing(true);
      await handleTranscription(pickedUri, null);
    } catch (e) {
      if (/cancel/i.test(e?.message || '')) return;
      showAlert('Upload audio', e?.message || 'Could not pick an audio file.');
    }
  }, [isRecording, isTranscribing, showAlert]);

  const handleCopyTranscript = useCallback(() => {
    const t = (isEditingTranscript ? editableTranscript : transcript) || '';
    const val = String(t).trim();
    if (!val) {
      showAlert('Copy', 'No transcript to copy yet.');
      return;
    }
    try {
      Clipboard.setString(val);
      showAlert('Copied', 'Transcript copied to clipboard.');
    } catch (_e) {
      showAlert('Copy', 'Could not copy transcript.');
    }
  }, [editableTranscript, isEditingTranscript, transcript, showAlert]);

  const handleSaveWithoutTranscription = () => {
    setIsTranscribing(false);
    setTranscriptError(null);
    showAlert('Saved', 'Recording saved locally without transcription.');
  };

  const handleTranscription = async (audioFilePath, recordingData) => {
    try {
      setTranscriptError(null);
      const absPath = audioFilePath.startsWith('file://')
        ? audioFilePath.slice(7)
        : audioFilePath;
      const exists = await FileSystem.exists(absPath);
      if (!exists) throw new Error('Audio file missing before upload: ' + absPath);

      const result = await transcribeForVoiceCommand(audioFilePath, {
        language: 'en-US',
        enablePunctuation: true,
        enableTimestamps: false,
      });

      if (result.success) {
        const { transcript, voiceAssetId: assetId } = result;
        const rawTranscript = transcript;
        const refinedTranscript = transcript;
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
        await logActivity(ActivityCategory.VOICE_RECORDER, 'transcription_complete', {
          label: 'Transcription received',
          meta: finalTranscript.slice(0, 160),
        });
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error) {
      const rawMsg = error.message || 'Transcription failed';
      setTranscript(null);
      await logActivity(ActivityCategory.VOICE_RECORDER, 'transcription_failed', {
        label: 'Transcription failed',
        meta: rawMsg.slice(0, 200),
      });

      const userMessage =
        /network/i.test(rawMsg) || /fetch/i.test(rawMsg)
          ? 'We couldn’t connect to the server to create your transcript. Your recording is safe on this device.'
          : 'We couldn’t generate a transcript for this recording. Your recording is safe on this device.';
      setTranscriptError(userMessage);
      showAlert(
        'Couldn’t create transcript',
        userMessage,
        [
          {
            text: 'Save Without Transcription',
            onPress: handleSaveWithoutTranscription,
          },
          {
            text: 'Retry',
            onPress: () => {
              void handleRetryTranscription();
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleRetryTranscription = async () => {
    const path = lastRecording?.filePath || filePath;
    if (!path) {
      showAlert('Retry', 'No recording file is available to resend.');
      return;
    }
    setIsTranscribing(true);
    await handleTranscription(path, lastRecording);
  };

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
          await logActivity(ActivityCategory.VOICE_RECORDER, 'transcript_updated', {
            label: 'Transcript saved',
            meta: editableTranscript.trim().slice(0, 160),
          });
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
    transcriptInputRef.current?.blur();
    Keyboard.dismiss();
    const currentTranscript = isEditingTranscript ? editableTranscript.trim() : transcript;
    if (!currentTranscript?.trim()) {
      showAlert('Error', 'Enter a command before sending');
      return;
    }
    const audioPath = lastRecording?.filePath || filePath;
    if (!voiceAssetId && !audioPath) {
      showAlert('Error', 'No recording available for command execution');
      return;
    }
    try {
      setIsExecuting(true);
      const exec = await executeEditedVoiceCommand(
        voiceAssetId,
        currentTranscript,
        transcript,
        audioPath,
      );
      if (!exec.success) {
        throw new Error(exec.error || 'Failed to execute voice command');
      }
      setTranscript(currentTranscript);
      setIsEditingTranscript(false);
      await logActivity(ActivityCategory.VOICE_RECORDER, 'command_executed', {
        label: 'Voice command sent',
        meta: currentTranscript.slice(0, 160),
      });
      showAlert(
        'Command Executed!',
        `Voice command processed successfully.\n\n${exec.result}`,
        [{ text: 'OK' }],
      );
      if (homeEmbedded) {
        resetVoiceCommandState();
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

  const resetVoiceCommandState = useCallback(() => {
    setLastRecording(null);
    setFilePath('');
    setDuration(0);
    setTranscript(null);
    setTranscriptError(null);
    setEditableTranscript('');
    setIsEditingTranscript(false);
    setVoiceAssetId(null);
    setIsPlaying(false);
    recordingStartTime.current = null;
  }, []);

  const hasRecording = Boolean(lastRecording?.filePath || filePath);

  const micIconSize = homeEmbedded ? 30 : 48;
  /** On Home, never show the red Start here — the header CTA starts recording; row only Stop / Play. */
  const showPrimaryStart = !homeEmbedded;

  const mainBody = (
    <>
      {!homeEmbedded ? (
        <>
          <Animated.View
            style={[
              styles.heroCard,
              homeEmbedded && styles.recordingCardHome,
              isRecording && !isPaused && styles.heroCardActive,
            ]}
          >
            <View style={styles.heroTopRow}>
              <Animated.View
                style={[
                  styles.heroIconWrap,
                  isRecording && !isPaused && styles.heroIconWrapActive,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                {isRecording ? (
                  <Mic
                    size={micIconSize}
                    color={isRecording && !isPaused ? colors.recording.active : colors.text.secondary}
                    strokeWidth={1.6}
                  />
                ) : (
                  <MicOff size={micIconSize} color={colors.text.light} strokeWidth={1.6} />
                )}
              </Animated.View>

              <View style={styles.heroTextCol}>
                <Text style={styles.heroTitle}>
                  {isRecording ? (isPaused ? 'Recording paused' : 'Recording…') : 'Voice Command'}
                </Text>
                <Text style={styles.heroSub}>
                  {isRecording
                    ? 'Speak clearly. Tap Stop & Send when done.'
                    : 'Record now or import an existing audio from Files.'}
                </Text>
              </View>
            </View>

            <View style={styles.heroMetaRow}>
              {isRecording ? (
                <Text style={styles.heroMetaValue}>{NativeAudioService.formatDuration(duration)}</Text>
              ) : hasRecording ? (
                <Text style={styles.heroMetaHint}>Last recording saved ✓</Text>
              ) : (
                <Text style={styles.heroMetaHint}>Ready</Text>
              )}
            </View>
          </Animated.View>

          <View style={[styles.actionRow, homeEmbedded && styles.controlsRowHome]}>
            {!isRecording ? (
              showPrimaryStart ? (
                <TouchableOpacity
                  style={[styles.actionTile, styles.actionPrimary]}
                  onPress={handleStart}
                  disabled={isTranscribing}
                  activeOpacity={0.85}
                >
                  <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                    <Circle size={18} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                  <View style={styles.actionTextCol}>
                    <Text style={styles.actionTitleLight}>Start</Text>
                    <Text style={styles.actionSubLight}>Record now</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            ) : (
              <TouchableOpacity
                style={[
                  styles.actionTile,
                  styles.actionDanger,
                  homeEmbedded && styles.controlBtnHomeWide,
                ]}
                onPress={handleStop}
                activeOpacity={0.85}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  <Square size={18} color="#FFFFFF" strokeWidth={2.2} />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionTitleLight}>Stop</Text>
                  <Text style={styles.actionSubLight}>Send to server</Text>
                </View>
              </TouchableOpacity>
            )}

            {!isRecording ? (
              <TouchableOpacity
                style={[styles.actionTile, styles.actionOutline, homeEmbedded && styles.controlBtnHomeWide]}
                onPress={handlePickExistingAudio}
                disabled={isTranscribing}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Upload existing audio"
              >
                <View style={styles.actionIconOutline}>
                  <Music size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionTitle}>Import</Text>
                  <Text style={styles.actionSub}>From Files</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {hasRecording && !isRecording && (
              <TouchableOpacity
                style={[
                  styles.actionTile,
                  isPlaying ? styles.actionMuted : styles.actionInfo,
                  homeEmbedded && styles.controlBtnHomeWide,
                ]}
                onPress={handlePlayPause}
                disabled={isTranscribing}
                activeOpacity={0.85}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  {isPlaying ? (
                    <Square size={18} color="#FFFFFF" strokeWidth={2.2} />
                  ) : (
                    <Play size={18} color="#FFFFFF" strokeWidth={2.2} />
                  )}
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionTitleLight}>{isPlaying ? 'Stop' : 'Play'}</Text>
                  <Text style={styles.actionSubLight}>{isPlaying ? 'Playback' : 'Listen'}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>


        </>
      ) : null}

      {isTranscribing && (
        <AppCard style={[styles.infoCard, homeEmbedded && styles.infoCardHome]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.infoTitle}>Uploading & Transcribing…</Text>
          <Text style={styles.infoSubtext}>Sending audio to server</Text>
        </AppCard>
      )}

      {transcript && !isTranscribing && (
        <AppCard
          style={[
            styles.transcriptCard,
            homeEmbedded && styles.transcriptCardHome,
            { borderLeftColor: colors.status.granted, borderLeftWidth: 3 },
          ]}
        >
          {isEditingTranscript ? (
            <>
              <Text style={styles.editLabel}>Edit Transcript</Text>
              <TextInput
                ref={transcriptInputRef}
                style={styles.transcriptInput}
                multiline
                value={editableTranscript}
                onChangeText={setEditableTranscript}
                placeholder="Edit transcript…"
                autoFocus
                blurOnSubmit
                returnKeyType="done"
              />
              <View style={[styles.editActionsRow, homeEmbedded && styles.editActionsRowHome]}>
                <PrimaryButton
                  title="Save"
                  onPress={handleSaveTranscript}
                  variant="ghost"
                  dismissKeyboardOnPress
                  style={[styles.editActionBtn, homeEmbedded && styles.editActionBtnHome]}
                  textStyle={[{ color: colors.status.granted }, homeEmbedded && styles.editActionTextHome]}
                />
                <PrimaryButton
                  title="Send"
                  onPress={handleExecuteVoiceCommand}
                  loading={isExecuting}
                  dismissKeyboardOnPress
                  style={[styles.editActionBtn, homeEmbedded && styles.editActionBtnHome, { backgroundColor: colors.primary }]}
                  textStyle={homeEmbedded ? styles.editActionTextHomeLight : undefined}
                />
                <PrimaryButton
                  title="Cancel"
                  onPress={handleCancelEdit}
                  variant="danger"
                  dismissKeyboardOnPress
                  style={[styles.editActionBtn, homeEmbedded && styles.editActionBtnHome]}
                  textStyle={homeEmbedded ? styles.editActionTextHomeLight : undefined}
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
                  title="Copy"
                  onPress={handleCopyTranscript}
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

      {transcriptError && !isTranscribing && (
        <AppCard
          style={[
            styles.errorCard,
            homeEmbedded && styles.errorCardHome,
            { borderLeftColor: colors.status.blocked, borderLeftWidth: 3 },
          ]}
        >
          <Text style={styles.errorTitle}>Couldn’t create transcript</Text>
          <Text style={styles.errorText}>{transcriptError}</Text>
          <Text style={styles.errorHint}>
            If the popup closed, you can still resend your recording from here.
          </Text>
          <View style={styles.errorActionsRow}>
            <TouchableOpacity
              style={[
                styles.errorChipBtn,
                styles.errorChipPrimary,
                !hasRecording && styles.errorChipDisabled,
              ]}
              onPress={() => {
                void handleRetryTranscription();
              }}
              disabled={!hasRecording}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Retry upload"
            >
              <RotateCw size={18} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.errorChipPrimaryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.errorChipBtn, styles.errorChipOutline]}
              onPress={handleSaveWithoutTranscription}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save without transcription"
            >
              <Save size={18} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.errorChipOutlineText}>Save local</Text>
            </TouchableOpacity>
          </View>
        </AppCard>
      )}

      {!homeEmbedded ? (
        <AppCard>
          <Text style={styles.tipsTitle}>Quick Tips</Text>
          {[
            { Icon: Circle, text: 'Tap Start to begin recording', color: colors.recording.active },
            { Icon: Square, text: 'Tap Stop & Send to upload to backend', color: colors.primary },
            { Icon: Music, text: 'Tap Import to choose an existing audio from Files', color: colors.primary },
            { Icon: Play, text: 'Play back the recorded audio', color: colors.status.info },
            { Icon: Music, text: 'Files saved in MP4/AAC format', color: colors.text.secondary },
          ].map(({ Icon, text, color }) => (
            <View key={text} style={styles.tipRow}>
              <View style={[styles.tipIconWrap, { backgroundColor: `${color}14`, borderColor: `${color}22` }]}>
                <Icon size={16} color={color} strokeWidth={2.2} />
              </View>
              <Text style={styles.tipText}>{text}</Text>
            </View>
          ))}
        </AppCard>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <View style={[styles.embeddedRoot, homeEmbedded && styles.embeddedRootHome]}>
        {!homeEmbedded ? (
          <View style={styles.inlineHeaderActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('VoiceRecorderHistory')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <History size={22} color={colors.text.primary} strokeWidth={1.8} />
            </TouchableOpacity>
            {hasRecording ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('RecordedAudio')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Music size={22} color={colors.text.primary} strokeWidth={1.8} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {mainBody}
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <AppHeader
        title="Voice Command"
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('VoiceRecorderHistory')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <History size={22} color={colors.text.primary} strokeWidth={1.8} />
            </TouchableOpacity>
            {hasRecording ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('RecordedAudio')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Music size={22} color={colors.text.primary} strokeWidth={1.8} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {mainBody}
      </ScrollView>
    </View>
  );
});

function createStyles(colors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  embeddedRoot: {
    marginBottom: 8,
  },
  embeddedRootHome: {
    marginBottom: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  recordingCardHome: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 0,
    borderRadius: 16,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  recordingIconWrapHome: {
    marginBottom: 6,
  },
  statusTextHome: {
    fontSize: 14,
  },
  durationTextHome: {
    fontSize: 22,
    marginTop: 6,
  },
  savedLabelHome: {
    fontSize: 11,
    marginTop: 4,
  },
  controlsRowHome: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 12,
    marginBottom: 0,
    justifyContent: 'center',
  },
  controlBtnHomeWide: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
    width: '100%',
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 10,
  },
  controlBtnLabelHome: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  infoCardHome: {
    marginTop: 12,
    marginBottom: 0,
  },
  transcriptCardHome: {
    marginTop: 12,
    marginBottom: 0,
  },
  errorCardHome: {
    marginTop: 12,
    marginBottom: 0,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  inlineHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  heroCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: colors.recording.activeBg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  heroIconWrapActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  heroSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  heroMetaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    alignItems: 'center',
  },
  heroMetaValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  heroMetaHint: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 16,
  },
  actionTile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconOutline: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 136, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 136, 255, 0.12)',
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitleLight: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  actionSubLight: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 0.1,
  },
  actionSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
  },
  actionPrimary: {
    backgroundColor: colors.recording.active,
  },
  actionDanger: {
    backgroundColor: colors.primary,
  },
  actionInfo: {
    backgroundColor: colors.status.info,
  },
  actionMuted: {
    backgroundColor: colors.text.secondary,
  },
  actionOutline: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(30, 136, 255, 0.55)',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    shadowOpacity: 0.02,
    elevation: 1,
  },
  controlsHelpRow: {
    marginTop: -12,
    marginBottom: 18,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  controlsHelpText: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  // Legacy button styles kept for embedded Home variant
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
  recordBtn: { backgroundColor: colors.recording.active },
  stopBtn: { backgroundColor: colors.primary },
  uploadBtn: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  playBtn: { backgroundColor: colors.status.info },
  stopPlayBtn: { backgroundColor: colors.text.secondary },
  controlBtnLabel: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  uploadBtnLabel: { color: colors.primary, fontWeight: '800' },
  infoCard: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 12,
  },
  infoSubtext: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },
  transcriptCard: {
    marginBottom: 20,
  },
  transcriptDoneLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.status.granted,
    marginBottom: 10,
  },
  transcriptText: {
    fontSize: 15,
    color: colors.text.primary,
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
    color: colors.text.primary,
    marginBottom: 10,
  },
  transcriptInput: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.backgroundAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionsRowHome: {
    gap: 6,
  },
  editActionBtn: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
  },
  editActionBtnHome: {
    minHeight: 38,
    paddingHorizontal: 8,
  },
  editActionTextHome: {
    fontSize: 12,
    fontWeight: '700',
  },
  editActionTextHomeLight: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorCard: {
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.status.blocked,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 18,
  },
  errorHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 17,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  errorChipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
  },
  errorChipPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  errorChipPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorChipOutline: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  errorChipOutlineText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  errorChipDisabled: {
    opacity: 0.38,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
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
    color: colors.text.secondary,
    flex: 1,
  },
  });
}

export default VoiceRecorderScreen;
