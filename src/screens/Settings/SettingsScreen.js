import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Switch,
  TextInput,
  ActivityIndicator,
  NativeModules,
  Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { StatusBadge } from '../../components/common/StatusBadge';
import PermissionModal from '../../components/PermissionModal';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import { usePermissionsManager } from '../../hooks/usePermissionsManager';
import { useAndroidPermissions } from '../../hooks/useAndroidPermissions';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildEasyVoiceUrl } from '../../config/api';
import { offlineWhisperService } from '../../services/offlineWhisperService';
import {
  getInternalTranscribeEnabled,
  setInternalTranscribeEnabled,
  syncFloatingMicSettingsToNative,
  syncTranslationLanguagesFromKeyboard,
  ELEVENLABS_API_KEY_STORAGE,
  ELEVENLABS_API_KEY_PLACEHOLDER,
  setElevenLabsApiKey,
  getOverlayMicEnabled,
  getOverlayTranslationEnabled,
  setOverlayMicEnabled,
  setOverlayTranslationEnabled,
  getInternalFloatingTranslationEnabled,
  setInternalFloatingTranslationEnabled,
  getOverlayAskQuestionEnabled,
  setOverlayAskQuestionEnabled,
} from '../../services/floatingMicConfig';
import { ChevronDown, Copy, Keyboard } from 'lucide-react-native';
import {
  TRANSLATION_LANGUAGES as languages,
  getLanguageName,
  normalizeStoredLanguageCode,
} from '../../constants/translationLanguages';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';

