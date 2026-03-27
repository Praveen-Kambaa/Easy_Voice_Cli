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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Mic,
  X,
  ArrowLeftRight,
  Star,
  Volume2,
  Share2,
  History,
  Bookmark,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader } from '../../components/Header/AppHeader';
import { getLanguageName } from '../../constants/translationLanguages';
import { translateText } from '../../services/textTranslationApi';
import {
  addTranslationHistory,
  isTranslationSaved,
  toggleSavedTranslation,
} from '../../services/translationTextStorage';
import { syncFloatingMicSettingsToNative } from '../../services/floatingMicConfig';
import { Colors } from '../../theme/Colors';

/** Subtle tint for translated block (light theme, matches “output” panel feel) */
const OUTPUT_TINT = 'rgba(14, 165, 233, 0.08)';

const TranslatorScreen = ({ navigation }) => {
  const [fromCode, setFromCode] = useState('en');
  const [toCode, setToCode] = useState('es');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translateError, setTranslateError] = useState('');
  const [translating, setTranslating] = useState(false);
  const [starred, setStarred] = useState(false);

  const requestIdRef = useRef(0);

  const openSettings = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent) parent.navigate('Settings');
    else navigation.navigate('Settings');
  }, [navigation]);

  const loadLanguages = useCallback(async () => {
    try {
      const f = await AsyncStorage.getItem('@from_language');
      const t = await AsyncStorage.getItem('@to_language');
      if (f) setFromCode(f);
      if (t) setToCode(t);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLanguages();
    }, [loadLanguages]),
  );

  useEffect(() => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setTranslatedText('');
      setTranslateError('');
      setTranslating(false);
      return;
    }

    const handle = setTimeout(async () => {
      const id = ++requestIdRef.current;
      setTranslating(true);
      setTranslateError('');
      try {
        const out = await translateText({
          text: trimmed,
          sourceLanguage: fromCode,
          targetLanguage: toCode,
        });
        if (id !== requestIdRef.current) return;
        setTranslatedText(out);
        await addTranslationHistory({
          sourceText: trimmed,
          translatedText: out,
          fromCode,
          toCode,
        });
      } catch (e) {
        if (id !== requestIdRef.current) return;
        setTranslatedText('');
        setTranslateError(e?.message || 'Translation failed');
      } finally {
        if (id === requestIdRef.current) setTranslating(false);
      }
    }, 480);

    return () => clearTimeout(handle);
  }, [sourceText, fromCode, toCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sourceText.trim() || !translatedText) {
        if (!cancelled) setStarred(false);
        return;
      }
      const s = await isTranslationSaved(sourceText.trim(), fromCode, toCode);
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
    setSourceText('');
    setTranslatedText('');
    setTranslateError('');
  };

  const onMicPress = () => {
    /* Voice input — wire when API/flow is ready */
  };

  const onShareTranslation = async () => {
    if (!translatedText) return;
    try {
      await Share.share({ message: translatedText });
    } catch {
      // user dismissed
    }
  };

  const onToggleStar = async () => {
    const src = sourceText.trim();
    if (!src || !translatedText) return;
    const nowSaved = await toggleSavedTranslation({
      sourceText: src,
      translatedText,
      fromCode,
      toCode,
    });
    setStarred(nowSaved);
  };

  const charCount = sourceText.length;
  const fromName = getLanguageName(fromCode);
  const toName = getLanguageName(toCode);

  const iconMuted = Colors.text.secondary;
  const starColor = starred ? '#F59E0B' : Colors.text.secondary;

  return (
    <View style={styles.screen}>
      <AppHeader title="Translate" />

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.kav} behavior="padding" keyboardVerticalOffset={8}>
          <TranslatorScrollBody
            navigation={navigation}
            fromName={fromName}
            toName={toName}
            openSettings={openSettings}
            swapLanguages={swapLanguages}
            sourceText={sourceText}
            setSourceText={setSourceText}
            translatedText={translatedText}
            translateError={translateError}
            translating={translating}
            starred={starred}
            charCount={charCount}
            iconMuted={iconMuted}
            starColor={starColor}
            clearSource={clearSource}
            onMicPress={onMicPress}
            onToggleStar={onToggleStar}
            onShareTranslation={onShareTranslation}
          />
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.kav}>
          <TranslatorScrollBody
            navigation={navigation}
            fromName={fromName}
            toName={toName}
            openSettings={openSettings}
            swapLanguages={swapLanguages}
            sourceText={sourceText}
            setSourceText={setSourceText}
            translatedText={translatedText}
            translateError={translateError}
            translating={translating}
            starred={starred}
            charCount={charCount}
            iconMuted={iconMuted}
            starColor={starColor}
            clearSource={clearSource}
            onMicPress={onMicPress}
            onToggleStar={onToggleStar}
            onShareTranslation={onShareTranslation}
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
  openSettings,
  swapLanguages,
  sourceText,
  setSourceText,
  translatedText,
  translateError,
  translating,
  starred,
  charCount,
  iconMuted,
  starColor,
  clearSource,
  onMicPress,
  onToggleStar,
  onShareTranslation,
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
            <TouchableOpacity style={styles.langBtn} onPress={openSettings} activeOpacity={0.7}>
              <Text style={styles.langText} numberOfLines={1}>
                {fromName}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.swapBtn} onPress={swapLanguages} activeOpacity={0.75}>
              <ArrowLeftRight size={22} color={Colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.langBtn} onPress={openSettings} activeOpacity={0.7}>
              <Text style={styles.langText} numberOfLines={1}>
                {toName}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.langHint}>Languages are saved in Settings</Text>

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
                onChangeText={setSourceText}
                multiline
                textAlignVertical="top"
                scrollEnabled
                maxLength={5000}
              />
              <View style={styles.panelToolbar}>
                <TouchableOpacity style={styles.iconHit} onPress={onMicPress} activeOpacity={0.65}>
                  <Mic size={22} color={iconMuted} strokeWidth={2} />
                </TouchableOpacity>
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
                {translating && !translatedText && !translateError ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={Colors.primary} size="small" />
                    <Text style={styles.loadingText}>Translating…</Text>
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
                <TouchableOpacity style={styles.iconHit} activeOpacity={0.5} disabled={!translatedText}>
                  <Volume2
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
    marginBottom: 8,
    paddingHorizontal: 20,
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
