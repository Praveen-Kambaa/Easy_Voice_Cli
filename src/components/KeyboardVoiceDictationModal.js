import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Platform,
  NativeModules,
  Animated,
  Dimensions,
  Linking,
  ScrollView,
} from 'react-native';
import { Mic, CheckCircle, XCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const { KeyboardModule, TypeEasyModule } = NativeModules || {};
const ActiveKeyboardModule = KeyboardModule || TypeEasyModule;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Production-ready Native iOS Voice Dictation Modal for Type Easy.
 *
 * Provides real-time speech transcription display, audio recording indicators,
 * explicit Done (stop & insert) action, and App Group coordination with the
 * Type Easy keyboard extension.
 */
export function KeyboardVoiceDictationModal() {
  const [visible, setVisible] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [dictationState, setDictationState] = useState('RECORDING');
  const [errorMessage, setErrorMessage] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  const activeRequestIdRef = useRef('');
  const pollTimerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.7)).current;
  const waveAnim3 = useRef(new Animated.Value(0.5)).current;

  // Gracefully read theme or fallback to TypeEasy palette
  let themeColors = {
    primary: '#1E88FF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    surface: '#FFFFFF',
    border: '#E2E8F0',
  };

  try {
    const theme = useTheme?.();
    if (theme?.colors) {
      themeColors = {
        primary: theme.colors.primary || '#1E88FF',
        textPrimary: theme.colors.text?.primary || '#0F172A',
        textSecondary: theme.colors.text?.secondary || '#64748B',
        surface: theme.colors.surface || '#FFFFFF',
        border: theme.colors.border || '#E2E8F0',
      };
    }
  } catch {
    // Theme fallback
  }

  // Pulsing and waveform animation
  useEffect(() => {
    let loop = null;
    if (visible && !isCompleted) {
      loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(waveAnim1, { toValue: 1.0, duration: 400, useNativeDriver: true }),
            Animated.timing(waveAnim1, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(waveAnim2, { toValue: 0.3, duration: 550, useNativeDriver: true }),
            Animated.timing(waveAnim2, { toValue: 1.0, duration: 550, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(waveAnim3, { toValue: 0.9, duration: 450, useNativeDriver: true }),
            Animated.timing(waveAnim3, { toValue: 0.4, duration: 450, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => loop?.stop();
  }, [visible, isCompleted, pulseAnim, waveAnim1, waveAnim2, waveAnim3]);

  // Polling for real-time transcription snapshots from native engine
  const startPollingSnapshot = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      if (!ActiveKeyboardModule?.getDictationSnapshot) return;
      try {
        const snap = await ActiveKeyboardModule.getDictationSnapshot();
        if (!snap) return;

        if (snap.partialText && snap.partialText.trim()) {
          setTranscript(snap.partialText.trim());
        } else if (snap.finalText && snap.finalText.trim()) {
          setTranscript(snap.finalText.trim());
        }

        if (snap.state) {
          setDictationState(snap.state);
        }

        if (snap.error && snap.error.trim() && !snap.error.includes('560557684')) {
          setErrorMessage(snap.error);
        }
      } catch (e) {
        console.warn('[TypeEasyDictationModal] Poll error:', e);
      }
    }, 150);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Check whether the app was opened via the keyboard extension's voice action
  const checkForKeyboardVoiceAction = useCallback(async (forcedRequestId = null) => {
    if (Platform.OS !== 'ios' || !ActiveKeyboardModule?.getPendingVoiceRequest) return;
    try {
      const res = await ActiveKeyboardModule.getPendingVoiceRequest();
      console.log('[TypeEasyDictationModal] 🔍 Checking pending request:', JSON.stringify(res));

      const targetRequestId = forcedRequestId || res?.requestId;

      if (res && res.hasPending && targetRequestId) {
        activeRequestIdRef.current = targetRequestId;
        setTranscript(res.partialText || res.finalText || '');
        setErrorMessage('');
        setIsCompleted(false);
        setDictationState('RECORDING');
        setVisible(true);

        // Ensure native recording engine is started
        await ActiveKeyboardModule.startDictationSession(targetRequestId);
        startPollingSnapshot();
      }
    } catch (err) {
      console.warn('[TypeEasyDictationModal] ❌ Error checking pending request:', err);
    }
  }, [startPollingSnapshot]);

  // Listen to deep links & AppState
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    Linking.getInitialURL().then((url) => {
      if (url && url.includes('keyboard-voice')) {
        const match = url.match(/requestId=([^&]+)/);
        const reqId = match ? decodeURIComponent(match[1]) : null;
        checkForKeyboardVoiceAction(reqId);
      } else {
        checkForKeyboardVoiceAction();
      }
    }).catch(() => {
      checkForKeyboardVoiceAction();
    });

    const handleUrl = (event) => {
      console.log('[TypeEasyDictationModal] 🔗 URL received:', event?.url);
      if (event?.url && event.url.includes('keyboard-voice')) {
        const match = event.url.match(/requestId=([^&]+)/);
        const reqId = match ? decodeURIComponent(match[1]) : null;
        checkForKeyboardVoiceAction(reqId);
      }
    };
    const linkSub = Linking.addEventListener('url', handleUrl);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkForKeyboardVoiceAction();
      }
    });

    return () => {
      linkSub.remove();
      appStateSub.remove();
      stopPolling();
    };
  }, [checkForKeyboardVoiceAction, stopPolling]);

  /**
   * User finishes speaking and taps "Done"
   */
  const handleDone = async () => {
    console.log('[TypeEasyDictationModal] ⏹️ Done tapped. Finalizing transcript:', transcript);
    stopPolling();
    setIsCompleted(true);

    try {
      if (ActiveKeyboardModule?.stopDictationSession) {
        await ActiveKeyboardModule.stopDictationSession(transcript);
      }
    } catch (e) {
      console.warn('[TypeEasyDictationModal] Stop error:', e);
    }

    // Auto-dismiss after providing confirmation
    setTimeout(() => {
      setVisible(false);
      setIsCompleted(false);
      setTranscript('');
    }, 1200);
  };

  /**
   * User cancels recording
   */
  const handleCancel = async () => {
    console.log('[TypeEasyDictationModal] ❌ Cancel tapped.');
    stopPolling();
    try {
      if (ActiveKeyboardModule?.cancelDictationSession) {
        await ActiveKeyboardModule.cancelDictationSession();
      }
    } catch (e) {
      console.warn('[TypeEasyDictationModal] Cancel error:', e);
    }
    setVisible(false);
    setIsCompleted(false);
    setTranscript('');
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.backdrop}>
        <View style={[styles.dialogCard, { backgroundColor: themeColors.surface }]}>
          {/* Header Icon badge with soundwave pulse */}
          <View style={styles.iconContainer}>
            {!isCompleted && (
              <Animated.View style={[styles.iconHalo, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <View style={[styles.iconCircle, isCompleted && styles.iconCircleSuccess]}>
              {isCompleted ? (
                <CheckCircle size={36} color="#16A34A" strokeWidth={2.5} />
              ) : (
                <Mic size={32} color="#DC2626" strokeWidth={2.5} />
              )}
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>
            {isCompleted ? '✓ Transcription Ready' : 'Type Easy Voice Dictation'}
          </Text>

          {/* Status Subtitle */}
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {isCompleted
              ? 'Return to your application to automatically insert text'
              : errorMessage
              ? errorMessage
              : dictationState === 'TRANSCRIBING'
              ? 'Converting speech to text…'
              : 'Listening… speak naturally'}
          </Text>

          {/* Real-time Transcript Canvas */}
          <View style={styles.transcriptContainer}>
            <ScrollView
              style={styles.transcriptScroll}
              contentContainerStyle={styles.transcriptContent}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[
                  styles.transcriptText,
                  !transcript && styles.transcriptPlaceholder,
                  { color: transcript ? themeColors.textPrimary : themeColors.textSecondary },
                ]}
              >
                {transcript || 'Say something… your words will appear here in real time.'}
              </Text>
            </ScrollView>
          </View>

          {/* Real-time Audio Wave Indicator (while recording) */}
          {!isCompleted && !errorMessage && (
            <View style={styles.waveformRow}>
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }], height: 20 }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim3 }], height: 26 }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }], height: 18 }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }] }]} />
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            {!isCompleted ? (
              <>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: themeColors.border }]}
                  onPress={handleCancel}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: themeColors.primary }]}
                  onPress={handleDone}
                  activeOpacity={0.82}
                >
                  <Text style={styles.doneButtonText}>Done (Insert)</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.successPill}>
                <Text style={styles.successPillText}>
                  {"Tap '‹ Previous App' at top-left to insert"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialogCard: {
    width: Math.min(SCREEN_WIDTH - 40, 390),
    borderRadius: 24,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconHalo: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(220, 38, 38, 0.14)',
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.10)',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13.5,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  transcriptContainer: {
    width: '100%',
    height: 110,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
  transcriptPlaceholder: {
    fontStyle: 'italic',
    fontSize: 14,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    marginBottom: 16,
    gap: 5,
  },
  waveBar: {
    width: 4,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#DC2626',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  doneButton: {
    flex: 1.6,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E88FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 4,
  },
  doneButtonText: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  successPill: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
  },
});
