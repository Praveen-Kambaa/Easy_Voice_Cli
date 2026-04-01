import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { History, Bookmark } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import AskQuestionAccessBlocked from '../../components/AskQuestion/AskQuestionAccessBlocked';
import { Colors } from '../../theme/Colors';
import {
  canAccessAskQuestionFeature,
  syncFloatingMicSettingsToNative,
} from '../../services/floatingMicConfig';

const AskQuestionScreen = ({ navigation }) => {
  const [answerField, setAnswerField] = useState('');
  const [accessAllowed, setAccessAllowed] = useState(null);

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
          <TextInput
            style={styles.input}
            value={answerField}
            onChangeText={setAnswerField}
            placeholder="Answer appears here…"
            placeholderTextColor={Colors.text.light}
            multiline
            textAlignVertical="top"
            autoCorrect
            scrollEnabled
          />
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
