import { useState, useEffect, useCallback } from 'react';
import { Platform, NativeModules, Alert } from 'react-native';

const { VoiceKeyboard } = NativeModules;

/**
 * Voice Keyboard Hook - Production-Grade Text Injection
 * Provides reliable text insertion via InputMethodService
 */
export const useVoiceKeyboard = () => {
  const [keyboardState, setKeyboardState] = useState({
    active: false,
    current: false,
    status: 'unknown',
  });

  const [loading, setLoading] = useState(false);

  /**
   * Insert text using Voice Keyboard
   */
  const insertText = useCallback(async (text) => {
    if (!text || text.trim().length === 0) {
      console.warn('[VoiceKeyboard] Empty text provided');
      return { success: false, reason: 'empty_text' };
    }

    try {
      setLoading(true);
      const result = await VoiceKeyboard.insertText(text);
      
      console.log('[VoiceKeyboard] Insert result:', result);
      
      if (result.status === 'success') {
        return { success: true, method: 'ime', text };
      } else {
        // Keyboard not selected - show user guidance
        if (result.reason === 'keyboard_not_active') {
          showKeyboardSelectionDialog();
        }
        return { success: false, reason: result.reason, needsSetup: true };
      }
    } catch (error) {
      console.error('[VoiceKeyboard] Insert error:', error);
      return { success: false, reason: 'error', error: error.message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check keyboard status
   */
  const checkStatus = useCallback(async () => {
    try {
      const result = await VoiceKeyboard.isActive();
      setKeyboardState({
        active: result.active,
        current: result.current,
        status: result.status,
      });
      return result;
    } catch (error) {
      console.error('[VoiceKeyboard] Status check error:', error);
      return { active: false, current: false, status: 'error' };
    }
  }, []);

  /**
   * Show keyboard selection dialog
   */
  const showKeyboardSelector = useCallback(async () => {
    try {
      await VoiceKeyboard.showKeyboardSelector();
      return { success: true };
    } catch (error) {
      console.error('[VoiceKeyboard] Selector error:', error);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Open keyboard settings
   */
  const openKeyboardSettings = useCallback(async () => {
    try {
      await VoiceKeyboard.openKeyboardSettings();
      return { success: true };
    } catch (error) {
      console.error('[VoiceKeyboard] Settings error:', error);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Get available keyboards
   */
  const getAvailableKeyboards = useCallback(async () => {
    try {
      const result = await VoiceKeyboard.getAvailableKeyboards();
      return { success: true, keyboards: result.keyboards };
    } catch (error) {
      console.error('[VoiceKeyboard] Keyboards error:', error);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Show keyboard selection dialog with user guidance
   */
  const showKeyboardSelectionDialog = useCallback(() => {
    Alert.alert(
      'Voice Keyboard Required',
      'To insert text reliably, please select "Voice Keyboard" from the keyboard selector.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Select Keyboard',
          onPress: showKeyboardSelector,
        },
        {
          text: 'Keyboard Settings',
          onPress: openKeyboardSettings,
        },
      ]
    );
  }, [showKeyboardSelector, openKeyboardSettings]);

  /**
   * Auto-check status on mount
   */
  useEffect(() => {
    if (Platform.OS === 'android' && VoiceKeyboard) {
      checkStatus();
    }
  }, [checkStatus]);

  return {
    // State
    keyboardState,
    loading,
    
    // Methods
    insertText,
    checkStatus,
    showKeyboardSelector,
    openKeyboardSettings,
    getAvailableKeyboards,
    showKeyboardSelectionDialog,
    
    // Computed
    isReady: keyboardState.current,
    needsSetup: !keyboardState.current,
  };
};
