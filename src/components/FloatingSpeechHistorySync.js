import logger from '../utils/logger';
import { useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { FloatingSpeechHistoryService } from '../services/FloatingSpeechHistoryService';

/**
 * Subscribes to floating-mic final transcription events app-wide so history is saved
 * even when the Floating Mic settings screen is not mounted.
 */
export const FloatingSpeechHistorySync = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const sub = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionComplete',
      (text) => {
        logger.debug('🎯 FloatingSpeechHistorySync: Received transcription:', text);
        FloatingSpeechHistoryService.appendFromFloatingMic(text);
      },
    );

    return () => sub.remove();
  }, []);

  return null;
};
