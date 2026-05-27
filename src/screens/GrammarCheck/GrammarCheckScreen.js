import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { X, Copy, SendHorizonal, Bookmark, History } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Colors } from '../../theme/Colors';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { API_SERVERS, API_ENDPOINTS } from '../../config/api';
import {
  addGrammarHistory,
  isGrammarSaved,
  toggleSavedGrammar,
} from '../../services/grammarCheckStorage';

async function checkGrammarApi({ text, userId }) {
  const url = `${API_SERVERS.TYPE_EASY}${API_ENDPOINTS.GRAMMAR_CHECK}`;
  const body = new FormData();
  body.append('user_id', String(userId ?? ''));
  body.append('text', text.trim());
  body.append('fast', 'false');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { method: 'POST', body, signal: controller.signal });
    clearTimeout(timeoutId);
    let data;
    try { data = await response.json(); } catch { data = null; }
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

const GrammarCheckScreen = ({ navigation }) => {
  const { user } = useAuth();
  const showAlert = useAlert();

  const [inputText, setInputText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [starred, setStarred] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef(null);

  // Reset when navigating away and back
  useFocusEffect(
    useCallback(() => {
      return () => {
        setInputText('');
        setCorrectedText('');
        setLoading(false);
        setStarred(false);
      };
    }, []),
  );

  // Keep star in sync whenever the result changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputText.trim() || !correctedText) {
        setStarred(false);
        return;
      }
      const saved = await isGrammarSaved(inputText.trim(), correctedText);
      if (!cancelled) setStarred(saved);
    })();
    return () => { cancelled = true; };
  }, [inputText, correctedText]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setCorrectedText('');
    setStarred(false);
    const result = await checkGrammarApi({ text: trimmed, userId: user?.userId });
    setLoading(false);
    if (!result.success) {
      showAlert('Grammar Check', result.error);
      return;
    }
    setCorrectedText(result.corrected);
    await addGrammarHistory({ inputText: trimmed, correctedText: result.corrected });
    const saved = await isGrammarSaved(trimmed, result.corrected);
    setStarred(saved);
  };

  const handleClear = () => {
    setInputText('');
    setCorrectedText('');
    setStarred(false);
  };

  const handleCopy = () => {
    if (!correctedText) return;
    Clipboard.setString(correctedText);
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
      copyToastTimerRef.current = null;
    }, 2000);
  };

  const handleToggleStar = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !correctedText) return;
    const nowSaved = await toggleSavedGrammar({ inputText: trimmed, correctedText });
    setStarred(nowSaved);
  };

  const canSend = inputText.trim().length > 0 && !loading;
  const hasResult = correctedText.length > 0;
  const starColor = starred ? Colors.primary : Colors.text.secondary;

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader title="Grammar Check" />

      {copyToastVisible ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>Copied</Text>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Input card */}
          <View style={styles.card}>
            <Text style={styles.cardKicker}>INPUT</Text>
            <TextInput
              style={styles.input}
              placeholder="Type your sentence here…"
              placeholderTextColor={Colors.text.light}
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
              maxLength={2000}
            />
            <View style={styles.inputFooter}>
              {inputText.length > 0 ? (
                <TouchableOpacity
                  onPress={handleClear}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <X size={18} color={Colors.text.secondary} strokeWidth={2.2} />
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <View style={styles.inputFooterRight}>
                <Text style={styles.charCount}>{inputText.length}</Text>
                <TouchableOpacity
                  style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Check grammar"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <SendHorizonal size={16} color="#FFFFFF" strokeWidth={2.4} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Output card */}
          {(loading || hasResult) ? (
            <View style={styles.card}>
              <View style={styles.outputHeader}>
                <Text style={styles.outputKicker}>CORRECTED</Text>
                {hasResult ? (
                  <View style={styles.outputActions}>
                    <TouchableOpacity
                      onPress={handleToggleStar}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={starred ? 'Remove from saved' : 'Save correction'}
                    >
                      <Bookmark
                        size={18}
                        color={starColor}
                        fill={starred ? starColor : 'transparent'}
                        strokeWidth={2}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCopy}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Copy size={16} color={Colors.primary} strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loadingText}>Checking grammar…</Text>
                </View>
              ) : (
                <Text style={styles.outputText}>{correctedText}</Text>
              )}
            </View>
          ) : null}

          {/* Quick-link cards */}
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('GrammarCheckHistory')}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconBlue]}>
                <History size={18} color={Colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>History</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Recent checks</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickLinkCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('GrammarCheckSaved')}
            >
              <View style={[styles.quickLinkIcon, styles.quickLinkIconGold]}>
                <Bookmark size={18} color="#B45309" strokeWidth={2.2} />
              </View>
              <View style={styles.quickLinkTextCol}>
                <Text style={styles.quickLinkTitle}>Saved</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>Starred corrections</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Colors.backgroundAlt,
  },
  flex: {
    flex: 1,
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text.secondary,
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  input: {
    minHeight: 110,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.text.primary,
    fontWeight: '500',
    paddingVertical: 0,
  },
  inputFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  charCount: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  outputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  outputKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1.1,
  },
  outputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  outputText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: 12,
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

export default GrammarCheckScreen;
