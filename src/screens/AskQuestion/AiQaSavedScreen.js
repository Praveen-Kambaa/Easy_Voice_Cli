import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { getSavedAiQa, toggleSavedAiQa } from '../../services/aiQaStorage';
import { Colors } from '../../theme/Colors';
import { formatDateTime } from '../../utils/dateTimeFormat';

const AiQaSavedScreen = () => {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setItems(await getSavedAiQa());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const removeItem = async (item) => {
    await toggleSavedAiQa({ question: item.question, answer: item.answer });
    load();
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
        <TouchableOpacity onPress={() => removeItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Trash2 size={18} color={Colors.text.secondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.label}>Question</Text>
      <Text style={styles.question}>{item.question}</Text>
      <View style={styles.divider} />
      <Text style={styles.label}>Answer</Text>
      <Text style={styles.answer}>{item.answer}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title="Saved Q&A" onBack={() => navigation.goBack()} />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved</Text>
          <Text style={styles.emptySub}>
            Tap the star on an entry in Q&A history to save it here. Saved pairs are kept until you remove them;
            history without a star drops off after two days.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id || it.key}
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

export default AiQaSavedScreen;
