import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import {
  X,
  ArrowLeftRight,
  Star,
  Volume2,
  Share2,
  Copy,
  Mic,
  MessageCircle,
  History,
  Bookmark,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../../components/Header/AppHeader';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import {
  TRANSLATION_LANGUAGES,
  getLanguageName,
  normalizeStoredLanguageCode,
} from '../../constants/translationLanguages';
import { translateOffline, translateEnglishToTarget } from '../../services/translationService';
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
import {
  speakTranslatedText,
  stopTranslationSpeech,
} from '../../services/translationTtsService';

/** Subtle tint for translated block (light theme, matches “output” panel feel) */
const OUTPUT_TINT = 'rgba(14, 165, 233, 0.08)';

const TranslatorScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const [fromCode, setFromCode] = useState('en');
  const [toCode, setToCode] = useState('es');
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
  const debounceTimerRef = useRef(null);
  /** After voice input, source text is English until the user edits the field */
  const sttSourceLangRef = useRef(null);
  /** Skip one debounced translate after Ask Question fills source + translation */
  const skipNextSourceTranslateRef = useRef(false);

  const [askFeatureEnabled, setAskFeatureEnabled] = useState(false);
  const [recordingAskVoice, setRecordingAskVoice] = useState(false);
  const [askBusyPhase, setAskBusyPhase] = useState(
    /** @type {'transcribe' | 'ai' | null} */ (null),
  );

  const loadLanguages = useCallback(async () => {
    try {
      const f = await AsyncStorage.getItem('@from_language');
      const t = await AsyncStorage.getItem('@to_language');
      if (f) setFromCode(normalizeStoredLanguageCode(f, 'en'));
      if (t) setToCode(normalizeStoredLanguageCode(t, 'es'));
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
      console.log('[Translator] runTranslation', { sourceAppCode, fromCode, toCode, len: trimmed.length });
      try {
        const result = await translateOffline({
          text: trimmed,
          sourceAppCode,
          targetAppCode: toCode,
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
    [fromCode, toCode],
  );

  useEffect(() => {
    if (skipNextSourceTranslateRef.current) {
      skipNextSourceTranslateRef.current = false;
      return;
    }
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setTranslatedText('');
      setTranslateError('');
      setTranslating(false);
      return;
    }

    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const id = ++requestIdRef.current;
      runTranslation(trimmed, id);
    }, 480);

    return () => clearTimeout(debounceTimerRef.current);
  }, [sourceText, fromCode, toCode, runTranslation]);

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
      clearTimeout(debounceTimerRef.current);
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
        console.log('[Translator] voice → ML Kit (en → target)', toCode);
        const tr = await translateEnglishToTarget(tx.transcript, toCode);
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

    clearTimeout(debounceTimerRef.current);
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
      clearTimeout(debounceTimerRef.current);
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

    clearTimeout(debounceTimerRef.current);
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
    showAlert('Copied', 'Translation copied to clipboard.');
  }, [translatedText, showAlert]);

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
  const starColor = starred ? '#F59E0B' : Colors.text.secondary;

  return (
    <View style={styles.screen}>
      <AppHeader title="Translate" />

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
    </View>
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
  onToggleStar,
  onShareTranslation,
  onSpeakTranslation,
  onCopyTranslation,
}) {
  return (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.langBar}>
            <TouchableOpacity style={styles.langBtn} onPress={onPressFromLang} activeOpacity={0.7}>
              <Text style={styles.langText} numberOfLines={1}>
                {fromName}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.swapBtn} onPress={swapLanguages} activeOpacity={0.75}>
              <ArrowLeftRight size={22} color={Colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.langBtn} onPress={onPressToLang} activeOpacity={0.7}>
              <Text style={styles.langText} numberOfLines={1}>
                {toName}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.langHint}>Tap a language to change · search in the picker</Text>
          {Platform.OS === 'android' ? (
            <Text style={styles.langHintVoice}>
              Typed text: on-device translate ({fromName} → {toName}). Voice: English speech-to-text,
              then on-device translate to {toName}.
            </Text>
          ) : (
            <Text style={styles.langHintVoice}>
              On-device translation (ML Kit) runs on Android. On iOS, use typed text with your existing
              server translator if configured.
            </Text>
          )}

          <View style={styles.columns}>
            <View style={[styles.panel, styles.panelSource]}>
              <View style={styles.panelTopBar}>
                <View style={styles.flex1} />
                {!!sourceText && (
                  <TouchableOpacity onPress={clearSource} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color={iconMuted} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.sourceInput}
                placeholder="Enter text"
                placeholderTextColor={Colors.text.light}
                value={sourceText}
                onChangeText={onSourceChange}
                multiline
                textAlignVertical="top"
                scrollEnabled
                maxLength={5000}
              />
              <View style={styles.panelToolbar}>
                <TouchableOpacity
                  style={styles.iconHit}
                  onPress={onMicPress}
                  activeOpacity={0.65}
                  disabled={
                    transcribingVoice ||
                    (translating && !recordingVoice) ||
                    recordingAskVoice ||
                    !!askBusyPhase
                  }
                >
                  <Mic
                    size={22}
                    color={
                      recordingVoice
                        ? Colors.primary
                        : transcribingVoice || (translating && !recordingVoice)
                          ? Colors.borderLight
                          : iconMuted
                    }
                    strokeWidth={2}
                  />
                </TouchableOpacity>
                {askFeatureEnabled ? (
                  <TouchableOpacity
                    style={styles.iconHit}
                    onPress={onAskPress}
                    activeOpacity={0.65}
                    disabled={
                      transcribingVoice ||
                      recordingVoice ||
                      (translating && !recordingAskVoice) ||
                      !!askBusyPhase
                    }
                    accessibilityLabel="Ask question with voice"
                  >
                    <MessageCircle
                      size={22}
                      color={
                        recordingAskVoice
                          ? Colors.primary
                          : transcribingVoice ||
                              recordingVoice ||
                              (translating && !recordingAskVoice) ||
                              askBusyPhase
                            ? Colors.borderLight
                            : iconMuted
                      }
                      strokeWidth={2}
                    />
                  </TouchableOpacity>
                ) : null}
                <View style={styles.flex1} />
                <Text style={styles.charCount}>{charCount}</Text>
              </View>
            </View>

            <View style={[styles.panel, styles.panelTarget]}>
              <View style={styles.panelTopBar}>
                <View style={styles.flex1} />
                <TouchableOpacity
                  style={styles.iconHit}
                  onPress={onToggleStar}
                  disabled={!translatedText}
                  activeOpacity={0.65}
                >
                  <Star
                    size={22}
                    color={translatedText ? starColor : Colors.border}
                    strokeWidth={2}
                    fill={starred ? starColor : 'transparent'}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.outScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {(translating || transcribingVoice || askBusyPhase) &&
                !translatedText &&
                !translateError ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={Colors.primary} size="small" />
                    <Text style={styles.loadingText}>
                      {askBusyPhase ? askLoadingLabel : transcribingVoice ? 'Transcribing…' : 'Translating…'}
                    </Text>
                  </View>
                ) : translateError ? (
                  <Text style={styles.errorText}>{translateError}</Text>
                ) : (
                  <Text style={styles.outText}>
                    {translatedText || (sourceText.trim() ? '' : 'Translation')}
                  </Text>
                )}
              </ScrollView>

              <View style={styles.panelToolbar}>
                <TouchableOpacity
                  style={styles.iconHit}
                  activeOpacity={0.5}
                  disabled={!translatedText}
                  onPress={onSpeakTranslation}
                  accessibilityLabel="Read translation aloud"
                >
                  <Volume2
                    size={22}
                    color={translatedText ? iconMuted : Colors.borderLight}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconHit}
                  onPress={onCopyTranslation}
                  disabled={!translatedText}
                  activeOpacity={0.65}
                  accessibilityLabel="Copy translation"
                >
                  <Copy
                    size={22}
                    color={translatedText ? iconMuted : Colors.borderLight}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconHit}
                  onPress={onShareTranslation}
                  disabled={!translatedText}
                  activeOpacity={0.65}
                  accessibilityLabel="Share translation"
                >
                  <Share2
                    size={22}
                    color={translatedText ? iconMuted : Colors.borderLight}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => navigation.navigate('TranslatorHistory')}
              activeOpacity={0.75}
            >
              <View style={styles.footerCircle}>
                <History size={20} color={Colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.footerLabel}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => navigation.navigate('TranslatorSaved')}
              activeOpacity={0.75}
            >
              <View style={styles.footerCircle}>
                <Bookmark size={20} color={Colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.footerLabel}>Saved</Text>
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
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  langBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  langText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
  },
  swapBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  langHint: {
    fontSize: 11,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  langHintVoice: {
    fontSize: 10,
    color: Colors.text.light,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    lineHeight: 14,
  },
  columns: {
    paddingHorizontal: 12,
    gap: 10,
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 168,
    backgroundColor: Colors.surface,
  },
  panelSource: {
    maxHeight: 280,
  },
  panelTarget: {
    minHeight: 200,
    backgroundColor: OUTPUT_TINT,
  },
  panelTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  sourceInput: {
    minHeight: 100,
    maxHeight: 200,
    fontSize: 18,
    lineHeight: 26,
    color: Colors.text.primary,
    paddingVertical: 8,
    marginTop: 4,
  },
  outScroll: {
    maxHeight: 220,
    marginTop: 4,
  },
  outText: {
    fontSize: 18,
    lineHeight: 26,
    color: Colors.text.primary,
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
    color: Colors.recording.active,
    lineHeight: 20,
    paddingVertical: 8,
  },
  panelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  iconHit: {
    padding: 8,
    marginHorizontal: -4,
  },
  charCount: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 48,
    marginTop: 10,
    // paddingTop: 18,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerItem: {
    alignItems: 'center',
  },
  footerCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});

export default TranslatorScreen;
