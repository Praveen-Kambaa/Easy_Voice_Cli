import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { getSavedGrammar, toggleSavedGrammar } from '../../services/grammarCheckStorage';
import { useTheme } from '../../context/ThemeContext';
import { formatDateTime } from '../../utils/dateTimeFormat';

const GrammarCheckSavedScreen = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);


  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setItems(await getSavedGrammar());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const removeItem = async (item) => {
    await toggleSavedGrammar({ inputText: item.inputText, correctedText: item.correctedText });
    load();
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.timeStamp}>{formatDateTime(item.createdAt)}</Text>
        <TouchableOpacity
          onPress={() => removeItem(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Remove saved item"
          style={styles.iconBtn}
        >
          <Trash2 size={18} color={colors.text.secondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.inputText} numberOfLines={3}>{item.inputText}</Text>
      <Text style={styles.correctedText} numberOfLines={6}>{item.correctedText}</Text>
    </View>
  );

  return (
    <ScreenContainer style={styles.screen}>
      <AppHeader title="Saved corrections" />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved</Text>
          <Text style={styles.emptySub}>
            Tap the star on an entry in Grammar History to save it here. Saved items are kept until you remove
            them manually.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id || it.key}
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
  timeStamp: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  correctedText: {
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



export default GrammarCheckSavedScreen;
