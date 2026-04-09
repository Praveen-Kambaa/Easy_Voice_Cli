import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { History, Bookmark, X } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import AskQuestionAccessBlocked from '../../components/AskQuestion/AskQuestionAccessBlocked';
import { Colors } from '../../theme/Colors';
import {
  canAccessAskQuestionFeature,
  syncFloatingMicSettingsToNative,
} from '../../services/floatingMicConfig';

function renderBoldMarkdown(text) {
  const str = String(text ?? '');
  if (!str.includes('**')) {
    return <Text style={styles.answerText}>{str}</Text>;
  }
  // Split by **...** and render odd indices as bold.
  const parts = str.split('**');
  return (
    <Text style={styles.answerText}>
      {parts.map((p, idx) =>
        idx % 2 === 1 ? (
          <Text key={`b-${idx}`} style={styles.answerBold}>
            {p}
          </Text>
        ) : (
          <Text key={`n-${idx}`}>{p}</Text>
        ),
      )}
    </Text>
  );
}

const AskQuestionScreen = ({ navigation }) => {
  const [answerField, setAnswerField] = useState('');
  const [accessAllowed, setAccessAllowed] = useState(null);
  const canClear = answerField.trim().length > 0;

  // Primary path: native floating overlay emits the answer payload; update UI directly.
  // This avoids relying on Accessibility "paste into focused field", which fails if nothing is focusable.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = DeviceEventEmitter.addListener('FloatingMicService_onAskQuestionComplete', (payload) => {
      try {
        const raw = typeof payload === 'string' ? payload : String(payload ?? '');
        const o = JSON.parse(raw);
        const a = o?.answer != null ? String(o.answer) : '';
        setAnswerField(a);
      } catch (e) {
        console.warn('[AskQuestionScreen] onAskQuestionComplete parse', e?.message || e);
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await syncFloatingMicSettingsToNative();
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

  if (accessAllowed === null) {
    return (
      <ScreenContainer>
        <AppHeader title="Ask Question" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!accessAllowed) {
    return <AskQuestionAccessBlocked navigation={navigation} />;
  }

  const historyBtn = (
    <TouchableOpacity
      onPress={() => navigation.navigate('AiQaHistory')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Open Q and A history"
    >
      <History size={22} color={Colors.text.primary} strokeWidth={2} />
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
      <AppHeader title="Ask Question" rightComponent={historyBtn} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.body}>
          <Text style={styles.hint}>
            Tap this field, then use the floating <Text style={styles.hintEm}>Ask Question</Text> action.
            Your speech is sent to the AI; the reply is pasted here. Open History to review or save Q&A
            pairs (unsaved items drop off after two days).
          </Text>
          <View style={styles.inputWrap}>
            <ScrollView style={styles.input} contentContainerStyle={styles.inputContent}>
              {canClear ? (
                renderBoldMarkdown(answerField)
              ) : (
                <Text style={styles.placeholderText}>Answer appears here…</Text>
              )}
            </ScrollView>
            {canClear ? (
              <TouchableOpacity
                onPress={() => setAnswerField('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear all text"
                style={styles.clearIconBtn}
              >
                <X size={18} color={Colors.text.secondary} strokeWidth={2.5} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerItem}
            onPress={() => navigation.navigate('AiQaHistory')}
            activeOpacity={0.75}
          >
            <View style={styles.footerCircle}>
              <History size={20} color={Colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.footerLabel}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerItem}
            onPress={() => navigation.navigate('AiQaSaved')}
            activeOpacity={0.75}
          >
            <View style={styles.footerCircle}>
              <Bookmark size={20} color={Colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.footerLabel}>Saved</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
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
  },
  hint: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  hintEm: {
    fontWeight: '700',
    color: Colors.text.primary,
  },
  inputWrap: {
    flex: 1,
    position: 'relative',
  },
  input: {
    flex: 1,
    minHeight: 200,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text.primary,
    marginBottom: 12,
    paddingRight: 44,
  },
  inputContent: {
    flexGrow: 1,
  },
  placeholderText: {
    fontSize: 16,
    color: Colors.text.light,
  },
  answerText: {
    fontSize: 16,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  answerBold: {
    fontWeight: '800',
    color: Colors.text.primary,
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
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  footerItem: {
    alignItems: 'center',
    gap: 6,
  },
  footerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});

export default AskQuestionScreen;