const SettingsScreen = () => {
  const showAlert = useAlert();

  const [internalTranscribe, setInternalTranscribe] = useState(true);
  const [overlayMicEnabled, setOverlayMicEnabledState] = useState(true);
  const [overlayTranslationEnabled, setOverlayTranslationEnabledState] = useState(true);
  const [internalFloatingTranslation, setInternalFloatingTranslationState] = useState(true);
  const [elevenLabsKeyDraft, setElevenLabsKeyDraft] = useState('');
  const [elevenLabsKeySaving, setElevenLabsKeySaving] = useState(false);
  const [overlayAskQuestionEnabled, setOverlayAskQuestionEnabledState] = useState(false);
  const [aiProviderKeyDraft, setAiProviderKeyDraft] = useState('');
  const [aiProviderKeySaving, setAiProviderKeySaving] = useState(false);
  /** null | 'from' | 'to' — which translation language picker is open */
  const [languagePickerFor, setLanguagePickerFor] = useState(null);

  // ── Keyboard status ──────────────────────────────────────────────────────
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [keyboardSelected, setKeyboardSelected] = useState(false);

  const checkKeyboardStatus = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const enabled = await NativeModules.KeyboardModule?.isKeyboardEnabled?.();
      const selected = await NativeModules.KeyboardModule?.isKeyboardSelected?.();
      if (enabled != null) setKeyboardEnabled(!!enabled);
      if (selected != null) setKeyboardSelected(!!selected);
    } catch {
      // module may not expose these methods yet — silently ignore
    }
  }, []);

  // ── Upload & transcribe audio (for Settings card) ───────────────────────────
  const [pickedAudioUri, setPickedAudioUri] = useState('');
  const [pickedTranscript, setPickedTranscript] = useState('');
  const [pickedTranscriptError, setPickedTranscriptError] = useState('');
  const [pickedTranscribing, setPickedTranscribing] = useState(false);
  const [modelDownloadPct, setModelDownloadPct] = useState(null);
  const [pickedTranscriptCopied, setPickedTranscriptCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setInternalTranscribe(await getInternalTranscribeEnabled());
      setOverlayMicEnabledState(await getOverlayMicEnabled());
      setOverlayTranslationEnabledState(await getOverlayTranslationEnabled());
      setInternalFloatingTranslationState(await getInternalFloatingTranslationEnabled());
      setOverlayAskQuestionEnabledState(await getOverlayAskQuestionEnabled());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ELEVENLABS_API_KEY_STORAGE);
        setElevenLabsKeyDraft(raw ?? '');
      } catch {
        setElevenLabsKeyDraft('');
      }
    })();
  }, []);

  const onInternalTranscribeToggle = async (value) => {
    setInternalTranscribe(value);
    try {
      await setInternalTranscribeEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'internal_transcribe_toggled', {
        label: value ? 'Internal transcribe on' : 'Internal transcribe off',
      });
    } catch (e) {
      setInternalTranscribe(!value);
      showAlert('Error', e?.message || 'Could not save setting');
    }
  };

  const onOverlayMicToggle = async (value) => {
    if (!value && !overlayTranslationEnabled && !overlayAskQuestionEnabled) {
      showAlert(
        'Overlay',
        'Keep at least one action enabled. Turn on Translation or Ask Question, or leave Microphone on.',
      );
      return;
    }
    setOverlayMicEnabledState(value);
    try {
      await setOverlayMicEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'overlay_mic_toggled', {
        label: value ? 'Overlay microphone on' : 'Overlay microphone off',
      });
    } catch (e) {
      setOverlayMicEnabledState(!value);
      showAlert('Error', e?.message || 'Could not save overlay setting');
    }
  };

  const onOverlayTranslationToggle = async (value) => {
    if (!value && !overlayMicEnabled && !overlayAskQuestionEnabled) {
      showAlert(
        'Overlay',
        'Keep at least one action enabled. Turn on Microphone or Ask Question, or leave Translation on.',
      );
      return;
    }
    setOverlayTranslationEnabledState(value);
    try {
      await setOverlayTranslationEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'overlay_translation_toggled', {
        label: value ? 'Overlay translation on' : 'Overlay translation off',
      });
    } catch (e) {
      setOverlayTranslationEnabledState(!value);
      showAlert('Error', e?.message || 'Could not save overlay setting');
    }
  };

  const onOverlayAskQuestionToggle = async (value) => {
    if (!value && !overlayMicEnabled && !overlayTranslationEnabled) {
      showAlert(
        'Overlay',
        'Keep at least one action enabled. Turn on Microphone or Translation, or leave Ask Question on.',
      );
      return;
    }
    setOverlayAskQuestionEnabledState(value);
    try {
      await setOverlayAskQuestionEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'overlay_ask_question_toggled', {
        label: value ? 'Overlay Ask Question on' : 'Overlay Ask Question off',
      });
    } catch (e) {
      setOverlayAskQuestionEnabledState(!value);
      showAlert('Error', e?.message || 'Could not save overlay setting');
    }
  };

  const onInternalFloatingTranslationToggle = async (value) => {
    setInternalFloatingTranslationState(value);
    try {
      await setInternalFloatingTranslationEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'internal_floating_translation_toggled', {
        label: value ? 'Internal floating translation on' : 'Internal floating translation off',
      });
    } catch (e) {
      setInternalFloatingTranslationState(!value);
      showAlert('Error', e?.message || 'Could not save setting');
    }
  };

  const saveElevenLabsKey = async () => {
    try {
      setElevenLabsKeySaving(true);
      await setElevenLabsApiKey(elevenLabsKeyDraft);
      await logActivity(ActivityCategory.SETTINGS, 'elevenlabs_key_saved', {
        label: 'ElevenLabs API key saved',
      });
      showAlert('Saved', 'ElevenLabs key updated for floating mic cloud transcribe.');
    } catch (e) {
      showAlert('Error', e?.message || 'Could not save API key');
    } finally {
      setElevenLabsKeySaving(false);
    }
  };

  // Translation state
  const [fromLanguage, setFromLanguage] = useState('en');
  const [toLanguage, setToLanguage] = useState('ta');
  const [isLoading, setIsLoading] = useState(false);

  // ── Translation functions ────────────────────────────────────

  const loadTranslationPreference = useCallback(async () => {
    try {
      const synced = await syncTranslationLanguagesFromKeyboard();
      const savedFrom = synced?.fromLang || (await AsyncStorage.getItem('@from_language'));
      const savedTo = synced?.toLang || (await AsyncStorage.getItem('@to_language'));
      if (savedFrom) setFromLanguage(normalizeStoredLanguageCode(savedFrom, 'en'));
      if (savedTo) setToLanguage(normalizeStoredLanguageCode(savedTo, 'ta'));
    } catch (error) {
      console.error('Failed to load translation preference:', error);
    }
  }, []);

  // Load saved translation preference
  useEffect(() => {
    loadTranslationPreference();
  }, [loadTranslationPreference]);

  const saveTranslationPreference = async () => {
    try {
      setIsLoading(true);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      await AsyncStorage.setItem('@from_language', fromLanguage);
      await AsyncStorage.setItem('@to_language', toLanguage);
      await syncFloatingMicSettingsToNative();

      const fromName = languages.find(l => l.code === fromLanguage)?.name;
      const toName = languages.find(l => l.code === toLanguage)?.name;
      await logActivity(ActivityCategory.SETTINGS, 'translation_languages_saved', {
        label: 'Default translation languages saved',
        meta: `${fromName} → ${toName}`,
      });
      showAlert(
        'Translation Settings Saved',
        `Translation from ${fromName} to ${toName}`
      );
    } catch (error) {
      console.error('Failed to save translation preference:', error);
      showAlert('Error', 'Failed to save translation preference');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Standard permissions (Microphone) ───────────────────────────────────────
  const {
    permissionStatuses,
    loading: stdLoading,
    requestPermission,
    checkAllPermissions: checkStdPermissions,
    openAppSettings,
    getPermissionStatusText,
    isPermissionGranted,
    isPermissionBlocked,
    PERMISSION_NAMES: STD_NAMES,
  } = usePermissionsManager();

  // ── System permissions (Overlay, Accessibility) ───────────────────────────
  const {
    permissionStates,
    loading: sysLoading,
    modalVisible,
    errors: sysErrors,
    checkPermission: checkSysPermission,
    checkAllPermissions: checkSysPermissions,
    requestPermission: requestSysPermission,
    handleModalConfirm,
    handleModalCancel,
    isPermissionSupported,
    isPermissionGranted: isSysPermissionGranted,
    isPermissionLoading,
    getPermissionStatusText: getSysStatusText,
    getPermissionStatusColor: getSysStatusColor,
    getPermissionError,
    clearPermissionError,
    PERMISSION_NAMES: SYS_NAMES,
  } = useAndroidPermissions();

  useFocusEffect(
    useCallback(() => {
      checkStdPermissions();
      checkSysPermissions();
      loadTranslationPreference();
      checkKeyboardStatus();
      (async () => {
        try {
          setInternalTranscribe(await getInternalTranscribeEnabled());
          setOverlayMicEnabledState(await getOverlayMicEnabled());
          setOverlayTranslationEnabledState(await getOverlayTranslationEnabled());
          setInternalFloatingTranslationState(await getInternalFloatingTranslationEnabled());
          setOverlayAskQuestionEnabledState(await getOverlayAskQuestionEnabled());
          const raw = await AsyncStorage.getItem(ELEVENLABS_API_KEY_STORAGE);
          setElevenLabsKeyDraft(raw ?? '');
        } catch {
          // ignore
        }
      })();
    }, [checkStdPermissions, checkSysPermissions, loadTranslationPreference, checkKeyboardStatus]),
  );

  // ── Standard permission handlers ──────────────────────────────────────────

  const handleStdRequest = async (permissionType) => {
    if (isPermissionBlocked(permissionType)) {
      showAlert(
        'Permission Blocked',
        'This permission is blocked. Please enable it in app settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]
      );
      return;
    }

    const result = await requestPermission(permissionType);

    if (result === 'granted') {
      showAlert('Granted', `${STD_NAMES[permissionType]} permission granted!`);
    } else if (result === 'denied') {
      showAlert('Denied', `${STD_NAMES[permissionType]} permission was denied.`);
    } else if (result === 'blocked') {
      showAlert(
        'Blocked',
        `${STD_NAMES[permissionType]} permission is blocked. Enable it in settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]
      );
    }
  };

  const getStdStatusColor = (status) => {
    switch (status) {
      case 'granted': return Colors.status.granted;
      case 'denied': return Colors.status.denied;
      case 'blocked': return Colors.status.blocked;
      case 'limited': return Colors.status.info;
      default: return Colors.status.unavailable;
    }
  };

  // ── System permission handlers ────────────────────────────────────────────

  const handleSysRequest = async (permissionType) => {
    try {
      if (!isPermissionSupported(permissionType)) {
        showAlert('Not Supported', `${permissionType} is not supported on this device.`);
        return;
      }
      clearPermissionError(permissionType);
      await requestSysPermission(permissionType);
    } catch (error) {
      showAlert('Error', `Failed to request ${permissionType}. Please try again.`);
    }
  };

  const handleCheckSys = async (permissionType) => {
    try {
      await checkSysPermission(permissionType);
    } catch { }
  };

  const getSysBtnLabel = (permissionType) => {
    if (isPermissionLoading(permissionType)) return 'Checking…';
    if (getPermissionError(permissionType)) return 'Retry';
    if (isSysPermissionGranted(permissionType)) return 'Enabled';
    return 'Enable';
  };

  const refreshAll = () => {
    checkStdPermissions();
    checkSysPermissions();
    checkKeyboardStatus();
  };

  const handlePickAndTranscribeAudio = useCallback(async () => {
    try {
      if (pickedTranscribing) return;

      const pickedUri = await NativeModules.AudioPickerModule?.pickAudio?.();
      if (!pickedUri) {
        showAlert('Upload audio', 'Could not access the selected file.');
        return;
      }

      setPickedAudioUri(pickedUri);
      setPickedTranscript('');
      setPickedTranscriptError('');
      setPickedTranscribing(true);
      setModelDownloadPct(null);
      setPickedTranscriptCopied(false);

      if (Platform.OS !== 'android') {
        throw new Error('Internal file transcription is currently supported only on Android.');
      }

      let audioForWhisper = pickedUri;
      if (typeof NativeModules.AudioTranscodeModule?.convertToWav16kMono === 'function') {
        const wavUri = await NativeModules.AudioTranscodeModule.convertToWav16kMono(pickedUri);
        if (wavUri) {
          audioForWhisper = wavUri;
          setPickedAudioUri(wavUri);
        }
      }

      const text = String(
        (await offlineWhisperService.transcribeFile(audioForWhisper, {
          // Use the app’s default source language when available, else auto-detect.
          language: (fromLanguage || 'auto').toLowerCase(),
          onModelDownloadProgress: (bytesRead, contentLength, done) => {
            if (!contentLength || contentLength <= 0) {
              setModelDownloadPct(done ? 100 : null);
              return;
            }
            const pct = Math.max(0, Math.min(100, Math.round((bytesRead / contentLength) * 100)));
            setModelDownloadPct(done ? 100 : pct);
          },
        })) ?? '',
      ).trim();

      if (!text) {
        setPickedTranscript('');
        setPickedTranscriptError('No speech detected in this audio.');
        return;
      }

      setPickedTranscript(text);
      setPickedTranscriptError('');
      setPickedTranscriptCopied(false);
    } catch (e) {
      if (/cancel/i.test(e?.message || '')) return;
      const msg = e?.message || 'Could not transcribe this audio.';
      setPickedTranscript('');
      setPickedTranscriptError(msg);
      showAlert('Transcription', msg);
    } finally {
      setPickedTranscribing(false);
    }
  }, [pickedTranscribing, showAlert]);

  const clearPickedTranscript = useCallback(() => {
    setPickedAudioUri('');
    setPickedTranscript('');
    setPickedTranscriptError('');
    setPickedTranscribing(false);
    setModelDownloadPct(null);
    setPickedTranscriptCopied(false);
  }, []);

  const copyPickedTranscript = useCallback(() => {
    const value = String(pickedTranscript || '').trim();
    if (!value) {
      showAlert('Copy', 'No transcript to copy.');
      return;
    }
    try {
      Clipboard.setString(value);
      setPickedTranscriptCopied(true);
    } catch {
      showAlert('Copy', 'Could not copy transcript.');
    }
  }, [pickedTranscript, showAlert]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer>
      <AppHeader title="Settings" />

      {Platform.OS !== 'android' && (
        <View style={styles.platformWarning}>
          <Text style={styles.platformWarningText}>
            Permission management is designed for Android. Some features may not be available on this platform.
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 0: Translation Settings ────────────────────────────── */}
        <Text style={styles.sectionLabel}>Translation</Text>

        <AppCard style={styles.groupCard} noPadding>
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>Default languages</Text>
            <Text style={styles.groupSub}>Used by Translator and Floating Mic translation</Text>
          </View>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setLanguagePickerFor('from')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Select source language"
          >
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitle}>From</Text>
              <Text style={styles.settingSub} numberOfLines={1}>{getLanguageName(fromLanguage)}</Text>
            </View>
            <ChevronDown size={18} color={Colors.text.light} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowLast]}
            onPress={() => setLanguagePickerFor('to')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Select target language"
          >
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitle}>To</Text>
              <Text style={styles.settingSub} numberOfLines={1}>{getLanguageName(toLanguage)}</Text>
            </View>
            <ChevronDown size={18} color={Colors.text.light} />
          </TouchableOpacity>

          <View style={styles.groupFooter}>
            <PrimaryButton
              title={isLoading ? 'Saving...' : 'Save'}
              onPress={saveTranslationPreference}
              loading={isLoading}
              variant="primary"
              style={styles.groupPrimaryBtn}
            />
          </View>
        </AppCard>

        {/* ── Audio Transcription Card ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Audio</Text>
        <AppCard style={styles.transcribeCard}>
          <Text style={styles.transcribeTitle}>Upload audio → Transcribe</Text>
          <Text style={styles.transcribeDesc}>
            Pick any recorded audio file. The transcript will appear below.
          </Text>

          <View style={styles.transcribeActionsRow}>
            <PrimaryButton
              title={pickedTranscribing ? 'Transcribing…' : 'Upload audio'}
              onPress={handlePickAndTranscribeAudio}
              loading={pickedTranscribing}
              disabled={pickedTranscribing}
              variant="primary"
              style={styles.transcribeBtn}
            />
            <PrimaryButton
              title="Clear"
              onPress={clearPickedTranscript}
              disabled={pickedTranscribing || (!pickedTranscript && !pickedTranscriptError && !pickedAudioUri)}
              variant="outline"
              style={styles.transcribeBtn}
            />
          </View>

          {!!pickedAudioUri && (
            <Text style={styles.transcribeFileHint} numberOfLines={2}>
              Selected: {pickedAudioUri}
            </Text>
          )}

          {pickedTranscribing && (
            <View style={styles.transcribeLoadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.transcribeLoadingText}>
                {typeof modelDownloadPct === 'number' && modelDownloadPct < 100
                  ? `Downloading model… ${modelDownloadPct}%`
                  : 'Transcribing…'}
              </Text>
            </View>
          )}

          {!!pickedTranscriptError && !pickedTranscribing && (
            <View style={styles.transcribeErrorBox}>
              <Text style={styles.transcribeErrorText}>{pickedTranscriptError}</Text>
            </View>
          )}

          {!!pickedTranscript && !pickedTranscribing && (
            <View style={styles.transcribeResultBox}>
              <View style={styles.transcribeResultHeader}>
                <Text style={styles.transcribeResultLabel}>Transcript</Text>
                <View style={styles.transcribeHeaderActions}>
                  {pickedTranscriptCopied ? (
                    <Text style={styles.transcribeCopiedText}>Copied</Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.transcribeCopyIconBtn}
                    onPress={copyPickedTranscript}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Copy transcript"
                  >
                    <Copy size={16} color={Colors.primary} strokeWidth={2.1} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.transcribeResultText}>{pickedTranscript}</Text>
            </View>
          )}
        </AppCard>

        {Platform.OS === 'android' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Floating mic</Text>
            <AppCard style={styles.internalTranscribeCard}>
              <Text style={styles.translationTitle}>Overlay actions</Text>
              <Text style={styles.translationDesc}>
                Choose what the floating overlay can do. Keep at least one enabled.
              </Text>
              <View style={[styles.toggleRow, styles.overlayActionRow]}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>Microphone</Text>
                  <Text style={styles.toggleSubLabel}>Dictate / transcribe</Text>
                </View>
                <Switch
                  value={overlayMicEnabled}
                  onValueChange={onOverlayMicToggle}
                  trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                  thumbColor={overlayMicEnabled ? Colors.primary : Colors.text.light}
                />
              </View>
              <View style={[styles.toggleRow, styles.overlayActionRow]}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>Translation</Text>
                  <Text style={styles.toggleSubLabel}>Speak → on-device translate</Text>
                </View>
                <Switch
                  value={overlayTranslationEnabled}
                  onValueChange={onOverlayTranslationToggle}
                  trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                  thumbColor={overlayTranslationEnabled ? Colors.primary : Colors.text.light}
                />
              </View>
              <View style={[styles.toggleRow, styles.overlayActionRowLast]}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>Ask Question</Text>
                  <Text style={styles.toggleSubLabel}>
                    Voice → AI answer (injected as returned, no extra translation)
                  </Text>
                </View>
                <Switch
                  value={overlayAskQuestionEnabled}
                  onValueChange={onOverlayAskQuestionToggle}
                  trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                  thumbColor={overlayAskQuestionEnabled ? Colors.primary : Colors.text.light}
                />
              </View>

            </AppCard>
            <AppCard style={styles.internalTranscribeCard}>
              <View style={[styles.toggleRow, styles.internalMicDividerRow]}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.translationTitle}>Internal Transcribe</Text>
                  <Text style={styles.toggleSubLabel}>
                    Applies when overlay Microphone is on. Off while Microphone overlay is off.
                  </Text>
                </View>
                <Switch
                  value={internalTranscribe}
                  onValueChange={onInternalTranscribeToggle}
                  disabled={!overlayMicEnabled}
                  trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                  thumbColor={internalTranscribe ? Colors.primary : Colors.text.light}
                />
              </View>
              <View style={[styles.toggleRow, styles.internalTranslateRow]}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.internalTranslationTitle}>Internal Translation</Text>
                  <Text style={styles.toggleSubLabel}>
                    Applies when overlay Translation is on. Off while Translation overlay is off.
                  </Text>
                </View>
                <Switch
                  value={internalFloatingTranslation}
                  onValueChange={onInternalFloatingTranslationToggle}
                  disabled={!overlayTranslationEnabled}
                  trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                  thumbColor={internalFloatingTranslation ? Colors.primary : Colors.text.light}
                />
              </View>
            </AppCard>
            {/* <AppCard style={styles.internalTranscribeCard}>
              <Text style={styles.translationTitle}>ElevenLabs API key</Text>
              <Text style={styles.translationDesc}>
                When Internal Transcribe is off, microphone mode sends your recording to ElevenLabs
                speech-to-text and pastes the result. Leave empty to use only your voice server URL
                instead. Replace the default placeholder with your key from the ElevenLabs dashboard.
              </Text>
              <TextInput
                style={styles.apiKeyInput}
                value={elevenLabsKeyDraft}
                onChangeText={setElevenLabsKeyDraft}
                placeholder={ELEVENLABS_API_KEY_PLACEHOLDER}
                placeholderTextColor={Colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!elevenLabsKeySaving}
              />
              <PrimaryButton
                title={elevenLabsKeySaving ? 'Saving...' : 'Save API key'}
                onPress={saveElevenLabsKey}
                loading={elevenLabsKeySaving}
                variant="outline"
                style={styles.groupPrimaryBtn}
              />
            </AppCard> */}
          </>
        )}

        {/* ── Section: Type Easy Keyboard ────────────────────────────────── */}
        <>
          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Type Easy Keyboard</Text>
          <AppCard style={styles.keyboardCard}>
            <View style={styles.keyboardCardHeader}>
              <View style={styles.keyboardIconWrap}>
                <Keyboard size={22} color={Colors.primary} strokeWidth={2} />
              </View>
              <View style={styles.keyboardCardText}>
                <Text style={styles.keyboardCardTitle}>Advanced Keyboard</Text>
                <Text style={styles.keyboardCardSub}>
                  Full QWERTY with Translate, Grammar Check and Voice input built in
                </Text>
              </View>
            </View>

            <View style={styles.keyboardFeatureList}>
              {[
                '🌐  Translate text while typing',
                '✓   Grammar check in one tap',
                '🎤  Voice input — speak to type',
                '⇧   Shift, Caps Lock, Symbols layer',
                '💡  Word suggestions bar',
                ...(Platform.OS === 'ios'
                  ? ['📱  Floating mic features available via keyboard on iOS']
                  : []),
              ].map((f) => (
                <Text key={f} style={styles.keyboardFeatureItem}>{f}</Text>
              ))}
            </View>

            <View style={styles.keyboardToggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Enable Keyboard</Text>
                <Text style={styles.toggleSubLabel}>
                  {Platform.OS === 'ios'
                    ? 'Opens iOS Settings → General → Keyboard → Add New Keyboard'
                    : 'Opens Android keyboard settings to enable Type Easy'}
                </Text>
              </View>
              <Switch
                value={keyboardEnabled}
                onValueChange={() => {
                  NativeModules.KeyboardModule?.openKeyboardSettings?.();
                  // Re-check status after user returns from settings
                  setTimeout(() => checkKeyboardStatus(), 1500);
                }}
                trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                thumbColor={keyboardEnabled ? Colors.primary : Colors.text.light}
              />
            </View>

            <View style={[styles.keyboardToggleRow, styles.keyboardToggleRowLast]}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Select Keyboard</Text>
                <Text style={styles.toggleSubLabel}>
                  {Platform.OS === 'ios'
                    ? 'Opens Settings to switch your active keyboard'
                    : 'Opens the keyboard picker to switch to Type Easy'}
                </Text>
              </View>
              <Switch
                value={keyboardSelected}
                onValueChange={() => {
                  NativeModules.KeyboardModule?.showKeyboardPicker?.();
                  setTimeout(() => checkKeyboardStatus(), 1500);
                }}
                trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                thumbColor={keyboardSelected ? Colors.primary : Colors.text.light}
              />
            </View>
          </AppCard>
        </>

        {/* Refresh button */}
        <View style={styles.refreshRow}>
          <PrimaryButton
            title="Refresh All"
            onPress={refreshAll}
            loading={stdLoading || Object.values(sysLoading).some(Boolean)}
            variant="outline"
            style={styles.refreshBtn}
          />
        </View>

        {/* ── Section 1: Standard Permissions ────────────────────────────── */}
        <Text style={styles.sectionLabel}>Microphone</Text>

        {Object.keys(STD_NAMES).map((key) => {
          const name = STD_NAMES[key];
          const status = permissionStatuses[name];
          const statusText = getPermissionStatusText(status);
          const isGranted = isPermissionGranted(key);
          const isBlocked = isPermissionBlocked(key);

          return (
            <AppCard key={key} style={styles.permCard}>
              <View style={styles.permHeader}>
                <Text style={styles.permTitle}>{name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStdStatusColor(statusText?.toLowerCase()) + '22' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStdStatusColor(statusText?.toLowerCase()) },
                    ]}
                  >
                    {statusText || 'Unknown'}
                  </Text>
                </View>
              </View>

              <View style={styles.permActions}>
                <PrimaryButton
                  title={isGranted ? 'Granted' : isBlocked ? 'Open Settings' : 'Request'}
                  onPress={() => handleStdRequest(key)}
                  disabled={stdLoading}
                  loading={stdLoading}
                  variant={isGranted ? 'ghost' : 'primary'}
                  style={styles.permBtn}
                  textStyle={isGranted ? { color: Colors.status.granted } : undefined}
                />
              </View>
            </AppCard>
          );
        })}

        {/* ── Section 2: System Permissions ──────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>System & overlay</Text>

        {Object.values(SYS_NAMES).map((permissionType) => {
          const isGranted = isSysPermissionGranted(permissionType);
          const isLoading = isPermissionLoading(permissionType);
          const hasError = getPermissionError(permissionType);
          const statusText = getSysStatusText(permissionType);
          const statusColor = getSysStatusColor(permissionType);
          const isSupported = isPermissionSupported(permissionType);

          return (
            <AppCard key={permissionType} style={styles.permCard}>
              <View style={styles.permHeader}>
                <View style={styles.permInfo}>
                  <Text style={styles.permTitle}>{permissionType}</Text>
                  <Text style={styles.permDescription}>
                    {permissionType === SYS_NAMES.OVERLAY
                      ? 'Display content over other apps'
                      : 'Accessibility service for enhanced functionality'}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                </View>
              </View>

              {hasError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorMsg}>{hasError}</Text>
                </View>
              )}

              {!isSupported && (
                <View style={styles.unsupportedBox}>
                  <Text style={styles.unsupportedText}>Not supported on this device</Text>
                </View>
              )}

              <View style={styles.sysPermActions}>
                <PrimaryButton
                  title={getSysBtnLabel(permissionType)}
                  onPress={() => handleSysRequest(permissionType)}
                  loading={isLoading}
                  disabled={isLoading || !isSupported}
                  variant={isGranted ? 'ghost' : 'primary'}
                  style={[styles.permBtn, { flex: 1 }]}
                  textStyle={isGranted ? { color: Colors.status.granted } : undefined}
                />
                <TouchableOpacity
                  style={styles.checkBtn}
                  onPress={() => handleCheckSys(permissionType)}
                  disabled={isLoading}
                >
                  <Text style={styles.checkBtnText}>Check</Text>
                </TouchableOpacity>
              </View>
            </AppCard>
          );
        })}

        {/* App Settings link */}
        <AppCard style={styles.settingsLinkCard}>
          <Text style={styles.settingsLinkTitle}>App Permissions in System Settings</Text>
          <Text style={styles.settingsLinkDesc}>
            If a permission was permanently denied, open system settings to enable it manually.
          </Text>
          <PrimaryButton
            title="Open App Settings"
            onPress={openAppSettings}
            variant="outline"
            style={styles.openSettingsBtn}
          />
        </AppCard>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            After enabling permissions in system settings, return here and tap "Refresh All" to update statuses.
          </Text>
        </View>
      </ScrollView>

      <LanguagePickerModal
        visible={languagePickerFor !== null}
        onClose={() => setLanguagePickerFor(null)}
        title={languagePickerFor === 'from' ? 'Translate from' : 'Translate to'}
        languages={languages}
        selectedCode={
          languagePickerFor === 'from'
            ? fromLanguage
            : languagePickerFor === 'to'
              ? toLanguage
              : ''
        }
        onSelect={(code) => {
          if (languagePickerFor === 'from') setFromLanguage(code);
          else if (languagePickerFor === 'to') setToLanguage(code);
        }}
      />

      {/* Modals for system permissions */}
      {Object.values(SYS_NAMES).map((permissionType) => (
        <PermissionModal
          key={permissionType}
          visible={modalVisible[permissionType]}
          permissionType={permissionType}
          onConfirm={() => handleModalConfirm(permissionType)}
          onCancel={() => handleModalCancel(permissionType)}
          loading={sysLoading[permissionType]}
        />
      ))}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  platformWarning: {
    backgroundColor: Colors.warning.bg,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning.border,
  },
  platformWarningText: {
    fontSize: 13,
    color: Colors.warning.text,
    lineHeight: 18,
  },

  refreshRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  refreshBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 10,
  },

  permCard: {
    marginBottom: 12,
  },
  permHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 10,
  },
  permInfo: {
    flex: 1,
  },
  permTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  permDescription: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  permActions: {
    flexDirection: 'row',
  },
  permBtn: {
    minHeight: 40,
    paddingVertical: 0,
  },

  sysPermActions: {
    flexDirection: 'row',
    gap: 10,
  },
  checkBtn: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  checkBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },

  errorBox: {
    backgroundColor: Colors.status.blockedBg,
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorMsg: {
    fontSize: 13,
    color: Colors.status.blocked,
    lineHeight: 18,
  },
  unsupportedBox: {
    backgroundColor: Colors.backgroundAlt,
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    alignItems: 'center',
  },
  unsupportedText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },

  settingsLinkCard: {
    marginTop: 8,
  },
  settingsLinkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  settingsLinkDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  openSettingsBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: 0,
    paddingHorizontal: 16,
  },

  footer: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Translation styles
  groupCard: {
    marginBottom: 16,
  },
  groupHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  groupSub: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  groupFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  groupPrimaryBtn: {
    minHeight: 48,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  settingRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  settingSub: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.text.secondary,
  },
  translationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  translationDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 20,
  },
  // Legacy translation styles (kept for other blocks)
  internalTranscribeCard: {
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  overlayActionRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  overlayActionRowLast: {
    paddingTop: 14,
    paddingBottom: 2,
    alignItems: 'center',
  },
  /** Divider between Internal Transcribe and Internal translation */
  internalMicDividerRow: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    alignItems: 'flex-start',
  },
  internalTranslateRow: {
    marginTop: 4,
    alignItems: 'flex-start',
  },
  internalTranslationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  overlayHint: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
    marginBottom: 4,
    fontWeight: '400',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  toggleSubLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  apiKeyInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: 12,
  },

  // Audio transcription card
  transcribeCard: {
    marginBottom: 16,
  },
  transcribeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  transcribeDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  transcribeActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  transcribeBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
  },
  transcribeFileHint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  transcribeLoadingRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transcribeLoadingText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  transcribeErrorBox: {
    marginTop: 12,
    backgroundColor: Colors.status.blockedBg,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.status.blocked + '22',
  },
  transcribeErrorText: {
    fontSize: 13,
    color: Colors.status.blocked,
    lineHeight: 18,
  },
  transcribeResultBox: {
    marginTop: 12,
    backgroundColor: Colors.backgroundAlt,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transcribeResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  transcribeResultLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text.secondary,
    letterSpacing: 0.2,
  },
  transcribeResultText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  transcribeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transcribeCopyIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcribeCopiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.status.granted,
  },

  // Keyboard section
  keyboardCard: {
    marginBottom: 16,
  },
  keyboardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  keyboardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 136, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(30, 136, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  keyboardCardText: {
    flex: 1,
  },
  keyboardCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  keyboardCardSub: {
    marginTop: 3,
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  keyboardFeatureList: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    marginBottom: 14,
  },
  keyboardFeatureItem: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  keyboardBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  keyboardBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
  },
  keyboardHint: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
    textAlign: 'center',
  },
  keyboardToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  keyboardToggleRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
});

export default SettingsScreen;
