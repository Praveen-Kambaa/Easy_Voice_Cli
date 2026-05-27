import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2, Bookmark } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import {
  getGrammarHistory,
  deleteGrammarHistoryEntry,
  toggleSavedGrammar,
  getSavedGrammar,
  getGrammarPairKey,
} from '../../services/grammarCheckStorage';
import { Colors } from '../../theme/Colors';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';

const GrammarCheckHistoryScreen = () => {
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [savedKeys, setSavedKeys] = useState(() => new Set());

  const load = useCallback(async () => {
    const [hist, saved] = await Promise.all([getGrammarHistory(), getSavedGrammar()]);
    setItems(hist);
    setSavedKeys(new Set(saved.map((s) => s.key)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = (item) => {
    showAlert('Delete entry', 'Remove this entry from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteGrammarHistoryEntry(item.id);
          if (r.success) await load();
          else showAlert('Error', r.error || 'Could not delete');
        },
      },
    ]);
  };

  const onToggleSave = async (item) => {
    await toggleSavedGrammar({ inputText: item.inputText, correctedText: item.correctedText });
    await load();
  };

  const renderItem = ({ item }) => {
    const key = getGrammarPairKey(item.inputText, item.correctedText);
    const isSaved = savedKeys.has(key);
    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
          <View style={styles.cardTopActions}>
            <TouchableOpacity
              onPress={() => onToggleSave(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from saved' : 'Save entry'}
              style={[styles.iconBtn, isSaved && styles.iconBtnActive]}
              activeOpacity={0.7}
            >
              <Bookmark
                size={18}
                color={isSaved ? Colors.primary : Colors.text.secondary}
                fill={isSaved ? Colors.primary : 'transparent'}
                strokeWidth={2}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtnDanger}
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Delete history item"
            >
              <Trash2 size={18} color={Colors.recording.active} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.inputText} numberOfLines={3}>{item.inputText}</Text>
        <Text style={styles.correctedText} numberOfLines={6}>{item.correctedText}</Text>
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader title="Grammar History" />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptySub}>
            Entries from the Grammar Check screen appear here. Entries older than two days are removed
            automatically — tap the star to keep them under Saved.
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

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Colors.backgroundAlt,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  cardTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeStamp: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(30, 136, 255, 0.10)',
    borderColor: 'rgba(30, 136, 255, 0.18)',
  },
  iconBtnDanger: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.recording.activeBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  correctedText: {
    marginTop: 10,
    fontSize: 15,
    color: Colors.text.secondary,
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

export default GrammarCheckHistoryScreen;
