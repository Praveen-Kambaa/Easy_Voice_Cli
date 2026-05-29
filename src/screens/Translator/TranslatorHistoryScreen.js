import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { getLanguageName } from '../../constants/translationLanguages';
import {
  getTranslationHistory,
  deleteTranslationHistoryEntry,
} from '../../services/translationTextStorage';
import { useTheme } from '../../context/ThemeContext';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';

const TranslatorHistoryScreen = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);


  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setItems(await getTranslationHistory());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = (item) => {
    showAlert('Delete entry', 'Remove this translation from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteTranslationHistoryEntry(item.id);
          if (r.success) await load();
          else showAlert('Error', r.error || 'Could not delete');
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const from = getLanguageName(item.fromCode);
    const to = getLanguageName(item.toCode);
    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.langPill}>
            <Text style={styles.langPillText} numberOfLines={1}>
              {from} → {to}
            </Text>
          </View>
          <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete history item"
            style={styles.iconBtn}
          >
            <Trash2 size={18} color={colors.recording.active} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <Text style={styles.source} numberOfLines={3}>
          {item.sourceText}
        </Text>
        <Text style={styles.target} numberOfLines={4}>
          {item.translatedText}
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader title="Translation history" />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No translations yet</Text>
          <Text style={styles.emptySub}>
            Translated text from the Translate screen appears here. Entries older than two days are removed
            automatically; star a translation to keep it under Saved.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 24 + (insets?.bottom || 0) + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundAlt,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  timeStamp: {
    fontSize: 11,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.recording.activeBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flex: 1,
  },
  langPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  source: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  target: {
    marginTop: 10,
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
}



export default TranslatorHistoryScreen;
