import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Trash2, Star } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import {
  getAiQaHistory,
  deleteAiQaHistoryEntry,
  toggleSavedAiQa,
  getSavedAiQa,
  getAiQaPairKey,
} from '../../services/aiQaStorage';
import { Colors } from '../../theme/Colors';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';

const AiQaHistoryScreen = () => {
  const navigation = useNavigation();
  const showAlert = useAlert();
  const [items, setItems] = useState([]);
  const [savedKeys, setSavedKeys] = useState(() => new Set());

  const load = useCallback(async () => {
    const [hist, saved] = await Promise.all([getAiQaHistory(), getSavedAiQa()]);
    setItems(hist);
    setSavedKeys(new Set(saved.map((s) => s.key)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = (item) => {
    showAlert('Delete entry', 'Remove this Q&A from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteAiQaHistoryEntry(item.id);
          if (r.success) await load();
          else showAlert('Error', r.error || 'Could not delete');
        },
      },
    ]);
  };

  const onToggleSave = async (item) => {
    await toggleSavedAiQa({ question: item.question, answer: item.answer });
    await load();
  };

  const renderItem = ({ item }) => {
    const key = getAiQaPairKey(item.question, item.answer);
    const isSaved = savedKeys.has(key);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
          <TouchableOpacity
            onPress={() => onToggleSave(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Remove from saved' : 'Save Q and A'}
          >
            <Star
              size={20}
              color={isSaved ? Colors.primary : Colors.text.secondary}
              fill={isSaved ? Colors.primary : 'transparent'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>Question</Text>
        <Text style={styles.question}>{item.question}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Answer</Text>
        <Text style={styles.answer}>{item.answer}</Text>
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
  };

  return (
    <View style={styles.screen}>
      <AppHeader title="Q&A history" onBack={() => navigation.goBack()} />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Q&A yet</Text>
          <Text style={styles.emptySub}>
            Pairs from the floating Ask Question action (and from Translator Ask) appear here. Entries older than
            two days are removed automatically unless you tap the star to save them under Saved.
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timeStamp: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.light,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  question: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  answer: {
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

export default AiQaHistoryScreen;
