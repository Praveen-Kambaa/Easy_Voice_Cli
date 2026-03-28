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
import { MessageSquareText, Trash2, Radio } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppHeader } from '../../components/Header/AppHeader';
import {
  FloatingSpeechHistoryService,
  FLOATING_SPEECH_UPDATED_EVENT,
} from '../../services/FloatingSpeechHistoryService';
import { formatDateTime } from '../../utils/dateTimeFormat';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';

/**
 * Speech history lists floating-mic transcriptions only (saved via FloatingSpeechHistorySync).
 * Overlay start/stop events are no longer mixed in so this screen shows what users expect: spoken text.
 */
const FloatingMicHistoryScreen = ({ navigation }) => {
  const showAlert = useAlert();
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const transcripts = await FloatingSpeechHistoryService.getAll();
    const sorted = transcripts
      .map((e) => ({
        rowKey: `t_${e.id}`,
        createdAt: e.createdAt,
        id: e.id,
        text: e.text,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setRows(sorted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FLOATING_SPEECH_UPDATED_EVENT, load);
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDeleteTranscript = (item) => {
    showAlert('Delete entry', 'Remove this transcript from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await FloatingSpeechHistoryService.deleteEntry(item.id);
          if (r.success) await load();
          else showAlert('Error', r.error || 'Could not delete');
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={[styles.card, styles.transcriptCard]}>
      <View style={styles.cardTop}>
        <View style={styles.badgeRow}>
          <Radio size={12} color={Colors.text.light} strokeWidth={2} />
          <Text style={styles.badgeText}>Transcript</Text>
        </View>
        <Text style={styles.dateText}>{formatDateTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.bodyText}>{item.text}</Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeleteTranscript(item)}
        hitSlop={8}
        activeOpacity={0.75}
      >
        <Trash2 size={16} color={Colors.recording.active} strokeWidth={2} />
        <Text style={styles.deleteLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MessageSquareText size={40} color="#FFFFFF" strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>No transcripts yet</Text>
      <Text style={styles.emptyDesc}>
        When you finish speaking with the floating mic, the recognized text is saved here. Open the app once
        after dictation so it can sync. Entries older than two days are removed automatically.
      </Text>
      <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('FloatingMic')}>
        <Text style={styles.emptyCtaText}>Open Floating Mic</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title="Speech History" />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.rowKey}
        renderItem={renderItem}
        contentContainerStyle={rows.length === 0 ? styles.listEmpty : styles.list}
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  transcriptCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.light,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  bodyText: {
    fontSize: 16,
    color: Colors.text.primary,
    lineHeight: 24,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  emptyCta: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default FloatingMicHistoryScreen;
