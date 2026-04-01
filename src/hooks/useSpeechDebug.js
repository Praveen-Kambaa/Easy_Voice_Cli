import React, { useState, useEffect } from 'react';
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { formatTime } from '../utils/dateTimeFormat';
import { useAlert } from '../context/AlertContext';

const { FloatingMicModule } = NativeModules;

export const useSpeechDebug = () => {
  const showAlert = useAlert();
  const [debugLogs, setDebugLogs] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscription, setLastTranscription] = useState('');
  const [insertionStatus, setInsertionStatus] = useState('pending');

  useEffect(() => {
    const listeners = [
      DeviceEventEmitter.addListener('FloatingMicService_onRecordingStart', () => {
        addLog('🎤 RECORDING: Started', 'info');
        setIsListening(true);
        setInsertionStatus('pending');
      }),
      
      DeviceEventEmitter.addListener('FloatingMicService_onSpeechResult', (text) => {
        addLog(`✅ TRANSCRIPTION: "${text}"`, 'success');
        setLastTranscription(text);
        setIsListening(false);
        setInsertionStatus('processing');
        
        // Check if text was sent to accessibility
        setTimeout(() => {
          addLog(`📤 SENT: Text sent to accessibility service`, 'info');
          setInsertionStatus('sent');
          
          // Check insertion after delay
          setTimeout(() => {
            addLog(`🔍 VERIFY: Check if text appeared in active field`, 'warning');
            setInsertionStatus('verify');
          }, 2000);
        }, 500);
      }),
      
      DeviceEventEmitter.addListener('FloatingMicService_onPartialResult', (text) => {
        addLog(`🔄 PARTIAL: "${text}"`, 'info');
      }),
      
      DeviceEventEmitter.addListener('FloatingMicService_onError', (error) => {
        addLog(`❌ ERROR: ${error}`, 'error');
        setIsListening(false);
        setInsertionStatus('failed');
      }),
    ];

    return () => listeners.forEach(listener => listener.remove());
  }, []);

  const addLog = (message, type = 'info') => {
    const timestamp = formatTime(new Date());
    setDebugLogs(prev => [...prev.slice(-19), { message, type, timestamp }]);
  };

  const runFullDiagnostic = async () => {
    addLog('🧪 STARTING FULL DIAGNOSTIC', 'info');
    
    try {
      // Check Android
      if (Platform.OS !== 'android') {
        addLog('❌ Platform: Not Android', 'error');
        return;
      }
      addLog('✅ Platform: Android', 'success');

      // Check permissions
      const permissions = await FloatingMicModule.checkPermissions();
      
      if (!permissions.recordAudio) {
        addLog('❌ RECORD_AUDIO: Not granted', 'error');
        showAlert('Permission Required', 'Please grant microphone permission');
        return;
      }
      addLog('✅ RECORD_AUDIO: Granted', 'success');

      if (!permissions.overlay) {
        addLog('❌ OVERLAY: Not granted', 'error');
        showAlert('Permission Required', 'Please grant overlay permission');
        return;
      }
      addLog('✅ OVERLAY: Granted', 'success');

      if (!permissions.accessibility) {
        addLog('❌ ACCESSIBILITY: Not enabled', 'error');
        showAlert('Service Required', 'Please enable accessibility service');
        return;
      }
      addLog('✅ ACCESSIBILITY: Enabled', 'success');

      addLog('🎯 ALL CHECKS PASSED - Ready to test', 'success');
      addLog('💡 Tap mic and speak to test transcription', 'info');

    } catch (error) {
      addLog(`❌ DIAGNOSTIC FAILED: ${error.message}`, 'error');
    }
  };

  const testTranscriptionOnly = () => {
    addLog('🎤 TESTING TRANSCRIPTION ONLY', 'info');
    addLog('1. Tap the floating mic', 'info');
    addLog('2. Speak clearly', 'info');
    addLog('3. Check for TRANSCRIPTION success message', 'info');
    addLog('4. If no transcription, check audio permissions', 'warning');
  };

  const testInsertionOnly = () => {
    addLog('📝 TESTING TEXT INSERTION', 'info');
    addLog('1. Open WhatsApp/Instagram/Messages', 'info');
    addLog('2. Tap on any text field to focus it', 'info');
    addLog('3. Use the floating mic to transcribe', 'info');
    addLog('4. Text should appear in the focused field', 'info');
    addLog('5. If not, check accessibility service', 'warning');
  };

  const clearLogs = () => {
    setDebugLogs([]);
    setLastTranscription('');
    setInsertionStatus('pending');
  };

  const getInsertionStatusColor = () => {
    switch (insertionStatus) {
      case 'pending': return '#666';
      case 'processing': return '#FF9500';
      case 'sent': return '#007AFF';
      case 'verify': return '#34C759';
      case 'failed': return '#FF3B30';
      default: return '#666';
    }
  };

  return {
    debugLogs,
    isListening,
    lastTranscription,
    insertionStatus,
    getInsertionStatusColor,
    runFullDiagnostic,
    testTranscriptionOnly,
    testInsertionOnly,
    clearLogs,
    addLog,
  };
};
