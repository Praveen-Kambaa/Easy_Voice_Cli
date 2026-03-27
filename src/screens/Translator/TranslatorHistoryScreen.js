import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppHeader } from '../../components/Header/AppHeader';
import { getLanguageName } from '../../constants/translationLanguages';
import { getTranslationHistory } from '../../services/translationTextStorage';
import { Colors } from '../../theme/Colors';

const TranslatorHistoryScreen = () => {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setItems(await getTranslationHistory());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.meta}>
        {getLanguageName(item.fromCode)} → {getLanguageName(item.toCode)}
      </Text>
      <Text style={styles.source}>{item.sourceText}</Text>
      <View style={styles.divider} />
      <Text style={styles.target}>{item.translatedText}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title="Translation history" onBack={() => navigation.goBack()} />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No translations yet</Text>
          <Text style={styles.emptySub}>Translated text from the Translate screen appears here.</Text>
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
