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
import {
  getInternalTranscribeEnabled,
  setInternalTranscribeEnabled,
  syncFloatingMicSettingsToNative,
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
import { ChevronDown } from 'lucide-react-native';
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
  const [internalFloatingTranslation, setInternalFloatingTranslationState] = useState(false);
  const [elevenLabsKeyDraft, setElevenLabsKeyDraft] = useState('');
  const [elevenLabsKeySaving, setElevenLabsKeySaving] = useState(false);
  const [overlayAskQuestionEnabled, setOverlayAskQuestionEnabledState] = useState(false);
  const [aiProviderKeyDraft, setAiProviderKeyDraft] = useState('');
  const [aiProviderKeySaving, setAiProviderKeySaving] = useState(false);
  /** null | 'from' | 'to' — which translation language picker is open */
  const [languagePickerFor, setLanguagePickerFor] = useState(null);

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

  useFocusEffect(
    useCallback(() => {
      syncFloatingMicSettingsToNative();
    }, []),
  );

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
  const [toLanguage, setToLanguage] = useState('es');
  const [isLoading, setIsLoading] = useState(false);

  // ── Translation functions ────────────────────────────────────

  // Load saved translation preference
  useEffect(() => {
    loadTranslationPreference();
  }, []);

  const loadTranslationPreference = async () => {
    try {
      const savedFrom = await AsyncStorage.getItem('@from_language');
      const savedTo = await AsyncStorage.getItem('@to_language');
      if (savedFrom) setFromLanguage(normalizeStoredLanguageCode(savedFrom, 'en'));
      if (savedTo) setToLanguage(normalizeStoredLanguageCode(savedTo, 'es'));
    } catch (error) {
      console.error('Failed to load translation preference:', error);
    }
  };

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
  };

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
        <Text style={styles.sectionLabel}>TRANSLATION</Text>

        <AppCard style={styles.translationCard}>
          <Text style={styles.translationTitle}>Translation Settings</Text>
          <Text style={styles.translationDesc}>
            Set your preferred translation languages
          </Text>

          {/* From Language */}
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>From:</Text>
            <TouchableOpacity
              style={styles.dropdownField}
              onPress={() => setLanguagePickerFor('from')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select source language"
            >
              <Text style={styles.dropdownFieldText} numberOfLines={1}>
                {getLanguageName(fromLanguage)}
              </Text>
              <ChevronDown size={20} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* To Language */}
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>To:</Text>
            <TouchableOpacity
              style={styles.dropdownField}
              onPress={() => setLanguagePickerFor('to')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select target language"
            >
              <Text style={styles.dropdownFieldText} numberOfLines={1}>
                {getLanguageName(toLanguage)}
              </Text>
              <ChevronDown size={20} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Save Button */}
          <PrimaryButton
            title={isLoading ? 'Saving...' : 'Save'}
            onPress={saveTranslationPreference}
            loading={isLoading}
            variant="primary"
            style={styles.saveBtn}
          />
        </AppCard>

        {Platform.OS === 'android' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>FLOATING MIC</Text>
            <AppCard style={styles.internalTranscribeCard}>
              <Text style={styles.translationTitle}>Overlay actions</Text>
              <Text style={styles.translationDesc}>
                Choose what the floating overlay can do. If more than one is on, tap the floating
                button to open a menu. If only one is on, that icon is shown and starts that action
                directly. At least one must stay on.
              </Text>
              <Text style={styles.overlayHint}>
                Tip: Touch and hold the icon for one second, then drag to move the overlay.
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
                  <Text style={styles.internalTranslationTitle}>Internal translation</Text>
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
                style={styles.saveBtn}
              />
            </AppCard> */}
          </>
        )}

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
        <Text style={styles.sectionLabel}>MICROPHONE</Text>

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
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>SYSTEM & OVERLAY PERMISSIONS</Text>

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
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    letterSpacing: 0.8,
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
  translationCard: {
    marginBottom: 16,
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
  languageRow: {
    marginBottom: 16,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.backgroundAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  dropdownFieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  saveBtn: {
    marginTop: 8,
  },
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
});

export default SettingsScreen;
