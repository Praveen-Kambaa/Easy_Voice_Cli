import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { getLanguageName } from '../../constants/translationLanguages';
import {
  getTranslationHistory,
  deleteTranslationHistoryEntry,
} from '../../services/translationTextStorage';
import { Colors } from '../../theme/Colors';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';

const TranslatorHistoryScreen = () => {
  const navigation = useNavigation();
  const showAlert = useAlert();
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

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
      <Text style={styles.meta}>
        {getLanguageName(item.fromCode)} → {getLanguageName(item.toCode)}
      </Text>
      <Text style={styles.source}>{item.sourceText}</Text>
      <View style={styles.divider} />
      <Text style={styles.target}>{item.translatedText}</Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.75}
      >
        <Trash2 size={16} color={Colors.recording.active} strokeWidth={2} />
        <Text style={styles.deleteLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
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
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  timeStamp: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  meta: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.light,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  source: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  target: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
    marginBottom: 10,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.recording.activeBg,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.recording.active,
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
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default TranslatorHistoryScreen;
