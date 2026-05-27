import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from '../../utils/debounce';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  ScrollView,
  Clipboard,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { X, Repeat2, Volume2, Share2, Copy, History, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import {
  TRANSLATION_LANGUAGES,
  getLanguageName,
  normalizeStoredLanguageCode,
} from '../../constants/translationLanguages';
import { translateViaApi } from '../../services/translationService';
import {
  startTranslatorRecording,
  stopTranslatorRecordingAndTranscribe,
} from '../../services/speechService';
import {
  addTranslationHistory,
  isTranslationSaved,
  toggleSavedTranslation,
} from '../../services/translationTextStorage';
import { addAiQaHistory } from '../../services/aiQaStorage';
import {
  syncFloatingMicSettingsToNative,
  getOverlayAskQuestionEnabled,
} from '../../services/floatingMicConfig';
import { askQuestion } from '../../services/aiService';
import { Colors } from '../../theme/Colors';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';
import { useAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import {
  speakTranslatedText,
  stopTranslationSpeech,
} from '../../services/translationTtsService';

const TranslatorScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [fromCode, setFromCode] = useState('en');
  const [toCode, setToCode] = useState('ta');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translateError, setTranslateError] = useState('');
  const [translating, setTranslating] = useState(false);
  const [starred, setStarred] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  /** null | 'from' | 'to' */
  const [languagePickerFor, setLanguagePickerFor] = useState(null);

  const requestIdRef = useRef(0);
  const hasFocusedOnceRef = useRef(false);
  const wasFocusedRef = useRef(false);
  /** After voice input, source text is English until the user edits the field */
  const sttSourceLangRef = useRef(null);
  /** Skip one debounced translate after Ask Question fills source + translation */
  const skipNextSourceTranslateRef = useRef(false);

  const [askFeatureEnabled, setAskFeatureEnabled] = useState(false);
  const [recordingAskVoice, setRecordingAskVoice] = useState(false);
  const [askBusyPhase, setAskBusyPhase] = useState(
    /** @type {'transcribe' | 'ai' | null} */ (null),
  );
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef(null);

  const loadLanguages = useCallback(async () => {
    try {
      const f = await AsyncStorage.getItem('@from_language');
      const t = await AsyncStorage.getItem('@to_language');
      if (f) setFromCode(normalizeStoredLanguageCode(f, 'en'));
      if (t) setToCode(normalizeStoredLanguageCode(t, 'ta'));
      if (Platform.OS === 'android') {
        setAskFeatureEnabled(await getOverlayAskQuestionEnabled());
      } else {
        setAskFeatureEnabled(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const onSelectLanguageFromPicker = useCallback(
    async (code) => {
      try {
        if (languagePickerFor === 'from') {
          setFromCode(code);
          await AsyncStorage.setItem('@from_language', code);
        } else if (languagePickerFor === 'to') {
          setToCode(code);
          await AsyncStorage.setItem('@to_language', code);
        }
        await syncFloatingMicSettingsToNative();
      } catch {
        // ignore
      }
    },
    [languagePickerFor],
  );

  useFocusEffect(
    useCallback(() => {
      loadLanguages();
      return () => {
        stopTranslationSpeech();
      };
    }, [loadLanguages]),
  );

  // Reset ONLY when the screen is re-entered (focus transitions false -> true).
  useEffect(() => {
    const gainedFocus = isFocused && !wasFocusedRef.current;
    wasFocusedRef.current = isFocused;
    if (!gainedFocus) return;

    if (hasFocusedOnceRef.current) {
      debouncedRunTranslation.cancel();
      requestIdRef.current += 1;
      sttSourceLangRef.current = null;
      skipNextSourceTranslateRef.current = false;
      setSourceText('');
      setTranslatedText('');
      setTranslateError('');
      setStarred(false);
      setTranslating(false);
    } else {
      hasFocusedOnceRef.current = true;
    }
  }, [isFocused]);

  // When returning to idle while focused, clear transient error text.
  useEffect(() => {
    if (!isFocused) return;
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!translating && !transcribingVoice && !recordingVoice && !recordingAskVoice && !askBusyPhase) {
          setTranslateError('');
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
    };
  }, [isFocused, translating, transcribingVoice, recordingVoice, recordingAskVoice, askBusyPhase]);

  const runTranslation = useCallback(
    async (trimmed, id) => {
      if (!trimmed) {
        setTranslatedText('');
        setTranslateError('');
        setTranslating(false);
        return;
      }
      const sourceAppCode = sttSourceLangRef.current ?? fromCode;
      setTranslating(true);
      setTranslateError('');
      console.log('[Translator] runTranslation via API', { sourceAppCode, toCode, len: trimmed.length });
      try {
        const result = await translateViaApi({
          text: trimmed,
          targetLangCode: toCode,
          userId: user?.userId,
        });
        if (id !== requestIdRef.current) return;
        if (result.success) {
          setTranslatedText(result.translatedText);
          await addTranslationHistory({
            sourceText: trimmed,
            translatedText: result.translatedText,
            fromCode: sourceAppCode,
            toCode,
          });
        } else {
          setTranslatedText('');
          setTranslateError(result.error);
        }
      } finally {
        if (id === requestIdRef.current) setTranslating(false);
      }
    },
    [fromCode, toCode, user],
  );

  /** Fires the API call 500 ms after the user stops typing. */
  const debouncedRunTranslation = useDebounce((trimmed) => {
    const id = ++requestIdRef.current;
    runTranslation(trimmed, id);
  }, 2000);

  useEffect(() => {
    if (skipNextSourceTranslateRef.current) {
      skipNextSourceTranslateRef.current = false;
      return;
    }
    const trimmed = sourceText.trim();
    if (!trimmed) {
      debouncedRunTranslation.cancel();
      setTranslatedText('');
      setTranslateError('');
      setTranslating(false);
      return;
    }

    debouncedRunTranslation(trimmed);
  }, [sourceText, fromCode, toCode, debouncedRunTranslation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sourceText.trim() || !translatedText) {
        if (!cancelled) setStarred(false);
        return;
      }
      const effectiveFrom = sttSourceLangRef.current ?? fromCode;
      const s = await isTranslationSaved(sourceText.trim(), effectiveFrom, toCode);
      if (!cancelled) setStarred(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceText, translatedText, fromCode, toCode]);

  const swapLanguages = async () => {
    const nextFrom = toCode;
    const nextTo = fromCode;
    setFromCode(nextFrom);
    setToCode(nextTo);
    try {
      await AsyncStorage.setItem('@from_language', nextFrom);
      await AsyncStorage.setItem('@to_language', nextTo);
      await syncFloatingMicSettingsToNative();
    } catch {
      // ignore
    }
  };

  const clearSource = () => {
    sttSourceLangRef.current = null;
    skipNextSourceTranslateRef.current = false;
    setSourceText('');
    setTranslatedText('');
    setTranslateError('');
  };

  const onSourceChange = (t) => {
    sttSourceLangRef.current = null;
    setSourceText(t);
  };

  const onMicPress = async () => {
    if (recordingAskVoice || askBusyPhase) return;
    if (transcribingVoice || (translating && !recordingVoice)) return;

    if (recordingVoice) {
      setRecordingVoice(false);
      setTranscribingVoice(true);
      setTranslateError('');
      const id = ++requestIdRef.current;
      debouncedRunTranslation.cancel();
      try {
        const tx = await stopTranslatorRecordingAndTranscribe({ language: 'en-US' });
        if (id !== requestIdRef.current) return;
        if (!tx.success) {
          setTranslateError(tx.error || 'Transcription failed');
          return;
        }
        sttSourceLangRef.current = 'en';
        setSourceText(tx.transcript);
        setTranslatedText('');
        setTranslating(true);
        setTranslateError('');
        console.log('[Translator] voice → API translate (en → target)', toCode);
        const tr = await translateViaApi({
          text: tx.transcript,
          targetLangCode: toCode,
          userId: user?.userId,
        });
        if (id !== requestIdRef.current) return;
        if (tr.success) {
          setTranslatedText(tr.translatedText);
          await addTranslationHistory({
            sourceText: tx.transcript,
            translatedText: tr.translatedText,
            fromCode: 'en',
            toCode,
          });
        } else {
          setTranslatedText('');
          setTranslateError(tr.error);
        }
      } finally {
        setTranscribingVoice(false);
        if (id === requestIdRef.current) setTranslating(false);
      }
      return;
    }

    debouncedRunTranslation.cancel();
    setTranslateError('');
    setTranslatedText('');
    const started = await startTranslatorRecording();
    if (!started.success) {
      setTranslateError(started.error || 'Could not access microphone');
      return;
    }
    setRecordingVoice(true);
    console.log('[Translator] recording started');
  };

  const onAskPress = async () => {
    if (recordingVoice || transcribingVoice || askBusyPhase) return;
    if (translating && !recordingAskVoice) return;

    if (recordingAskVoice) {
      setRecordingAskVoice(false);
      setAskBusyPhase('transcribe');
      setTranslateError('');
      const id = ++requestIdRef.current;
      debouncedRunTranslation.cancel();
      try {
        const tx = await stopTranslatorRecordingAndTranscribe({ language: 'en-US' });
        if (id !== requestIdRef.current) return;
        if (!tx.success) {
          setTranslateError(tx.error || 'Transcription failed');
          return;
        }
        setAskBusyPhase('ai');
        const ai = await askQuestion(tx.transcript);
        if (id !== requestIdRef.current) return;
        if (!ai.success) {
          setTranslateError(ai.error || 'AI request failed');
          return;
        }
        skipNextSourceTranslateRef.current = true;
        sttSourceLangRef.current = 'en';
        setSourceText(tx.transcript);
        setTranslatedText(ai.answer);
        setTranslateError('');
        await addTranslationHistory({
          sourceText: tx.transcript,
          translatedText: ai.answer,
          fromCode: 'en',
          toCode: 'en',
        });
        await addAiQaHistory({ question: tx.transcript, answer: ai.answer });
        await logActivity(ActivityCategory.TRANSLATOR, 'ask_question_answered', {
          label: 'Ask Question (AI answer, no translate)',
          meta: 'en',
        });
      } finally {
        setAskBusyPhase(null);
      }
      return;
    }

    debouncedRunTranslation.cancel();
    setTranslateError('');
    setTranslatedText('');
    const started = await startTranslatorRecording();
    if (!started.success) {
      setTranslateError(started.error || 'Could not access microphone');
      return;
    }
    setRecordingAskVoice(true);
  };

  const onShareTranslation = async () => {
    if (!translatedText) return;
    try {
      await Share.share({ message: translatedText });
    } catch {
      // user dismissed
    }
  };

  const onSpeakTranslation = useCallback(async () => {
    if (!translatedText?.trim()) return;
    const r = await speakTranslatedText(translatedText, toCode);
    if (!r.success) {
      showAlert('Read aloud', r.error || 'Could not play speech');
    }
  }, [translatedText, toCode, showAlert]);

  const onCopyTranslation = useCallback(() => {
    if (!translatedText?.trim()) return;
    Clipboard.setString(translatedText);
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
      copyToastTimerRef.current = null;
    }, 2000);
  }, [translatedText]);

  const onToggleStar = async () => {
    const src = sourceText.trim();
    if (!src || !translatedText) return;
    const effectiveFrom = sttSourceLangRef.current ?? fromCode;
    const nowSaved = await toggleSavedTranslation({
      sourceText: src,
      translatedText,
      fromCode: effectiveFrom,
      toCode,
    });
    setStarred(nowSaved);
    await logActivity(
      ActivityCategory.TRANSLATOR,
      nowSaved ? 'translation_favorited' : 'translation_unfavorited',
      {
        label: nowSaved ? 'Saved translation' : 'Removed saved translation',
        meta: `${effectiveFrom} → ${toCode}`,
      },
    );
  };

  const charCount = sourceText.length;
  const fromName = getLanguageName(fromCode);
  const toName = getLanguageName(toCode);

  const askLoadingLabel =
    askBusyPhase === 'transcribe' ? 'Transcribing…' : askBusyPhase === 'ai' ? 'Asking AI…' : '';

  const iconMuted = Colors.text.secondary;
  const starColor = starred ? Colors.primary : Colors.text.secondary;

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader title="Translator" />

      {copyToastVisible ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>Copied</Text>
          </View>
        </View>
      ) : null}

      <LanguagePickerModal
        visible={languagePickerFor !== null}
        onClose={() => setLanguagePickerFor(null)}
        title={languagePickerFor === 'from' ? 'Translate from' : 'Translate to'}
        languages={TRANSLATION_LANGUAGES}
        selectedCode={
          languagePickerFor === 'from'
            ? fromCode
            : languagePickerFor === 'to'
              ? toCode
              : ''
        }
        onSelect={onSelectLanguageFromPicker}
      />

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.kav} behavior="padding" keyboardVerticalOffset={8}>
          <TranslatorScrollBody
            navigation={navigation}
            fromName={fromName}
            toName={toName}
            onPressFromLang={() => setLanguagePickerFor('from')}
            onPressToLang={() => setLanguagePickerFor('to')}
            swapLanguages={swapLanguages}
            sourceText={sourceText}
            onSourceChange={onSourceChange}
            translatedText={translatedText}
            translateError={translateError}
            translating={translating}
            starred={starred}
            charCount={charCount}
            iconMuted={iconMuted}
            starColor={starColor}
            clearSource={clearSource}
            onMicPress={onMicPress}
            recordingVoice={recordingVoice}
            transcribingVoice={transcribingVoice}
            askFeatureEnabled={askFeatureEnabled}
            onAskPress={onAskPress}
            recordingAskVoice={recordingAskVoice}
            askBusyPhase={askBusyPhase}
            askLoadingLabel={askLoadingLabel}
            onToggleStar={onToggleStar}
            onShareTranslation={onShareTranslation}
            onSpeakTranslation={onSpeakTranslation}
            onCopyTranslation={onCopyTranslation}
          />
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.kav}>
          <TranslatorScrollBody
            navigation={navigation}
            fromName={fromName}
            toName={toName}
            onPressFromLang={() => setLanguagePickerFor('from')}
            onPressToLang={() => setLanguagePickerFor('to')}
            swapLanguages={swapLanguages}
            sourceText={sourceText}
            onSourceChange={onSourceChange}
            translatedText={translatedText}
            translateError={translateError}
            translating={translating}
            starred={starred}
            charCount={charCount}
            iconMuted={iconMuted}
            starColor={starColor}
            clearSource={clearSource}
            onMicPress={onMicPress}
            recordingVoice={recordingVoice}
            transcribingVoice={transcribingVoice}
            askFeatureEnabled={askFeatureEnabled}
            onAskPress={onAskPress}
            recordingAskVoice={recordingAskVoice}
            askBusyPhase={askBusyPhase}
            askLoadingLabel={askLoadingLabel}
            onToggleStar={onToggleStar}
            onShareTranslation={onShareTranslation}
            onSpeakTranslation={onSpeakTranslation}
            onCopyTranslation={onCopyTranslation}
          />
        </View>
      )}
    </ScreenContainer>
  );
};

