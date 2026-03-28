import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { History, Trash2 } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppHeader } from '../../components/Header/AppHeader';
import {
  getByCategory,
  clearCategory,
  ActivityCategory,
  ACTIVITY_HISTORY_UPDATED_EVENT,
} from '../../services/appActivityHistoryService';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';

const VoiceRecorderHistoryScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const [entries, setEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await getByCategory(ActivityCategory.VOICE_RECORDER, 300);
    setEntries(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ACTIVITY_HISTORY_UPDATED_EVENT, load);
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onClear = () => {
    showAlert('Clear history', 'Remove all Voice Command activity from this list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearCategory(ActivityCategory.VOICE_RECORDER);
          await load();
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.label}>{item.label}</Text>
      {item.meta ? <Text style={styles.meta} numberOfLines={3}>{item.meta}</Text> : null}
      <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <History size={36} color="#FFFFFF" strokeWidth={1.6} />
      </View>
      <Text style={styles.emptyTitle}>No activity yet</Text>
      <Text style={styles.emptyDesc}>
        Recording, transcription, and command actions from Voice Command will appear here.
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Voice Command history"
        onBack={() => navigation.goBack()}
        rightComponent={
          entries.length > 0 ? (
            <TouchableOpacity onPress={onClear} hitSlop={10}>
              <Trash2 size={20} color={Colors.text.secondary} strokeWidth={2} />
            </TouchableOpacity>
          ) : null
        }
      />
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={entries.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      />
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
  listEmpty: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  time: {
    fontSize: 11,
    color: Colors.text.light,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default VoiceRecorderHistoryScreen;
