import React from 'react';
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { formatTime } from '../utils/dateTimeFormat';

const { FloatingMicModule } = NativeModules;

export const useSpeechToTextDebug = () => {
  const [debugLogs, setDebugLogs] = React.useState([]);
  const [isListening, setIsListening] = React.useState(false);

  const addLog = React.useCallback((message, type = 'info') => {
    const timestamp = formatTime(new Date());
    setDebugLogs(prev => [...prev, { message, type, timestamp }]);
  }, []);

  const checkTextInsertion = React.useCallback((expectedText) => {
    addLog(`📝 Expected text insertion: "${expectedText}"`, 'info');
    setTimeout(() => {
      addLog('🔍 Check if text appeared in active field', 'warning');
      addLog('💡 If not inserted, check:', 'warning');
      addLog('  1. Accessibility service enabled?', 'warning');
      addLog('  2. Text field focused?', 'warning');
      addLog('  3. App blocking accessibility?', 'warning');
    }, 2000);
  }, [addLog]);

  React.useEffect(() => {
    const eventListeners = [
      DeviceEventEmitter.addListener('FloatingMicService_onRecordingStart', () => {
        addLog('🎤 Recording started', 'info');
        setIsListening(true);
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onSpeechResult', (text) => {
        addLog(`✅ Speech recognized: "${text}"`, 'success');
        setIsListening(false);
        setTimeout(() => {
          checkTextInsertion(text);
        }, 1000);
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onPartialResult', (text) => {
        addLog(`🔄 Partial: "${text}"`, 'info');
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onError', (error) => {
        addLog(`❌ Error: ${error}`, 'error');
        setIsListening(false);
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onOverlayCreated', () => {
        addLog('🔵 Floating overlay created', 'success');
      }),
    ];

    return () => {
      eventListeners.forEach(listener => listener.remove());
    };
  }, [addLog, checkTextInsertion]);

  const testSpeechRecognition = async () => {
    try {
      addLog('🧪 Testing speech recognition...', 'info');
      
      if (Platform.OS !== 'android') {
        addLog('❌ Speech recognition only works on Android', 'error');
        return;
      }

      const permissions = await FloatingMicModule.checkPermissions();
      
      if (!permissions.recordAudio) {
        addLog('❌ Microphone permission not granted', 'error');
        return;
      }

      if (!permissions.accessibility) {
        addLog('❌ Accessibility service not enabled', 'error');
        return;
      }

      addLog('✅ All permissions OK', 'success');
      addLog('🎤 Try speaking into your device...', 'info');
      
    } catch (error) {
      addLog(`❌ Test failed: ${error.message}`, 'error');
    }
  };

  const clearLogs = () => {
    setDebugLogs([]);
  };

  return {
    debugLogs,
    isListening,
    testSpeechRecognition,
    clearLogs,
    addLog,
  };
};