/** Scrollable body: keeps footer reachable when the keyboard resizes the window (Android adjustResize). */
function TranslatorScrollBody({
  navigation,
  fromName,
  toName,
  onPressFromLang,
  onPressToLang,
  swapLanguages,
  sourceText,
  onSourceChange,
  translatedText,
  translateError,
  translating,
  starred,
  charCount,
  iconMuted,
  starColor,
  clearSource,
  onMicPress,
  recordingVoice,
  transcribingVoice,
  askFeatureEnabled,
  onAskPress,
  recordingAskVoice,
  askBusyPhase,
  askLoadingLabel,
  onToggleStar,
  onShareTranslation,
  onSpeakTranslation,
  onCopyTranslation,
}) {
  const showOutputActions = !!translatedText;

  return (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.langPillsRow}>
            <TouchableOpacity style={styles.langPill} onPress={onPressFromLang} activeOpacity={0.8}>
              <Text style={styles.langPillText} numberOfLines={1}>{fromName}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.swapPill} onPress={swapLanguages} activeOpacity={0.8}>
              <Repeat2 size={18} color={Colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.langPill} onPress={onPressToLang} activeOpacity={0.8}>
              <Text style={styles.langPillText} numberOfLines={1}>{toName}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.langHint}>Tap a language to change · search in the picker</Text>

          <View style={styles.inputCard}>
            <Text style={styles.cardKicker}>INPUT</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter text"
              placeholderTextColor={Colors.text.light}
              value={sourceText}
              onChangeText={onSourceChange}
              multiline
              textAlignVertical="top"
              scrollEnabled
              maxLength={5000}
            />
            <View style={styles.inputMetaRow}>
              {!!sourceText ? (
                <TouchableOpacity onPress={clearSource} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                  <X size={18} color={Colors.text.secondary} strokeWidth={2.2} />
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <Text style={styles.charCount}>{charCount}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.outputCard}>
            <View style={styles.outputTopRow}>
              <View style={styles.outputTitleRow}>
                <Text style={styles.outputLabel}>Translation</Text>
                {translatedText ? (
                  <TouchableOpacity
                    style={styles.starBtn}
                    onPress={onToggleStar}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Bookmark
                      size={18}
                      color={starColor}
                      strokeWidth={2}
                      fill={starred ? starColor : 'transparent'}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              {translatedText && showOutputActions ? (
                <View style={styles.outputActions}>
                  <TouchableOpacity onPress={onCopyTranslation} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Copy size={18} color={Colors.primary} strokeWidth={2.2} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onSpeakTranslation} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Volume2 size={18} color={Colors.primary} strokeWidth={2.2} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onShareTranslation} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Share2 size={18} color={Colors.primary} strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {(translating || transcribingVoice || askBusyPhase) && !translatedText && !translateError ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.loadingText}>
                  {askBusyPhase ? askLoadingLabel : transcribingVoice ? 'Transcribing…' : 'Translating…'}
                </Text>
              </View>
            ) : translateError ? (
              <Text style={styles.errorText}>{translateError}</Text>
            ) : (
              <Text style={[styles.outputText, !translatedText && styles.outputPlaceholder]} numberOfLines={12}>
                {translatedText || (sourceText.trim() ? 'Translation will appear here…' : '—')}
              </Text>
            )}
          </View>

          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('TranslatorHistory')}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconBlue]}>
                <History size={18} color={Colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>History</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Recent translations</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('TranslatorSaved')}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconGold]}>
                <Bookmark size={18} color="#B45309" strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Saved</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Starred items</Text>
              </View>
            </TouchableOpacity>
          </View>

        </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  screen: {
    backgroundColor: Colors.backgroundAlt,
  },
  toastWrap: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  toast: {
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
    gap: 14,
  },
  langPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: 0.2,
  },
  swapPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langHint: {
    fontSize: 11,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text.secondary,
    letterSpacing: 1.1,
  },
  inputCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  input: {
    minHeight: 90,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.text.primary,
    fontWeight: '500',
    paddingVertical: 10,
  },
  inputMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  errorText: {
    fontSize: 14,
    color: Colors.status.blocked,
    lineHeight: 20,
    paddingVertical: 8,
  },
  charCount: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    borderRadius: 1,
    backgroundColor: Colors.borderLight,
  },
  outputCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  outputTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  outputTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  outputLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
  },
  starBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  outputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  outputText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: Colors.text.primary,
    letterSpacing: 0,
  },
  outputPlaceholder: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: Colors.text.secondary,
  },

  quickLinksRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 0,
  },
  quickLinkCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  quickLinkSub: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.text.secondary,
  },
});

export default TranslatorScreen;
