import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
} from 'react-native';
import { Search } from 'lucide-react-native';
import { Colors } from '../theme/Colors';

/**
 * Searchable full-screen modal for picking a translation language.
 *
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {{ code: string, name: string }[]} props.languages
 * @param {string} props.selectedCode
 * @param {(code: string) => void} props.onSelect
 */
export function LanguagePickerModal({
  visible,
  onClose,
  title,
  languages,
  selectedCode,
  onSelect,
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [languages, query]);

  const renderItem = ({ item }) => {
    const selected = item.code === selectedCode;
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => {
          Keyboard.dismiss();
          onSelect(item.code);
          onClose();
        }}
        activeOpacity={0.65}
      >
        <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
          {item.name}
        </Text>
        <Text style={styles.rowCode}>{item.code.toUpperCase()}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.backdrop]}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessibilityLabel="Close language picker"
        />
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.sheet} pointerEvents="auto">
            <Text style={styles.sheetTitle}>{title}</Text>

            <View style={styles.searchWrap}>
              <Search size={18} color={Colors.text.secondary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search language or code"
                placeholderTextColor={Colors.text.light}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              windowSize={10}
              ListEmptyComponent={
                <Text style={styles.empty}>No languages match your search.</Text>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: '78%',
    overflow: 'hidden',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text.primary,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text.primary,
    padding: 0,
  },
  list: {
    maxHeight: 340,
  },
  listContent: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  rowSelected: {
    backgroundColor: Colors.backgroundAlt,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text.primary,
    marginRight: 12,
  },
  rowTextSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
  rowCode: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: 0.5,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text.secondary,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});
