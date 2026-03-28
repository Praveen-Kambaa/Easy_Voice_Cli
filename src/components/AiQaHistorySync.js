import { useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { addAiQaHistory } from '../services/aiQaStorage';

/**
 * Saves floating Ask Question Q&A pairs (not logged via onTranscriptionComplete — that would
 * pollute speech history). Native emits FloatingMicService_onAskQuestionComplete with JSON.
 */
export const AiQaHistorySync = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const sub = DeviceEventEmitter.addListener(
      'FloatingMicService_onAskQuestionComplete',
      (payload) => {
        try {
          const raw = typeof payload === 'string' ? payload : String(payload ?? '');
          const o = JSON.parse(raw);
          const q = o?.question != null ? String(o.question).trim() : '';
          const a = o?.answer != null ? String(o.answer).trim() : '';
          if (q && a) addAiQaHistory({ question: q, answer: a });
        } catch (e) {
          console.warn('[AiQaHistorySync] parse/save', e?.message || e);
        }
      },
    );

    return () => sub.remove();
  }, []);

  return null;
};
