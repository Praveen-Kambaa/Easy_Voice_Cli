import logger from '../../utils/logger';
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  Clipboard,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark,
  X,
  Mic,
  Square,
  Volume2,
  Copy,
  Clock,
  CloudRain,
  BarChart3,
  ChevronRight,
  Bot,
} from 'lucide-react-native';
import { AskAiIcon } from '../../components/common/AskAiIcon';
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
import {
  addAiQaHistory,
  toggleSavedAiQa,
  isAiQaSaved,
  getAiQaHistory,
  getSavedAiQa,
  AI_QA_HISTORY_UPDATED_EVENT,
} from '../../services/aiQaStorage';
import { speakTranslatedText, stopTranslationSpeech } from '../../services/translationTtsService';
import { useAlert } from '../../context/AlertContext';

const { FloatingMicModule } = NativeModules;

const AskQuestionScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const showAlert = useAlert();

  const [accessAllowed, setAccessAllowed] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [heardQuestion, setHeardQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [, setQueryTime] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const [historyCount, setHistoryCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const listeningRef = useRef(false);

  const loadCounts = useCallback(async () => {
    try {
      const [hist, saved] = await Promise.all([getAiQaHistory(), getSavedAiQa()]);
      setHistoryCount(hist.length);
      setSavedCount(saved.length);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await syncFloatingMicSettingsToNative();
        } catch (e) {
          logger.warn('[AskQuestionScreen] sync floating mic settings:', e?.message || e);
        }
        const ok = await canAccessAskQuestionFeature();
        if (!cancelled) {
          setAccessAllowed(ok);
        }
        await loadCounts();
      })();
      return () => {
        cancelled = true;
      };
    }, [loadCounts]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AI_QA_HISTORY_UPDATED_EVENT, loadCounts);
    return () => {
      sub.remove();
      stopTranslationSpeech();
    };
  }, [loadCounts]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (NativeAudioService.isRecording) {
          NativeAudioService.forceCleanup().catch(() => {});
        }
        setIsRecording(false);
        stopTranslationSpeech();
      };
    }, []),
  );

  const runVoiceToAnswer = async (filePath) => {
    setIsProcessing(true);
    setHeardQuestion('');
    setAiAnswer('');
    setIsSaved(false);
    setQueryTime(Date.now());
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
        setIsSaved(Boolean(saved));
      } catch {
        setIsSaved(false);
      }
      await loadCounts();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicPress = async () => {
    if (isProcessing) return;

    if (
      Platform.OS === 'android' &&
      typeof FloatingMicModule?.startSpeechToText === 'function'
    ) {
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
      setQueryTime(Date.now());
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
          setIsSaved(Boolean(saved));
        } catch {
          setIsSaved(false);
        }
        await loadCounts();
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
      setQueryTime(Date.now());
      return;
    }
    showAlert('Microphone', started.error || 'Could not start recording. Check microphone permission.');
  };

  const handleAskFollowUp = async (question) => {
    if (isProcessing) return;
    setHeardQuestion(question);
    setQueryTime(Date.now());
    setIsProcessing(true);
    setAiAnswer('');
    setIsSaved(false);
    try {
      const ai = await askQuestion(question);
      if (!ai.success) {
        showAlert('AI', ai.error || 'Could not get an answer.');
        return;
      }
      const answer = String(ai.answer ?? '').trim();
      setAiAnswer(answer);
      await addAiQaHistory({ question, answer });
      const saved = await isAiQaSaved(question, answer);
      setIsSaved(Boolean(saved));
      await loadCounts();
    } catch (e) {
      showAlert('AI', e?.message || 'Failed to fetch answer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activeQuestion = heardQuestion.trim();
  const activeAnswer = aiAnswer.trim();
  const hasResult = Boolean(activeAnswer);

  const handleSavePress = async () => {
    if (!activeQuestion || !activeAnswer) return;
    try {
      const added = await toggleSavedAiQa({ question: activeQuestion, answer: activeAnswer });
      setIsSaved(Boolean(added));
      await loadCounts();
      showAlert(added ? 'Saved' : 'Removed', added ? 'Added to Saved Q&A.' : 'Removed from Saved Q&A.');
    } catch (e) {
      showAlert('Save', e?.message || 'Could not save');
    }
  };

  const handleCopyPress = () => {
    Clipboard.setString(activeAnswer);
    showAlert('Copied', 'AI response copied to clipboard.');
  };

  const handleSpeakPress = async () => {
    if (isSpeaking) {
      stopTranslationSpeech();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    const plainText = activeAnswer.replace(/\*\*/g, '');
    const res = await speakTranslatedText(plainText, 'en');
    setIsSpeaking(false);
    if (!res.success) {
      showAlert('Text to Speech', res.error || 'Speech failed.');
    }
  };

  const handleClearPress = () => {
    setHeardQuestion('');
    setAiAnswer('');
    setIsSaved(false);
    setQueryTime(null);
    stopTranslationSpeech();
  };

  const renderBoldAnswer = useCallback((text) => {
    const s = String(text ?? '');
    if (!s) return null;
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return (
      <Text style={styles.answerBodyText}>
        {parts.map((p, idx) => {
          const isBold = idx % 2 === 1;
          return (
            <Text key={`${idx}`} style={isBold ? styles.answerBodyBold : undefined}>
              {p}
            </Text>
          );
        })}
      </Text>
    );
  }, [styles.answerBodyText, styles.answerBodyBold]);

  if (accessAllowed === null) {
    return (
      <ScreenContainer>
        <AppHeader title="Ask Ai" showHomeBrand />
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
      <AppHeader
        title="Ask Ai"
        showHomeBrand
        forceMenu
        rightComponent={
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Bot size={18} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Subheader bar with Back button & Gemini Pro Badge (commented per request) */}
          {/*
          <View style={styles.subHeaderRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
            </TouchableOpacity>
            <Text style={styles.subHeaderTitle}>Ask Question</Text>
            <View style={styles.modelReadyBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.modelReadyText}>Gemini Pro • Ready</Text>
            </View>
          </View>
          */}

          {/* Top Voice Input Card */}
          <View style={styles.voiceInputCard}>
            <TouchableOpacity
              style={[styles.micOrb, isRecording && styles.micOrbRecording]}
              onPress={handleMicPress}
              disabled={isProcessing}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? 'Stop listening' : 'Start voice question'}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : isRecording ? (
                <Square size={20} color="#FFFFFF" strokeWidth={2.4} />
              ) : (
                <Mic size={24} color="#FFFFFF" strokeWidth={2.4} />
              )}
            </TouchableOpacity>

            <View style={styles.voiceInputContent}>
              <View style={styles.voiceInputKickerRow}>
                <Text style={styles.voiceInputKicker}>VOICE INPUT</Text>
                {/* Voice input card time display commented out per request */}
                {/*
                <View style={styles.timeTag}>
                  <Clock size={11} color={colors.text.secondary} strokeWidth={2} />
                  <Text style={styles.timeTagText}>
                    {formatTime(queryTime || Date.now())}
                  </Text>
                </View>
                */}
              </View>

              {activeQuestion ? (
                <Text style={styles.voiceQueryQuote} numberOfLines={3}>
                  &ldquo;{activeQuestion}&rdquo;
                </Text>
              ) : null}

              <Text style={styles.voiceInputHint}>
                {isProcessing
                  ? 'Transcribing and querying AI…'
                  : isRecording
                  ? 'Listening… tap again to stop'
                  : activeQuestion
                  ? 'Tap mic to ask another question'
                  : 'Tap microphone to speak or choose a topic below'}
              </Text>
            </View>
          </View>

          {/* AI Response Card / Starters */}
          {hasResult || isProcessing ? (
            <View style={styles.aiResponseCard}>
              <View style={styles.aiResponseHeader}>
                <View style={styles.aiHeaderLeft}>
                  <AskAiIcon size={16} />
                  <Text style={styles.aiHeaderKicker}>AI RESPONSE</Text>
                </View>

                {hasResult && !isProcessing ? (
                  <View style={styles.aiHeaderActions}>
                    <TouchableOpacity
                      onPress={handleSavePress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Save question"
                      style={styles.actionBtn}
                    >
                      <Bookmark
                        size={16}
                        color={isSaved ? colors.primary : colors.text.secondary}
                        fill={isSaved ? colors.primary : 'transparent'}
                        strokeWidth={2.2}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCopyPress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Copy answer"
                      style={styles.actionBtn}
                    >
                      <Copy size={16} color={colors.text.secondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSpeakPress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Listen aloud"
                      style={styles.actionBtn}
                    >
                      <Volume2
                        size={16}
                        color={isSpeaking ? colors.primary : colors.text.secondary}
                        strokeWidth={2.2}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleClearPress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Clear answer"
                      style={styles.actionBtn}
                    >
                      <X size={16} color={colors.text.secondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {isProcessing ? (
                <View style={{ paddingVertical: 28, alignItems: 'center', gap: 12 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.text.secondary, fontWeight: '500' }}>
                    Querying AI…
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.answerTextWrap}>
                    {renderBoldAnswer(activeAnswer)}
                  </View>

                  {activeAnswer.length > 80 && (
                    <View style={styles.highlightCard}>
                      <View style={styles.highlightHeader}>
                        <AskAiIcon size={14} />
                        <Text style={styles.highlightTitle}>Key AI Insight</Text>
                      </View>
                      <Text style={styles.highlightBody}>
                        {activeAnswer.slice(0, 160) + (activeAnswer.length > 160 ? '…' : '')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.followUpsWrap}>
                    <Text style={styles.followUpsKicker}>SUGGESTED FOLLOW-UPS</Text>
                    <View style={styles.followUpChips}>
                      <TouchableOpacity
                        style={styles.followUpChip}
                        onPress={() => handleAskFollowUp('Can you elaborate further?')}
                        activeOpacity={0.75}
                      >
                        <Clock size={13} color={colors.primary} strokeWidth={2.2} />
                        <Text style={styles.followUpChipText}>Can you elaborate further?</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.followUpChip}
                        onPress={() => handleAskFollowUp('Summarize this in bullet points')}
                        activeOpacity={0.75}
                      >
                        <CloudRain size={13} color={colors.primary} strokeWidth={2.2} />
                        <Text style={styles.followUpChipText}>Summarize in bullets</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.followUpChip}
                        onPress={() => handleAskFollowUp('Give me a practical example')}
                        activeOpacity={0.75}
                      >
                        <BarChart3 size={13} color={colors.primary} strokeWidth={2.2} />
                        <Text style={styles.followUpChipText}>Give practical example</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
          ) : (
            <View style={styles.aiResponseCard}>
              <View style={styles.aiResponseHeader}>
                <View style={styles.aiHeaderLeft}>
                  <AskAiIcon size={16} />
                  <Text style={styles.aiHeaderKicker}>PROMPT SUGGESTIONS</Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 4, marginBottom: 12, lineHeight: 18 }}>
                Ask any question, brainstorm ideas, or draft messages using your voice. Tap a starter below or tap the microphone above.
              </Text>

              <View style={styles.followUpChips}>
                <TouchableOpacity
                  style={styles.followUpChip}
                  onPress={() => handleAskFollowUp('Summarize key productivity tips for today')}
                  activeOpacity={0.75}
                >
                  <AskAiIcon size={13} />
                  <Text style={styles.followUpChipText}>Productivity tips for today</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.followUpChip}
                  onPress={() => handleAskFollowUp('How does voice speech-to-text transcription work?')}
                  activeOpacity={0.75}
                >
                  <Bot size={13} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.followUpChipText}>How speech transcription works</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.followUpChip}
                  onPress={() => handleAskFollowUp('Draft a polite follow-up email after a meeting')}
                  activeOpacity={0.75}
                >
                  <Clock size={13} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.followUpChipText}>Draft polite follow-up email</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Ready for next question banner */}
          <View style={styles.promptBanner}>
            <View style={styles.promptBannerIcon}>
              <Volume2 size={16} color={colors.primary} strokeWidth={2.4} />
            </View>
            <View style={styles.promptBannerTextCol}>
              <Text style={styles.promptBannerTitle}>Ready for next question</Text>
              <Text style={styles.promptBannerSub}>Say &ldquo;Hey TypeEasy&rdquo; or tap below</Text>
            </View>
            <View style={styles.waveBars}>
              <View style={[styles.waveBar, { height: 8 }]} />
              <View style={[styles.waveBar, { height: 16 }]} />
              <View style={[styles.waveBar, { height: 12 }]} />
              <View style={[styles.waveBar, { height: 20 }]} />
              <View style={[styles.waveBar, { height: 10 }]} />
            </View>
          </View>

          {/* Feature Card: Multi-turn Dialogues */}
          <View style={styles.featureCard}>
            <View style={styles.featureIconBox}>
              <Bot size={22} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.featureContent}>
              <View style={styles.featureKickerRow}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.featureKicker}>VOICE INTELLIGENCE</Text>
              </View>
              <Text style={styles.featureTitle}>Multi-turn Dialogues</Text>
              <Text style={styles.featureSub} numberOfLines={1}>
                Follow up on any topic with continuous context…
              </Text>
            </View>
          </View>

          {/* Bottom Quick Links (History & Saved) */}
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('AiQaHistory')}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconCircleBlue}>
                <Clock size={16} color={colors.primary} strokeWidth={2.4} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Q&amp;A History</Text>
                <Text style={styles.quickLinkSub}>
                  {historyCount > 0 ? `${historyCount} queries logged` : 'No queries logged yet'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('AiQaSaved')}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconCircleGreen}>
                <Bookmark size={16} color="#15803D" strokeWidth={2.4} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Saved Q&amp;A</Text>
                <Text style={styles.quickLinkSub}>
                  {savedCount > 0 ? `${savedCount} pinned answers` : 'No pinned answers yet'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 20 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    loadingWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 30,
      gap: 14,
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
      flex: 1,
      marginLeft: 10,
      fontSize: 19,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    modelReadyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
    },
    greenDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#16A34A',
    },
    modelReadyText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    voiceInputCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    micOrb: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 4,
    },
    micOrbRecording: {
      backgroundColor: '#DC2626',
    },
    voiceInputContent: {
      flex: 1,
    },
    voiceInputKickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    voiceInputKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.1,
    },
    timeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeTagText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    voiceQueryQuote: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      lineHeight: 22,
    },
    voiceInputHint: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 4,
    },
    aiResponseCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    aiResponseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    aiHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    aiHeaderKicker: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1,
    },
    confBadge: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    confBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    aiHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionBtn: {
      padding: 6,
      borderRadius: 8,
    },
    weatherCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    weatherIconBox: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FEF3C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    weatherMain: {
      flex: 1,
    },
    weatherTempRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    weatherTemp: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text.primary,
    },
    weatherUnit: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    weatherConditionPill: {
      marginLeft: 4,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
    },
    weatherConditionText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    weatherSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    weatherLocation: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    weatherRange: {
      fontSize: 10,
      color: colors.text.secondary,
    },
    answerTextWrap: {
      paddingVertical: 2,
    },
    answerBodyText: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.text.primary,
    },
    answerBodyBold: {
      fontWeight: '800',
      color: colors.primary,
    },
    highlightCard: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.08)' : '#EFF6FF',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.2)' : '#DBEAFE',
      gap: 6,
    },
    highlightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    highlightTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
    },
    highlightBody: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.text.primary,
    },
    followUpsWrap: {
      gap: 8,
      paddingTop: 4,
    },
    followUpsKicker: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 1.1,
    },
    followUpChips: {
      gap: 8,
    },
    followUpChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    followUpChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    promptBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.1)' : '#EFF6FF',
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    promptBannerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    promptBannerTextCol: {
      flex: 1,
    },
    promptBannerTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    promptBannerSub: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    waveBars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    waveBar: {
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.primary,
    },
    featureCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    featureIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureContent: {
      flex: 1,
    },
    featureKickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    greenPulseDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    featureKicker: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.1,
    },
    featureTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    featureSub: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    quickLinksRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    quickLinkCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    quickLinkIconCircleBlue: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkIconCircleGreen: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkTextCol: {
      flex: 1,
    },
    quickLinkTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
    },
    quickLinkSub: {
      fontSize: 10,
      color: colors.text.secondary,
      marginTop: 2,
    },
  });
}

export default AskQuestionScreen;
