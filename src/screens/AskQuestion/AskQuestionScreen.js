import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  NativeModules,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { History, Bookmark, X, Mic, Square } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import AskQuestionAccessBlocked from '../../components/AskQuestion/AskQuestionAccessBlocked';
import { useTheme } from '../../context/ThemeContext';
import {
  canAccessAskQuestionFeature,
  syncFloatingMicSettingsToNative,
} from '../../services/floatingMicConfig';
import NativeAudioService from '../../services/NativeAudioService';
import { askQuestion, transcribeAndAskQuestion } from '../../services/aiService';
import { addAiQaHistory, toggleSavedAiQa, isAiQaSaved } from '../../services/aiQaStorage';
import { useAlert } from '../../context/AlertContext';

const { FloatingMicModule } = NativeModules;

const AskQuestionScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const showAlert = useAlert();
  const [accessAllowed, setAccessAllowed] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  /** Speech→text only (fed to the AI); shown above the answer box so it is not confused with the reply. */
  const [heardQuestion, setHeardQuestion] = useState('');
  /** AI chat completion text only — maps to the large field below. */
  const [aiAnswer, setAiAnswer] = useState('');
  const canClear = aiAnswer.trim().length > 0;
  const listeningRef = useRef(false);
  const [isSaved, setIsSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await syncFloatingMicSettingsToNative();
        } catch (e) {
          console.warn('[AskQuestionScreen] sync floating mic settings:', e?.message || e);
        }
        const ok = await canAccessAskQuestionFeature();
        if (!cancelled) {
          setAccessAllowed(ok);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (NativeAudioService.isRecording) {
          NativeAudioService.forceCleanup().catch(() => {});
        }
        setIsRecording(false);
      };
    }, []),
  );

  /** Mic → STT (Easy Voice) → Tavily context (optional) → OpenRouter (`aiProvider.js`) — all via `transcribeAndAskQuestion`. */
  const runVoiceToAnswer = async (filePath) => {
    setIsProcessing(true);
    setHeardQuestion('');
    setAiAnswer('');
    setIsSaved(false);
    try {
      const out = await transcribeAndAskQuestion(filePath);
      if (!out.success) {
        if (out.questionText) setHeardQuestion(out.questionText);
        const title = out.stage === 'transcribe' ? 'Transcription' : 'AI';
        showAlert(title, out.error || 'Something went wrong.');
        return;
      }
      setHeardQuestion(out.questionText);
      setAiAnswer(out.answer);
      await addAiQaHistory({ question: out.questionText, answer: out.answer });
      try {
        const saved = await isAiQaSaved(out.questionText, out.answer);
        setIsSaved(!!saved);
      } catch {
        setIsSaved(false);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicPress = async () => {
    if (isProcessing) return;
    // Preferred: Android on-device SpeechRecognizer (no backend needed for transcription).
    if (
      Platform.OS === 'android' &&
      typeof FloatingMicModule?.startSpeechToText === 'function'
    ) {
      // One-tap flow (matches floating mic Ask): tap once to listen, auto-stops on silence and processes.
      // Tap again while listening cancels.
      if (isRecording) {
        try {
          await FloatingMicModule.stopSpeechToText?.();
        } catch {
          // ignore
        } finally {
          listeningRef.current = false;
          setIsRecording(false);
        }
        return;
      }

      listeningRef.current = true;
      setIsRecording(true);
      setHeardQuestion('');
      setAiAnswer('');
      setIsSaved(false);
      try {
        const text = await FloatingMicModule.startSpeechToText();
        const q = String(text ?? '').trim();
        if (!listeningRef.current) return;
        if (!q) {
          showAlert('No speech detected', 'Speak a bit longer, then try again.');
          return;
        }
        setHeardQuestion(q);
        setIsProcessing(true);
        const ai = await askQuestion(q);
        if (!ai.success) {
          showAlert('AI', ai.error || 'Could not get an answer.');
          return;
        }
        const answer = String(ai.answer ?? '').trim();
        if (!answer) {
          showAlert('AI', 'The model returned an empty answer.');
          return;
        }
        setAiAnswer(answer);
        await addAiQaHistory({ question: q, answer });
        try {
          const saved = await isAiQaSaved(q, answer);
          setIsSaved(!!saved);
        } catch {
          setIsSaved(false);
        }
      } catch (e) {
        const msg = e?.message || e?.toString?.() || 'Speech recognition failed';
        showAlert('Speech', msg);
      } finally {
        listeningRef.current = false;
        setIsRecording(false);
        setIsProcessing(false);
      }
      return;
    }

    // Fallback: file recording + backend transcription, then AI (older pipeline).
    if (isRecording) {
      const result = await NativeAudioService.stopRecording();
      setIsRecording(false);
      if (!result.success) {
        showAlert('Recording', result.error || 'Could not stop recording.');
        return;
      }
      if (result.filePath) await runVoiceToAnswer(result.filePath);
      return;
    }
    const started = await NativeAudioService.startRecording();
    if (started.success) {
      setIsRecording(true);
      setHeardQuestion('');
      setAiAnswer('');
      setIsSaved(false);
      return;
    }
    showAlert('Microphone', started.error || 'Could not start recording. Check microphone permission.');
  };

  const canSave = heardQuestion.trim().length > 0 && aiAnswer.trim().length > 0 && !isProcessing;
  const handleSavePress = async () => {
    if (!canSave) return;
    try {
      const added = await toggleSavedAiQa({ question: heardQuestion, answer: aiAnswer });
      setIsSaved(!!added);
      showAlert(added ? 'Saved' : 'Removed', added ? 'Added to Saved Q&A.' : 'Removed from Saved Q&A.');
    } catch (e) {
      showAlert('Save', e?.message || 'Could not save');
    }
  };

  const renderBoldAnswer = useCallback((text) => {
    const s = String(text ?? '');
    if (!s) return null;
    // Split by **bold** tokens; keep empty parts to preserve spacing.
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return (
      <Text style={styles.answerText}>
        {parts.map((p, idx) => {
          const isBold = idx % 2 === 1;
          return (
            <Text key={`${idx}`} style={isBold ? styles.answerTextBold : undefined}>
              {p}
            </Text>
          );
        })}
      </Text>
    );
  }, []);

  if (accessAllowed === null) {
    return (
      <ScreenContainer>
        <AppHeader title="Ask Question" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!accessAllowed) {
    return <AskQuestionAccessBlocked navigation={navigation} />;
  }

  return (
    <ScreenContainer>
      <AppHeader title="Ask Question" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.body}>
          <View style={styles.inputCard}>
            <View style={styles.inputHeaderRow}>
              <TouchableOpacity
                style={[styles.micBtn, isRecording && styles.micBtnRecording]}
                onPress={handleMicPress}
                disabled={isProcessing}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isRecording ? 'Cancel listening' : 'Start voice question'}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : isRecording ? (
                  <Square size={16} color="#FFFFFF" strokeWidth={2.4} />
                ) : (
                  <Mic size={18} color="#FFFFFF" strokeWidth={2.2} />
                )}
              </TouchableOpacity>
              <View style={styles.inputHeaderTextCol}>
                {heardQuestion ? (
                  <View style={styles.askedInline}>
                    <Text style={styles.askedInlineLabel}>You asked</Text>
                    <Text style={styles.askedInlineText} numberOfLines={2}>
                      {heardQuestion}
                    </Text>
                  </View>
                ) : isProcessing ? (
                  <Text style={styles.inputHeaderHint} numberOfLines={2}>
                    Transcribing and asking AI…
                  </Text>
                ) : isRecording ? (
                  <Text style={styles.inputHeaderHint} numberOfLines={2}>
                    Listening…
                  </Text>
                ) : (
                  <Text style={styles.inputHeaderHint} numberOfLines={2}>
                    Tap mic to ask a question
                  </Text>
                )}
              </View>
            </View>
          <View style={styles.inputWrap}>
            <Text style={styles.answerBoxLabel}>Answer</Text>
            <View style={styles.answerBox}>
              <Text style={styles.answerPlaceholder}>
                {aiAnswer ? '' : 'Answer appears here after you stop recording…'}
              </Text>
              <ScrollView
                style={styles.answerScroll}
                contentContainerStyle={styles.answerScrollInner}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {aiAnswer ? renderBoldAnswer(aiAnswer) : null}
              </ScrollView>
            </View>
            {canClear ? (
              <View style={styles.answerActions}>
                <TouchableOpacity
                  onPress={handleSavePress}
                  disabled={!canSave}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Save Q&A"
                  style={[styles.actionIconBtn, !canSave && styles.actionIconBtnDisabled]}
                >
                  <Bookmark
                    size={18}
                    color={isSaved ? colors.primary : colors.text.secondary}
                    strokeWidth={2.5}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAiAnswer('');
                    setHeardQuestion('');
                    setIsSaved(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all text"
                  style={styles.actionIconBtn}
                >
                  <X size={18} color={colors.text.secondary} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          </View>

          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('AiQaHistory')}
              activeOpacity={0.75}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconBlue]}>
                <History size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>History</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Recent Q&A</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('AiQaSaved')}
              activeOpacity={0.75}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconGold]}>
                <Bookmark size={18} color="#B45309" strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Saved</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Starred pairs</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ height: 24 + (insets?.bottom || 0) + 96 }} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  micBtnRecording: {
    backgroundColor: colors.status.blocked,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  inputHeaderTextCol: {
    flex: 1,
  },
  inputHeaderHint: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  askedInline: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  askedInlineLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  askedInlineText: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 18,
  },
  answerBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  inputWrap: {
    flex: 1,
    position: 'relative',
  },
  input: {
    flex: 1,
    minHeight: 180,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    padding: 14,
    paddingRight: 44,
    paddingBottom: 28,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  answerBox: {
    flex: 1,
    minHeight: 180,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    padding: 14,
    paddingRight: 44,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  answerPlaceholder: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 44,
    color: colors.text.light,
  },
  answerScroll: {
    flex: 1,
  },
  answerScrollInner: {
    paddingBottom: 8,
  },
  answerText: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  answerTextBold: {
    fontWeight: '800',
    color: colors.text.primary,
  },
  clearIconBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  answerActions: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionIconBtnDisabled: {
    opacity: 0.45,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickLinkCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  quickLinkIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  quickLinkIconBlue: {
    backgroundColor: 'rgba(30, 136, 255, 0.10)',
    borderColor: 'rgba(30, 136, 255, 0.18)',
  },
  quickLinkIconGold: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  quickLinkTextCol: {
    flex: 1,
  },
  quickLinkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  quickLinkSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
  },
});
}



export default AskQuestionScreen;
