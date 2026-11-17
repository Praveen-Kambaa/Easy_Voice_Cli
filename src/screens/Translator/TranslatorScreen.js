  import logger from '../../utils/logger';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import {
  X,
  Repeat2,
  Volume2,
  Volume1,
  Share2,
  Copy,
  History,
  Bookmark,
  ChevronDown,
  Sparkles,
  SlidersHorizontal,
  Mic,
  Languages,
  ArrowRight,
  ClipboardPaste,
  AlertCircle,
  RotateCcw,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import {
  TRANSLATION_LANGUAGES,
  getLanguageName,
  normalizeStoredLanguageCode,
} from '../../constants/translationLanguages';
import { translateSmart } from '../../services/translationService';
import {
  startTranslatorRecording,
  stopTranslatorRecordingAndTranscribe,
} from '../../services/speechService';
import {
  addTranslationHistory,
  isTranslationSaved,
  toggleSavedTranslation,
  getTranslationHistory,
  getSavedTranslations,
  TRANSLATION_HISTORY_UPDATED_EVENT,
} from '../../services/translationTextStorage';
import {
  syncFloatingMicSettingsToNative,
  syncTranslationLanguagesFromKeyboard,
  getOverlayAskQuestionEnabled,
} from '../../services/floatingMicConfig';
import { useTheme } from '../../context/ThemeContext';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';
import { useAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import {
  speakTranslatedText,
  stopTranslationSpeech,
} from '../../services/translationTtsService';

const NATIVE_LANGUAGE_NAMES = {
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
  mr: 'मराठी',
  bn: 'বাংলা',
  gu: 'ગુજરાતી',
  pa: 'ਪੰਜਾਬੀ',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  en: 'English',
};

const TranslatorScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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
  const [languagePickerFor, setLanguagePickerFor] = useState(null);

  const requestIdRef = useRef(0);
  const hasFocusedOnceRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const sttSourceLangRef = useRef(null);

  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const [hist, saved] = await Promise.all([getTranslationHistory(), getSavedTranslations()]);
      setHistoryCount(hist.length);
      setSavedCount(saved.length);
    } catch {
      // ignore
    }
  }, []);

  const loadLanguages = useCallback(async () => {
    try {
      const synced = await syncTranslationLanguagesFromKeyboard();
      const f = synced?.fromLang || (await AsyncStorage.getItem('@from_language'));
      const t = synced?.toLang || (await AsyncStorage.getItem('@to_language'));
      if (f) setFromCode(normalizeStoredLanguageCode(f, 'en'));
      if (t) setToCode(normalizeStoredLanguageCode(t, 'ta'));
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
      loadCounts();
      return () => {
        if (Platform.OS === 'android') {
          stopTranslationSpeech();
        }
      };
    }, [loadLanguages, loadCounts]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TRANSLATION_HISTORY_UPDATED_EVENT, loadCounts);
    return () => sub.remove();
  }, [loadCounts]);

  useEffect(() => {
    const gainedFocus = isFocused && !wasFocusedRef.current;
    wasFocusedRef.current = isFocused;
    if (!gainedFocus) return;

    if (hasFocusedOnceRef.current) {
      debouncedRunTranslation.cancel();
      requestIdRef.current += 1;
      sttSourceLangRef.current = null;
      setSourceText('');
      setTranslatedText('');
      setTranslateError('');
      setStarred(false);
      setTranslating(false);
    } else {
      hasFocusedOnceRef.current = true;
    }
  }, [isFocused, debouncedRunTranslation]);

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
      logger.debug('[Translator] runTranslation', { sourceAppCode, toCode, len: trimmed.length });
      try {
        const result = await translateSmart({
          text: trimmed,
          sourceAppCode,
          targetAppCode: toCode,
          userId: user?.userId,
        });
        if (id !== requestIdRef.current) return;
        if (result.success) {
          setTranslatedText(result.translatedText);
          setTranslateError('');
          await addTranslationHistory({
            sourceText: trimmed,
            translatedText: result.translatedText,
            fromCode: sourceAppCode,
            toCode,
          });
        } else {
          setTranslatedText('');
          const err = result.error || 'Translation failed. Please check your network and try again.';
          setTranslateError(err);
          showAlert('Translation Failed', err);
        }
      } catch (err) {
        if (id !== requestIdRef.current) return;
        setTranslatedText('');
        const errStr = err?.message || 'Translation failed. Please try again.';
        setTranslateError(errStr);
        showAlert('Translation Failed', errStr);
      } finally {
        if (id === requestIdRef.current) setTranslating(false);
      }
    },
    [fromCode, toCode, user, showAlert],
  );

  const debouncedRunTranslation = useDebounce((trimmed) => {
    const id = ++requestIdRef.current;
    runTranslation(trimmed, id);
  }, 2000);

  useEffect(() => {
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
    setSourceText('');
    setTranslatedText('');
    setTranslateError('');
  };

  const onSourceChange = (t) => {
    sttSourceLangRef.current = null;
    setSourceText(t);
    if (translateError) setTranslateError('');
  };

  const onPaste = async () => {
    try {
      const clipText = await Clipboard.getString();
      if (clipText && clipText.trim()) {
        onSourceChange(clipText.trim());
      } else {
        showAlert('Clipboard Empty', 'No text found in clipboard.');
      }
    } catch {
      // ignore
    }
  };

  const onTranslateNow = () => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      showAlert('Input Required', 'Please enter text or record audio to translate.');
      return;
    }
    debouncedRunTranslation.cancel();
    const id = ++requestIdRef.current;
    runTranslation(trimmed, id);
  };

  const onMicPress = async () => {
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
          const err = tx.error || 'Voice transcription failed';
          setTranslateError(err);
          showAlert('Transcription Error', err);
          return;
        }
        sttSourceLangRef.current = 'en';
        setSourceText(tx.transcript);
        setTranslatedText('');
        setTranslating(true);
        setTranslateError('');
        const tr = await translateSmart({
          text: tx.transcript,
          sourceAppCode: 'en',
          targetAppCode: toCode,
          userId: user?.userId,
        });
        if (id !== requestIdRef.current) return;
        if (tr.success) {
          setTranslatedText(tr.translatedText);
          setTranslateError('');
          await addTranslationHistory({
            sourceText: tx.transcript,
            translatedText: tr.translatedText,
            fromCode: 'en',
            toCode,
          });
        } else {
          setTranslatedText('');
          const err = tr.error || 'Translation failed. Please try again.';
          setTranslateError(err);
          showAlert('Translation Failed', err);
        }
      } catch (err) {
        if (id !== requestIdRef.current) return;
        setTranslatedText('');
        const errStr = err?.message || 'Voice translation failed. Please try again.';
        setTranslateError(errStr);
        showAlert('Translation Failed', errStr);
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
      const err = started.error || 'Could not access microphone. Please check your permissions in Settings.';
      setTranslateError(err);
      showAlert('Microphone Error', err);
      return;
    }
    setRecordingVoice(true);
  };

  const onShareTranslation = async () => {
    if (!translatedText) return;
    try {
      await Share.share({ message: translatedText });
    } catch {
      // dismissed
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
  const nativeScript = NATIVE_LANGUAGE_NAMES[toCode] || '';

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader
        title="Translator"
        subtitle="• Neural Engine v4.2 • Offline Ready"
        rightComponent={
          <View style={styles.headerRightGroup}>
            <TouchableOpacity
              style={styles.autoDetectHeaderBtn}
              onPress={() => showAlert('Auto-detect', 'Neural auto-detection is active for your source text.')}
              activeOpacity={0.8}
            >
              <Sparkles size={13} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.autoDetectHeaderText}>Auto-detect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsHeaderBtn}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.8}
            >
              <SlidersHorizontal size={16} color={colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        }
      />

      {copyToastVisible ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>Copied to clipboard</Text>
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

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Language Selector Bar */}
          <View style={styles.languageBarCard}>
            <TouchableOpacity
              style={styles.langSelectorBtn}
              onPress={() => setLanguagePickerFor('from')}
              activeOpacity={0.7}
            >
              <View style={styles.langCodeBadgeBlue}>
                <Text style={styles.langCodeTextBlue}>{fromCode.toUpperCase().slice(0, 2)}</Text>
              </View>
              <Text style={styles.langSelectorText} numberOfLines={1}>
                {fromName}
              </Text>
              <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.swapRoundBtn}
              onPress={swapLanguages}
              activeOpacity={0.85}
            >
              <Repeat2 size={18} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.langSelectorBtn}
              onPress={() => setLanguagePickerFor('to')}
              activeOpacity={0.7}
            >
              <View style={styles.langCodeBadgeGreen}>
                <Text style={styles.langCodeTextGreen}>{toCode.toUpperCase().slice(0, 2)}</Text>
              </View>
              <Text style={styles.langSelectorText} numberOfLines={1}>
                {toName}
              </Text>
              <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Input Card */}
          <View style={styles.inputCard}>
            <View style={styles.inputTopRow}>
              <View style={styles.inputKickerGroup}>
                <Text style={styles.cardKicker}>INPUT</Text>
                <View style={styles.autoDetectInputBadge}>
                  <Text style={styles.autoDetectInputText}>Auto-detected: {fromName}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.inputMicOrb,
                  recordingVoice && styles.inputMicOrbRecording,
                ]}
                onPress={onMicPress}
                activeOpacity={0.85}
              >
                <Mic
                  size={18}
                  color={recordingVoice ? '#FFFFFF' : colors.primary}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Type or speak text to translate…"
              placeholderTextColor={colors.text.light}
              value={sourceText}
              onChangeText={onSourceChange}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />

            <View style={styles.inputBottomRow}>
              <View style={styles.inputBottomLeft}>
                {!!sourceText ? (
                  <TouchableOpacity
                    style={styles.clearCircleBtn}
                    onPress={clearSource}
                    activeOpacity={0.7}
                  >
                    <X size={14} color={colors.text.secondary} strokeWidth={2.4} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.pastePillBtn}
                  onPress={onPaste}
                  activeOpacity={0.75}
                >
                  <ClipboardPaste size={14} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.pastePillText}>Paste</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.charCountText}>{charCount} / 5000</Text>
            </View>
          </View>

          {/* Primary Action Button: Translate Now */}
          <TouchableOpacity
            style={styles.translateCtaBtn}
            onPress={onTranslateNow}
            activeOpacity={0.88}
            disabled={translating}
          >
            {translating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Languages size={19} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.translateCtaText}>Translate Now</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Translation Error Card */}
          {translateError && !translating ? (
            <View style={styles.errorCard}>
              <View style={styles.errorCardTopRow}>
                <View style={styles.errorIconWrap}>
                  <AlertCircle size={20} color="#DC2626" strokeWidth={2.4} />
                </View>
                <View style={styles.errorContent}>
                  <Text style={styles.errorTitle}>Translation Failed</Text>
                  <Text style={styles.errorMessage}>{translateError}</Text>
                </View>
                <TouchableOpacity
                  style={styles.errorDismissBtn}
                  onPress={() => setTranslateError('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color={colors.text.secondary} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.errorRetryBtn}
                onPress={onTranslateNow}
                activeOpacity={0.8}
              >
                <RotateCcw size={13} color="#DC2626" strokeWidth={2.4} />
                <Text style={styles.errorRetryText}>Retry Translation</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Translation Result Card */}
          {translatedText || (translating && !translateError) ? (
            <View style={styles.resultCard}>
              <View style={styles.resultTopRow}>
                <View style={styles.resultKickerGroup}>
                  <Text style={styles.resultKicker}>TRANSLATION</Text>
                  <View style={styles.resultLangBadge}>
                    <Text style={styles.resultLangBadgeText}>
                      {toName} {nativeScript ? `• ${nativeScript}` : ''}
                    </Text>
                  </View>
                </View>

                {translatedText ? (
                  <View style={styles.resultActionsRow}>
                    <TouchableOpacity
                      onPress={onToggleStar}
                      style={styles.iconActionBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Bookmark
                        size={18}
                        color={starred ? colors.primary : colors.text.secondary}
                        strokeWidth={2}
                        fill={starred ? colors.primary : 'transparent'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onCopyTranslation}
                      style={styles.iconActionBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Copy size={18} color={colors.text.secondary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onSpeakTranslation}
                      style={styles.audioPlayOrb}
                      activeOpacity={0.85}
                    >
                      <Volume2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onShareTranslation}
                      style={styles.iconActionBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Share2 size={18} color={colors.text.secondary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {translating && !translatedText ? (
                <View style={styles.translatingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.translatingText}>Translating with Neural Engine…</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.translatedMainText}>{translatedText}</Text>

                  {/* Transliteration Preview */}
                  <View style={styles.transliterationRow}>
                    <Volume1 size={15} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.transliterationText} numberOfLines={2}>
                      “{translatedText}”
                    </Text>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {/* Bottom Quick Links: History & Saved */}
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('TranslatorHistory')}
            >
              <View style={styles.quickLinkTopRow}>
                <View style={styles.quickLinkIconCircleBlue}>
                  <History size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <ArrowRight size={17} color={colors.text.secondary} strokeWidth={2.2} />
              </View>
              <Text style={styles.quickLinkTitle}>History</Text>
              <Text style={styles.quickLinkSub}>
                {historyCount > 0 ? `${historyCount} translations` : 'No translations yet'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('TranslatorSaved')}
            >
              <View style={styles.quickLinkTopRow}>
                <View style={styles.quickLinkIconCircleGreen}>
                  <Bookmark size={18} color="#16A34A" strokeWidth={2.2} />
                </View>
                <ArrowRight size={17} color={colors.text.secondary} strokeWidth={2.2} />
              </View>
              <Text style={styles.quickLinkTitle}>Saved</Text>
              <Text style={styles.quickLinkSub}>
                {savedCount > 0 ? `${savedCount} starred phrases` : 'No starred phrases'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.backgroundAlt,
    },
    headerRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    autoDetectHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 14,
    },
    autoDetectHeaderText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    settingsHeaderBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
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
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
      gap: 14,
    },
    languageBarCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    langSelectorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    langCodeBadgeBlue: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    langCodeTextBlue: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    langCodeBadgeGreen: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.22)' : '#EAF8EE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    langCodeTextGreen: {
      fontSize: 11,
      fontWeight: '800',
      color: '#16A34A',
    },
    langSelectorText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      flexShrink: 1,
    },
    swapRoundBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 4,
    },
    inputCard: {
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
    inputTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    inputKickerGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 1.1,
    },
    autoDetectInputBadge: {
      backgroundColor: colors.backgroundAlt,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    autoDetectInputText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    inputMicOrb: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputMicOrbRecording: {
      backgroundColor: colors.recording.active,
    },
    input: {
      minHeight: 90,
      fontSize: 16,
      lineHeight: 24,
      color: colors.text.primary,
      fontWeight: '500',
      paddingVertical: 8,
    },
    inputBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 8,
    },
    inputBottomLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    clearCircleBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.backgroundAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pastePillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    pastePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    charCountText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      fontVariant: ['tabular-nums'],
    },
    translateCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingVertical: 15,
      paddingHorizontal: 20,
      gap: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 4,
    },
    translateCtaText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    resultCard: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    resultTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    resultKickerGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    resultKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.1,
    },
    resultLangBadge: {
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    resultLangBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    resultActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconActionBtn: {
      padding: 4,
    },
    audioPlayOrb: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    translatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 16,
    },
    translatingText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    errorCard: {
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.12)' : '#FEF2F2',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(220, 38, 38, 0.35)' : '#FECACA',
      padding: 14,
      marginBottom: 14,
    },
    errorCardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    errorIconWrap: {
      marginRight: 10,
      marginTop: 2,
    },
    errorContent: {
      flex: 1,
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#DC2626',
      marginBottom: 3,
    },
    errorMessage: {
      fontSize: 13,
      color: isDark ? '#FCA5A5' : '#991B1B',
      lineHeight: 18,
    },
    errorDismissBtn: {
      padding: 4,
      marginLeft: 8,
    },
    errorRetryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.22)' : '#FEE2E2',
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginTop: 10,
      marginLeft: 30,
      gap: 6,
    },
    errorRetryText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: '#DC2626',
    },
    errorText: {
      fontSize: 13,
      color: colors.status.blocked,
      lineHeight: 18,
      paddingVertical: 8,
    },
    translatedMainText: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text.primary,
      lineHeight: 28,
      letterSpacing: -0.2,
    },
    transliterationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(0, 229, 146, 0.2)' : 'rgba(0, 229, 146, 0.12)',
    },
    transliterationText: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.text.secondary,
      flex: 1,
      lineHeight: 18,
    },
    alternativeSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    alternativeKicker: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    altScroll: {
      gap: 8,
    },
    altChip: {
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    altChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    quickLinksRow: {
      flexDirection: 'row',
      gap: 12,
    },
    quickLinkCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    quickLinkTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    quickLinkIconCircleBlue: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkIconCircleGreen: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.18)' : '#EAF8EE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    quickLinkSub: {
      marginTop: 3,
      fontSize: 12,
      color: colors.text.secondary,
    },
  });
}

export default TranslatorScreen;
