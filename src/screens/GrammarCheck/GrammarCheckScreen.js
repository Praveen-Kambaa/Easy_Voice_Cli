import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Clipboard,
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SpellCheck,
  X,
  Copy,
  Bookmark,
  Volume2,
  Sparkles,
  Clipboard as PasteIcon,
  Mic,
  Pencil,
  RotateCcw,
  Check,
  Clock,
  Lightbulb,
  ChevronRight,
  ArrowRight,
} from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { API_SERVERS, API_ENDPOINTS } from '../../config/api';
import { getAiEngineProvider } from '../../services/aiEngineConfig';
import { checkGrammarWithGroq } from '../../services/groqService';
import {
  addGrammarHistory,
  isGrammarSaved,
  toggleSavedGrammar,
  getGrammarHistory,
  getSavedGrammar,
  GRAMMAR_HISTORY_UPDATED_EVENT,
} from '../../services/grammarCheckStorage';
import { speakTranslatedText, stopTranslationSpeech } from '../../services/translationTtsService';

const { FloatingMicModule } = NativeModules;

const TONES = [
  { id: 'formal', label: 'Formal & Crisp', icon: '✍️' },
  { id: 'casual', label: 'Casual Tone', icon: '💬' },
  { id: 'executive', label: 'Executive', icon: '💼' },
];

async function checkGrammarApi({ text, userId, tone }) {
  const url = `${API_SERVERS.TYPE_EASY}${API_ENDPOINTS.GRAMMAR_CHECK}`;
  const body = new FormData();
  body.append('user_id', String(userId ?? ''));
  body.append('text', text.trim());
  body.append('fast', 'false');
  if (tone) body.append('tone', tone);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { method: 'POST', body, signal: controller.signal });
    clearTimeout(timeoutId);
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      return { success: false, error: data?.message || data?.error || `Error ${response.status}` };
    }
    const corrected = String(
      data?.corrected_text ?? data?.corrected ?? data?.result ?? data?.data ?? '',
    ).trim();
    if (!corrected) return { success: false, error: 'API returned an empty result' };
    return { success: true, corrected };
  } catch (e) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: e?.name === 'AbortError' ? 'Request timed out' : e?.message || 'Request failed',
    };
  }
}

function extractDiffFixes(original, corrected) {
  if (!original || !corrected) return [];
  const origWords = original.trim().split(/\s+/);
  const corrWords = corrected.trim().split(/\s+/);
  const fixes = [];

  let i = 0;
  let j = 0;
  while (i < origWords.length && j < corrWords.length) {
    const oClean = origWords[i].replace(/[.,?!]/g, '');
    const cClean = corrWords[j].replace(/[.,?!]/g, '');
    if (oClean.toLowerCase() !== cClean.toLowerCase()) {
      let category = 'Grammar & phrasing';
      if (
        origWords[i].includes("'") ||
        corrWords[j].includes("'") ||
        oClean.toLowerCase().includes('didnt') ||
        cClean.toLowerCase().includes("haven't")
      ) {
        category = 'Contraction & tense';
      } else if (oClean.endsWith('s') && !cClean.endsWith('s')) {
        category = 'Pluralization';
      } else if (
        oClean.toLowerCase().startsWith('has') ||
        oClean.toLowerCase().startsWith('had')
      ) {
        category = 'Tense agreement';
      }
      fixes.push({
        from: origWords[i],
        to: corrWords[j],
        category,
      });
      i++;
      j++;
    } else {
      i++;
      j++;
    }
    if (fixes.length >= 6) break;
  }
  return fixes;
}

const GrammarCheckScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const showAlert = useAlert();

  const [selectedTone, setSelectedTone] = useState('formal');
  const [inputText, setInputText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [starred, setStarred] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [processDurationSec, setProcessDurationSec] = useState('0.00');

  const [historyCount, setHistoryCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const [hist, saved] = await Promise.all([getGrammarHistory(), getSavedGrammar()]);
      setHistoryCount(hist.length);
      setSavedCount(saved.length);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCounts();
      return () => {
        stopTranslationSpeech();
      };
    }, [loadCounts]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(GRAMMAR_HISTORY_UPDATED_EVENT, loadCounts);
    return () => {
      sub.remove();
      stopTranslationSpeech();
    };
  }, [loadCounts]);

  // Keep star in sync whenever the result changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputText.trim() || !correctedText) {
        setStarred(false);
        return;
      }
      const saved = await isGrammarSaved(inputText.trim(), correctedText);
      if (!cancelled) setStarred(Boolean(saved));
    })();
    return () => {
      cancelled = true;
    };
  }, [inputText, correctedText]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setCorrectedText('');
    setStarred(false);
    const startMs = Date.now();

    const aiEngine = await getAiEngineProvider();
    let result;
    if (aiEngine === 'groq') {
      try {
        const groqRes = await checkGrammarWithGroq(trimmed);
        result = { success: true, corrected: groqRes.correctedText };
      } catch (e) {
        result = { success: false, error: e.message || 'Groq grammar check failed' };
      }
    } else {
      result = await checkGrammarApi({
        text: trimmed,
        userId: user?.userId,
        tone: selectedTone,
      });
    }
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
    setProcessDurationSec(elapsedSec);
    setLoading(false);

    if (!result.success) {
      showAlert('Grammar Check', result.error);
      return;
    }
    setCorrectedText(result.corrected);
    await addGrammarHistory({ inputText: trimmed, correctedText: result.corrected });
    const saved = await isGrammarSaved(trimmed, result.corrected);
    setStarred(Boolean(saved));
    await loadCounts();
  };

  const handleClear = () => {
    setInputText('');
    setCorrectedText('');
    setStarred(false);
  };

  const handlePaste = async () => {
    try {
      const clip = await Clipboard.getString();
      if (clip && clip.trim()) {
        setInputText(clip.trim());
      } else {
        showAlert('Clipboard', 'Clipboard is empty.');
      }
    } catch {
      showAlert('Clipboard', 'Unable to paste text.');
    }
  };

  const handleDictate = async () => {
    if (
      Platform.OS === 'android' &&
      typeof FloatingMicModule?.startSpeechToText === 'function'
    ) {
      if (isDictating) {
        try {
          await FloatingMicModule.stopSpeechToText?.();
        } catch {
          // ignore
        } finally {
          setIsDictating(false);
        }
        return;
      }
      setIsDictating(true);
      try {
        const text = await FloatingMicModule.startSpeechToText();
        const spoken = String(text ?? '').trim();
        if (spoken) {
          setInputText((prev) => (prev ? `${prev} ${spoken}` : spoken));
        }
      } catch (e) {
        showAlert('Dictation', e?.message || 'Speech recognition failed');
      } finally {
        setIsDictating(false);
      }
    } else {
      showAlert('Dictate', 'Speech dictation is ready on Android devices.');
    }
  };

  const handleCopy = () => {
    if (!correctedText) return;
    Clipboard.setString(correctedText);
    showAlert('Copied', 'Corrected text copied to clipboard.');
  };

  const handleSpeak = async () => {
    if (isSpeaking) {
      stopTranslationSpeech();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    const res = await speakTranslatedText(correctedText, 'en');
    setIsSpeaking(false);
    if (!res.success) {
      showAlert('Speech', res.error || 'Failed to read aloud.');
    }
  };

  const handleToggleStar = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !correctedText) return;
    const nowSaved = await toggleSavedGrammar({ inputText: trimmed, correctedText });
    setStarred(Boolean(nowSaved));
    await loadCounts();
    showAlert(nowSaved ? 'Saved' : 'Removed', nowSaved ? 'Correction saved to Pinned Rules.' : 'Removed from Pinned Rules.');
  };

  const handleApplyToDraft = () => {
    if (!correctedText) return;
    setInputText(correctedText);
    showAlert('Applied', 'Corrected text applied to input draft.');
  };

  const resolvedFixes = useMemo(() => {
    return extractDiffFixes(inputText, correctedText);
  }, [inputText, correctedText]);

  const canSend = inputText.trim().length > 0 && !loading;
  const hasResult = correctedText.length > 0;

  // Render corrected text highlighting the improved words
  const renderHighlightedCorrected = () => {
    if (!correctedText) return null;
    const words = correctedText.split(' ');
    const changedWordsLower = new Set(
      resolvedFixes.map((f) => f.to.toLowerCase().replace(/[.,?!]/g, '')),
    );

    return (
      <Text style={styles.correctedParagraph}>
        {words.map((word, idx) => {
          const clean = word.toLowerCase().replace(/[.,?!]/g, '');
          const isImproved = changedWordsLower.has(clean);
          if (isImproved) {
            return (
              <React.Fragment key={`${idx}`}>
                <Text> </Text>
                <View style={styles.inlineDiffChip}>
                  <Text style={styles.inlineDiffChipText}>{word}</Text>
                </View>
                <Text> </Text>
              </React.Fragment>
            );
          }
          return <Text key={`${idx}`}>{idx > 0 ? ` ${word}` : word}</Text>;
        })}
      </Text>
    );
  };

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader
        title="Grammar Check"
        showHomeBrand
        brandIcon={<SpellCheck size={14} color={colors.primary} strokeWidth={2.4} />}
        forceMenu
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Subheader bar commented out to avoid duplicate Grammar Check title */}
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
            <Text style={styles.subHeaderTitle}>Grammar Check</Text>
            <View style={styles.aiProofreadBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.aiProofreadBadgeText}>AI Proofread</Text>
            </View>
          </View>
          */}

          {/* Tone Switcher Chips Row */}
          <View style={styles.tonesRow}>
            {TONES.map((tone) => {
              const isSelected = selectedTone === tone.id;
              return (
                <TouchableOpacity
                  key={tone.id}
                  style={[styles.toneChip, isSelected && styles.toneChipSelected]}
                  onPress={() => setSelectedTone(tone.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.toneChipText, isSelected && styles.toneChipTextSelected]}
                  >
                    {tone.icon} {tone.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Input Draft Card */}
          <View style={styles.card}>
            <View style={styles.inputHeader}>
              <Text style={styles.cardKicker}>INPUT DRAFT</Text>
              <View style={styles.inputHeaderRight}>
                <View style={styles.charBadge}>
                  <Text style={styles.charBadgeText}>{inputText.length} / 2000</Text>
                </View>
                <TouchableOpacity
                  style={[styles.dictateBtn, isDictating && styles.dictateBtnActive]}
                  onPress={handleDictate}
                  activeOpacity={0.8}
                >
                  <Mic size={13} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.dictateBtnText}>
                    {isDictating ? 'Listening…' : 'Dictate'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.textInputBoxWrap}>
              <TextInput
                style={styles.input}
                placeholder="Type or paste your sentence here…"
                placeholderTextColor={colors.text.light}
                value={inputText}
                onChangeText={setInputText}
                multiline
                textAlignVertical="top"
                maxLength={2000}
              />
              <View style={styles.editPencilIcon}>
                <Pencil size={14} color={colors.text.secondary} strokeWidth={2} />
              </View>
            </View>

            {/* Input Action Buttons */}
            <View style={styles.inputFooter}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClear}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityLabel="Clear draft"
              >
                <X size={16} color={colors.text.secondary} strokeWidth={2.2} />
              </TouchableOpacity>

              <View style={styles.inputFooterActions}>
                <TouchableOpacity
                  style={styles.pasteBtn}
                  onPress={handlePaste}
                  activeOpacity={0.8}
                >
                  <PasteIcon size={14} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.pasteBtnText}>Paste</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.checkNowBtn, !canSend && styles.checkNowBtnDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Check grammar"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.checkNowText}>Check Now</Text>
                      <Sparkles size={15} color="#FFFFFF" strokeWidth={2.4} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Corrected Output Card */}
          {(loading || hasResult) && (
            <View style={styles.card}>
              <View style={styles.outputHeader}>
                <View style={styles.outputBadgesRow}>
                  <View style={styles.correctedBadge}>
                    <Check size={13} color="#15803D" strokeWidth={2.6} />
                    <Text style={styles.correctedBadgeText}>CORRECTED</Text>
                  </View>
                  <View style={styles.improvementsBadge}>
                    <Text style={styles.improvementsBadgeText}>
                      {resolvedFixes.length > 0
                        ? `${resolvedFixes.length} Improvements`
                        : 'Improved'}
                    </Text>
                  </View>
                </View>

                {hasResult && !loading ? (
                  <View style={styles.outputActions}>
                    <TouchableOpacity
                      onPress={handleSpeak}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      accessibilityLabel="Speak corrected text"
                    >
                      <Volume2
                        size={17}
                        color={isSpeaking ? colors.primary : colors.text.secondary}
                        strokeWidth={2.2}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleToggleStar}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      accessibilityLabel="Save correction"
                    >
                      <Bookmark
                        size={17}
                        color={starred ? colors.primary : colors.text.secondary}
                        fill={starred ? colors.primary : 'transparent'}
                        strokeWidth={2.2}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCopy}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      accessibilityLabel="Copy corrected text"
                    >
                      <Copy size={17} color={colors.text.secondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Proofreading and improving text…</Text>
                </View>
              ) : (
                <>
                  {/* Highlighted text container */}
                  <View style={styles.highlightedOutputWrap}>
                    {renderHighlightedCorrected()}
                  </View>

                  {/* Resolved Fixes Section */}
                  {resolvedFixes.length > 0 && (
                    <View style={styles.resolvedFixesSection}>
                      <View style={styles.resolvedFixesTitleRow}>
                        <Check size={15} color="#16A34A" strokeWidth={2.4} />
                        <Text style={styles.resolvedFixesTitle}>Resolved Fixes</Text>
                      </View>

                      {resolvedFixes.map((fix, idx) => (
                        <View key={`${idx}`} style={styles.fixItemRow}>
                          <View style={styles.fixItemWords}>
                            <Text style={styles.fixFromWord} numberOfLines={1}>
                              {fix.from}
                            </Text>
                            <ArrowRight size={13} color={colors.text.secondary} strokeWidth={2} />
                            <Text style={styles.fixToWord} numberOfLines={1}>
                              {fix.to}
                            </Text>
                          </View>
                          <View style={styles.fixCategoryBadge}>
                            <Text style={styles.fixCategoryText} numberOfLines={1}>
                              {fix.category}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Output Footer with Processed Time & Apply button */}
                  <View style={styles.outputFooter}>
                    <View style={styles.processedTimeCol}>
                      <Clock size={13} color={colors.text.secondary} strokeWidth={2} />
                      <Text style={styles.processedTimeText}>
                        Processed in {processDurationSec}s
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.applyBtn}
                      onPress={handleApplyToDraft}
                      activeOpacity={0.8}
                    >
                      <RotateCcw size={13} color={colors.primary} strokeWidth={2.4} />
                      <Text style={styles.applyBtnText}>Apply to Draft</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Bottom Quick Links: History & Pinned Rules */}
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('GrammarCheckHistory')}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconCircleBlue}>
                <Clock size={16} color={colors.primary} strokeWidth={2.4} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>History</Text>
                <Text style={styles.quickLinkSub}>
                  {historyCount > 0 ? `${historyCount} checks logged` : 'No checks logged yet'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickLinkCard}
              onPress={() => navigation.navigate('GrammarCheckSaved')}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconCircleGreen}>
                <Bookmark size={16} color="#15803D" strokeWidth={2.4} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Pinned Rules</Text>
                <Text style={styles.quickLinkSub}>
                  {savedCount > 0 ? `${savedCount} saved notes` : 'No saved notes yet'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Pro Voice Tip Card */}
          <View style={styles.proVoiceTipCard}>
            <View style={styles.proTipIconCircle}>
              <Lightbulb size={20} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <View style={styles.proTipContent}>
              <Text style={styles.proTipTitle}>Pro Voice Tip</Text>
              <Text style={styles.proTipDesc}>
                Say &ldquo;Fix this sentence&rdquo; while typing anywhere to auto-invoke Proofread.
              </Text>
            </View>
          </View>

          <View style={{ height: 20 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    flex: {
      flex: 1,
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
    aiProofreadBadge: {
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
    aiProofreadBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    tonesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toneChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toneChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toneChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    toneChipTextSelected: {
      color: '#FFFFFF',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    inputHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 1.1,
    },
    inputHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    charBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    charBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    dictateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    dictateBtnActive: {
      backgroundColor: '#DC2626',
      borderColor: '#DC2626',
    },
    dictateBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    textInputBoxWrap: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: 12,
      minHeight: 110,
      position: 'relative',
    },
    input: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text.primary,
      minHeight: 80,
      textAlignVertical: 'top',
      padding: 0,
    },
    editPencilIcon: {
      position: 'absolute',
      bottom: 8,
      right: 8,
    },
    inputFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    clearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputFooterActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pasteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pasteBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    checkNowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    checkNowBtnDisabled: {
      opacity: 0.5,
      shadowOpacity: 0,
      elevation: 0,
    },
    checkNowText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    outputHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 4,
    },
    outputBadgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    correctedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    correctedBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
      letterSpacing: 0.8,
    },
    improvementsBadge: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    improvementsBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    outputActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 20,
      gap: 10,
    },
    loadingText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    highlightedOutputWrap: {
      paddingVertical: 2,
    },
    correctedParagraph: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.text.primary,
    },
    inlineDiffChip: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.22)' : '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    inlineDiffChipText: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    resolvedFixesSection: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      gap: 8,
      marginTop: 4,
    },
    resolvedFixesTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    resolvedFixesTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
    },
    fixItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    fixItemWords: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    fixFromWord: {
      fontSize: 12,
      color: '#DC2626',
      textDecorationLine: 'line-through',
      maxWidth: 90,
    },
    fixToWord: {
      fontSize: 12,
      fontWeight: '800',
      color: '#16A34A',
      maxWidth: 100,
    },
    fixCategoryBadge: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.14)' : '#EFF6FF',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
    },
    fixCategoryText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    outputFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
    },
    processedTimeCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    processedTimeText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    applyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    applyBtnText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
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
    proVoiceTipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    proTipIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    proTipContent: {
      flex: 1,
    },
    proTipTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    proTipDesc: {
      marginTop: 2,
      fontSize: 11,
      lineHeight: 16,
      color: colors.text.secondary,
    },
  });
}

export default GrammarCheckScreen;
