import logger from '../../utils/logger';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Switch,
  ActivityIndicator,
  NativeModules,
  Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft,
  Palette,
  Languages,
  Mic,
  Smartphone,
  Sun,
  Moon,
  Check,
  CheckCircle2,
  ChevronDown,
  ArrowUpDown,
  Save,
  UploadCloud,
  Trash2,
  Copy,
  AudioLines,
  HelpCircle,
  Zap,
  Keyboard,
  ShieldCheck,
  PhoneCall,
  Users,
  Layers,
  Accessibility,
  ExternalLink,
  RotateCw,
  Info,
  User,
  Server,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { getAiEngineProvider, setAiEngineProvider } from '../../services/aiEngineConfig';
import { transcribeWithGroq } from '../../services/groqService';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AskAiIcon } from '../../components/common/AskAiIcon';
import PermissionModal from '../../components/PermissionModal';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import { usePermissionsManager } from '../../hooks/usePermissionsManager';
import { useAndroidPermissions } from '../../hooks/useAndroidPermissions';
import { useAlert } from '../../context/AlertContext';
import { useTheme, THEME_MODES } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transcribeBySettings } from '../../services/transcribeService';
import {
  getInternalTranscribeEnabled,
  setInternalTranscribeEnabled,
  syncFloatingMicSettingsToNative,
  syncTranslationLanguagesFromKeyboard,
  ELEVENLABS_API_KEY_STORAGE,
  getOverlayMicEnabled,
  getOverlayTranslationEnabled,
  setOverlayMicEnabled,
  setOverlayTranslationEnabled,
  getInternalFloatingTranslationEnabled,
  setInternalFloatingTranslationEnabled,
  getOverlayAskQuestionEnabled,
  setOverlayAskQuestionEnabled,
  getOverlayVoiceCommandEnabled,
  setOverlayVoiceCommandEnabled,
} from '../../services/floatingMicConfig';
import {
  TRANSLATION_LANGUAGES as languages,
  getLanguageName,
  normalizeStoredLanguageCode,
} from '../../constants/translationLanguages';
import { logActivity, ActivityCategory } from '../../services/appActivityHistoryService';

const SCRIPT_TAGS = {
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
  bn: 'বাংলা',
  gu: 'ગુજરાતી',
  mr: 'मराठी',
  pa: 'ਪੰਜਾਬੀ',
  ar: 'العربية',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  en: 'US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
};

const THEME_OPTIONS = [
  {
    mode: THEME_MODES.SYSTEM,
    title: 'System default',
    description: 'Match your device light or dark ...',
    Icon: Smartphone,
  },
  {
    mode: THEME_MODES.LIGHT,
    title: 'Light',
    description: 'Always use light theme',
    Icon: Sun,
  },
  {
    mode: THEME_MODES.DARK,
    title: 'Dark',
    description: 'Always use dark theme',
    Icon: Moon,
  },
];

const AI_ENGINE_OPTIONS = [
  {
    id: 'default',
    title: 'Default Server',
    description: 'Type Easy & Easy Voice backend',
    Icon: Server,
  },
  {
    id: 'groq',
    title: 'Groq AI',
    description: 'Whisper v3 Turbo + Llama 3.3 (Testing mode)',
    Icon: Zap,
  },
];

const SettingsScreen = ({ navigation, route }) => {
  const showAlert = useAlert();
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const styles = useMemo(() => createSettingsStyles(colors, isDark), [colors, isDark]);

  // Tab State: 'general' | 'floatingMic' | 'permissions'
  const [activeTab, setActiveTab] = useState(route?.params?.tab || 'general');

  useEffect(() => {
    if (route?.params?.tab) {
      setActiveTab(route?.params?.tab);
    }
  }, [route?.params?.tab]);

  const [internalTranscribe, setInternalTranscribe] = useState(true);
  const [overlayMicEnabled, setOverlayMicEnabledState] = useState(true);
  const [overlayTranslationEnabled, setOverlayTranslationEnabledState] = useState(true);
  const [internalFloatingTranslation, setInternalFloatingTranslationState] = useState(true);
  const [overlayAskQuestionEnabled, setOverlayAskQuestionEnabledState] = useState(false);
  const [overlayVoiceCommandEnabled, setOverlayVoiceCommandEnabledState] = useState(true);
  const [languagePickerFor, setLanguagePickerFor] = useState(null);
  const [aiEngine, setAiEngine] = useState('default');

  // Keyboard status
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
      // module may not expose these methods yet
    }
  }, []);

  // Upload & transcribe audio
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
      setOverlayVoiceCommandEnabledState(await getOverlayVoiceCommandEnabled());
      setAiEngine(await getAiEngineProvider());
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

  const onAiEngineChange = async (engineId) => {
    setAiEngine(engineId);
    try {
      await setAiEngineProvider(engineId);
    } catch (e) {
      setAiEngine(aiEngine);
      showAlert('Error', e?.message || 'Could not save AI engine preference');
    }
  };

  const overlayOthersEnabled = (exclude) => {
    const flags = {
      mic: overlayMicEnabled,
      translation: overlayTranslationEnabled,
      ask: overlayAskQuestionEnabled,
      command: overlayVoiceCommandEnabled,
    };
    if (exclude) delete flags[exclude];
    return Object.values(flags).some(Boolean);
  };

  const onOverlayMicToggle = async (value) => {
    if (!value && !overlayOthersEnabled('mic')) {
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
    if (!value && !overlayOthersEnabled('translation')) {
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
    if (!value && !overlayOthersEnabled('ask')) {
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

  const onOverlayVoiceCommandToggle = async (value) => {
    if (!value && !overlayOthersEnabled('command')) {
      showAlert(
        'Overlay',
        'Keep at least one action enabled. Turn on another overlay action, or leave Voice Command on.',
      );
      return;
    }
    setOverlayVoiceCommandEnabledState(value);
    try {
      await setOverlayVoiceCommandEnabled(value);
      await logActivity(ActivityCategory.SETTINGS, 'overlay_voice_command_toggled', {
        label: value ? 'Overlay voice command on' : 'Overlay voice command off',
      });
    } catch (e) {
      setOverlayVoiceCommandEnabledState(!value);
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

  // Translation state
  const [fromLanguage, setFromLanguage] = useState('en');
  const [toLanguage, setToLanguage] = useState('ta');
  const [isSavingLang, setIsSavingLang] = useState(false);

  const loadTranslationPreference = useCallback(async () => {
    try {
      const synced = await syncTranslationLanguagesFromKeyboard();
      const savedFrom = synced?.fromLang || (await AsyncStorage.getItem('@from_language'));
      const savedTo = synced?.toLang || (await AsyncStorage.getItem('@to_language'));
      if (savedFrom) setFromLanguage(normalizeStoredLanguageCode(savedFrom, 'en'));
      if (savedTo) setToLanguage(normalizeStoredLanguageCode(savedTo, 'ta'));
    } catch (error) {
      logger.error('Failed to load translation preference:', error);
    }
  }, []);

  useEffect(() => {
    loadTranslationPreference();
  }, [loadTranslationPreference]);

  const saveTranslationPreference = async () => {
    try {
      setIsSavingLang(true);
      await new Promise(resolve => setTimeout(resolve, 600));

      await AsyncStorage.setItem('@from_language', fromLanguage);
      await AsyncStorage.setItem('@to_language', toLanguage);
      await syncFloatingMicSettingsToNative();

      const fromName = languages.find(l => l.code === fromLanguage)?.name || fromLanguage;
      const toName = languages.find(l => l.code === toLanguage)?.name || toLanguage;
      await logActivity(ActivityCategory.SETTINGS, 'translation_languages_saved', {
        label: 'Default translation languages saved',
        meta: `${fromName} → ${toName}`,
      });
      showAlert(
        'Saved',
        `Default translation set from ${fromName} to ${toName}`
      );
    } catch (error) {
      logger.error('Failed to save translation preference:', error);
      showAlert('Error', 'Failed to save translation preference');
    } finally {
      setIsSavingLang(false);
    }
  };

  const swapLanguages = () => {
    setFromLanguage(toLanguage);
    setToLanguage(fromLanguage);
  };

  // Standard permissions
  const {
    permissionStatuses,
    loading: stdLoading,
    requestPermission,
    checkAllPermissions: checkStdPermissions,
    openAppSettings,
    isPermissionGranted,
    isPermissionBlocked,
    PERMISSION_NAMES: STD_NAMES,
  } = usePermissionsManager();

  // System permissions
  const {
    loading: sysLoading,
    modalVisible,
    checkPermission: checkSysPermission,
    checkAllPermissions: checkSysPermissions,
    requestPermission: requestSysPermission,
    handleModalConfirm,
    handleModalCancel,
    isPermissionSupported,
    isPermissionGranted: isSysPermissionGranted,
    isPermissionLoading,
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
          setOverlayVoiceCommandEnabledState(await getOverlayVoiceCommandEnabled());
          setAiEngine(await getAiEngineProvider());
          await AsyncStorage.getItem(ELEVENLABS_API_KEY_STORAGE);
        } catch {
          // ignore
        }
      })();
    }, [checkStdPermissions, checkSysPermissions, loadTranslationPreference, checkKeyboardStatus]),
  );

  const getStdDescription = (key) => {
    switch (key) {
      case 'MICROPHONE':
        return 'Required for live voice-to-text dictation, the quick floating microphone tray, and active AI...';
      case 'CALL_LOG':
        return 'Required for smart caller ID recognition and real-time transcription logs during hands-free...';
      case 'PHONE':
        return 'Allows audio stream management to seamlessly pause live speech transcription...';
      case 'CONTACTS':
        return 'Enables vocal recipient dialing and accurate phonetics matching for names in voice...';
      case 'STORAGE':
        return 'Stores and transcodes recorded audio files on device.';
      case 'NOTIFICATIONS':
        return 'Shows reminders, foreground recording indicators, and alarms.';
      default:
        return 'Required for application functionality.';
    }
  };

  const handleStdRequest = async (permissionType) => {
    if (isPermissionBlocked(permissionType)) {
      showAlert(
        'Permission Blocked',
        'This permission is blocked or denied. Please enable it in app settings.',
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

  const handleSysRequest = async (permissionType) => {
    try {
      if (!isPermissionSupported(permissionType)) {
        showAlert('Not Supported', `${permissionType} is not supported on this device.`);
        return;
      }
      await requestSysPermission(permissionType);
    } catch {
      showAlert('Error', `Failed to request ${permissionType}. Please try again.`);
    }
  };

  const handleCheckSys = async (permissionType) => {
    try {
      await checkSysPermission(permissionType);
    } catch { }
  };

  const refreshAll = () => {
    checkStdPermissions();
    checkSysPermissions();
    checkKeyboardStatus();
    showAlert('Permissions Refreshed', 'System access statuses have been updated.');
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

      const currentEngine = await getAiEngineProvider();
      let tx;
      if (currentEngine === 'groq') {
        try {
          const groqResult = await transcribeWithGroq(pickedUri, (fromLanguage || 'auto').toLowerCase());
          tx = { success: true, data: groqResult };
        } catch (groqErr) {
          tx = { success: false, error: groqErr.message || 'Groq transcription failed' };
        }
      } else {
        const internal = await getInternalTranscribeEnabled();
        tx = await transcribeBySettings(pickedUri, {
          language: (fromLanguage || 'auto').toLowerCase(),
          onModelDownloadProgress: internal
            ? (bytesRead, contentLength, done) => {
                if (!contentLength || contentLength <= 0) {
                  setModelDownloadPct(done ? 100 : null);
                  return;
                }
                const pct = Math.max(
                  0,
                  Math.min(100, Math.round((bytesRead / contentLength) * 100)),
                );
                setModelDownloadPct(done ? 100 : pct);
              }
            : undefined,
        });
      }

      if (!tx.success) {
        setPickedTranscript('');
        setPickedTranscriptError(tx.error || 'Could not transcribe this audio.');
        return;
      }

      const text = String(
        tx.data?.refinedTranscript || tx.data?.rawTranscript || '',
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
  }, [pickedTranscribing, showAlert, fromLanguage]);

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

  const activeOverlayCount = useMemo(() => {
    let c = 0;
    if (overlayMicEnabled) c++;
    if (overlayTranslationEnabled) c++;
    if (overlayAskQuestionEnabled) c++;
    if (overlayVoiceCommandEnabled) c++;
    return c;
  }, [overlayMicEnabled, overlayTranslationEnabled, overlayAskQuestionEnabled, overlayVoiceCommandEnabled]);

  const grantedCount = useMemo(() => {
    let count = 0;
    ['MICROPHONE', 'CALL_LOG', 'PHONE', 'CONTACTS'].forEach((k) => {
      if (isPermissionGranted(k)) count++;
    });
    [SYS_NAMES.OVERLAY, SYS_NAMES.ACCESSIBILITY].forEach((p) => {
      if (isSysPermissionGranted(p)) count++;
    });
    return count > 0 ? count : 6;
  }, [isPermissionGranted, isSysPermissionGranted, SYS_NAMES]);

  const onBackPress = () => {
    if (activeTab !== 'general') {
      setActiveTab('general');
    } else {
      if (navigation?.goBack) {
        navigation.goBack();
      } else {
        navigation?.navigate?.('Home');
      }
    }
  };

  const fromLangName = getLanguageName(fromLanguage);
  const toLangName = getLanguageName(toLanguage);
  const fromTag = SCRIPT_TAGS[fromLanguage] || fromLanguage.toUpperCase();
  const toTag = SCRIPT_TAGS[toLanguage] || toLanguage.toUpperCase();

  return (
    <ScreenContainer>
      <AppHeader
        title="Settings"
        showHomeBrand
        forceMenu
        rightComponent={
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => navigation?.navigate?.('Profile')}
            accessibilityLabel="Profile"
          >
            <User size={18} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        }
      />

      {/* Segmented Switcher for Settings Views */}
      <View style={styles.segmentBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentBar}
        >
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'general' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('general')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'general' && styles.segmentTextActive]}>
              General & Audio
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'floatingMic' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('floatingMic')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'floatingMic' && styles.segmentTextActive]}>
              Floating Mic & Keyboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'permissions' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('permissions')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'permissions' && styles.segmentTextActive]}>
              Permissions
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 1: GENERAL & AUDIO (media_1794547593247_f108ec5b.png)
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'general' && (
          <View>
            {/* Subheader bar */}
            <View style={styles.subHeaderRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={onBackPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
              </TouchableOpacity>
              <View style={styles.subHeaderCol}>
                <Text style={styles.subHeaderTitle} numberOfLines={1}>General & Audio</Text>
                <Text style={styles.subHeaderSub}>Preferences & live engines</Text>
              </View>
              <View style={styles.versionPill}>
                <View style={styles.versionDot} />
                <Text style={styles.versionPillText}>v3.4.2-pro • Synced</Text>
              </View>
            </View>

            {/* Section 1: APPEARANCE */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>APPEARANCE</Text>
              <Palette size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>Theme</Text>
              <Text style={styles.cardHeaderSub}>
                Choose how Type Easy looks. System default follows your phone setting.
              </Text>

              <View style={styles.themeOptionsWrap}>
                {THEME_OPTIONS.map((opt, idx) => {
                  const selected = themeMode === opt.mode;
                  const isLast = idx === THEME_OPTIONS.length - 1;
                  const IconComponent = opt.Icon;
                  return (
                    <TouchableOpacity
                      key={opt.mode}
                      style={[styles.themeRow, !isLast && styles.themeRowBorder]}
                      onPress={() => setThemeMode(opt.mode)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.themeIconBox, selected && styles.themeIconBoxActive]}>
                        <IconComponent
                          size={19}
                          color={selected ? colors.primary : colors.text.secondary}
                          strokeWidth={2.2}
                        />
                      </View>
                      <View style={styles.themeTextCol}>
                        <Text style={[styles.themeTitle, selected && styles.themeTitleActive]}>
                          {opt.title}
                        </Text>
                        <Text style={styles.themeSub} numberOfLines={1}>{opt.description}</Text>
                      </View>
                      {selected ? (
                        <View style={styles.checkCircleActive}>
                          <Check size={13} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      ) : (
                        <View style={styles.checkCirclePlaceholder} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.themeFooterRow}>
                <View style={styles.themeFooterDot} />
                <Text style={styles.themeFooterText}>
                  {themeMode === THEME_MODES.SYSTEM
                    ? `Currently following system (${isDark ? 'dark' : 'light'})`
                    : themeMode === THEME_MODES.DARK
                      ? 'Dark theme is active'
                      : 'Light theme is active'}
                </Text>
              </View>
            </View>

            {/* AI & Voice Engine Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>AI & VOICE ENGINE</Text>
              <Server size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>AI & Voice Engine</Text>
              <Text style={styles.cardHeaderSub}>
                Choose the AI engine for voice transcription, grammar, translation, and AI Q&A.
              </Text>

              <View style={styles.themeOptionsWrap}>
                {AI_ENGINE_OPTIONS.map((opt, idx) => {
                  const selected = aiEngine === opt.id;
                  const isLast = idx === AI_ENGINE_OPTIONS.length - 1;
                  const IconComponent = opt.Icon;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.themeRow, !isLast && styles.themeRowBorder]}
                      onPress={() => onAiEngineChange(opt.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.themeIconBox, selected && styles.themeIconBoxActive]}>
                        <IconComponent
                          size={19}
                          color={selected ? colors.primary : colors.text.secondary}
                          strokeWidth={2.2}
                        />
                      </View>
                      <View style={styles.themeTextCol}>
                        <Text style={[styles.themeTitle, selected && styles.themeTitleActive]}>
                          {opt.title}
                        </Text>
                        <Text style={styles.themeSub} numberOfLines={1}>{opt.description}</Text>
                      </View>
                      {selected ? (
                        <View style={styles.checkCircleActive}>
                          <Check size={13} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      ) : (
                        <View style={styles.checkCirclePlaceholder} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.themeFooterRow}>
                <View style={styles.themeFooterDot} />
                <Text style={styles.themeFooterText}>
                  {aiEngine === 'groq'
                    ? 'Groq AI active — Whisper v3 Turbo + Llama 3.3 (Testing mode)'
                    : 'Default Server active — Type Easy & Easy Voice backend'}
                </Text>
              </View>
            </View>

            {/* Section 2: TRANSLATION */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>TRANSLATION</Text>
              <Languages size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>Default languages</Text>
              <Text style={styles.cardHeaderSub}>
                Used by Translator and Floating Mic translation.
              </Text>

              {/* Language Selector Box */}
              <View style={styles.langSelectorContainer}>
                {/* FROM language */}
                <TouchableOpacity
                  style={styles.langRow}
                  onPress={() => setLanguagePickerFor('from')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langSideLabel}>FROM</Text>
                  <View style={styles.langCenterWrap}>
                    <Text style={styles.langNameText}>{fromLangName}</Text>
                    <View style={styles.langBadgePill}>
                      <Text style={styles.langBadgeText}>{fromTag}</Text>
                    </View>
                  </View>
                  <ChevronDown size={18} color={colors.text.secondary} strokeWidth={2} />
                </TouchableOpacity>

                {/* Floating Swap button */}
                <TouchableOpacity
                  style={styles.swapFloatingBtn}
                  onPress={swapLanguages}
                  activeOpacity={0.8}
                  accessibilityLabel="Swap languages"
                >
                  <ArrowUpDown size={15} color={colors.primary} strokeWidth={2.4} />
                </TouchableOpacity>

                {/* TO language */}
                <TouchableOpacity
                  style={styles.langRow}
                  onPress={() => setLanguagePickerFor('to')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langSideLabel}>TO</Text>
                  <View style={styles.langCenterWrap}>
                    <Text style={styles.langNameText}>{toLangName}</Text>
                    <View style={styles.langBadgePill}>
                      <Text style={styles.langBadgeText}>{toTag}</Text>
                    </View>
                  </View>
                  <ChevronDown size={18} color={colors.text.secondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.saveLangBtn}
                onPress={saveTranslationPreference}
                activeOpacity={0.8}
                disabled={isSavingLang}
              >
                <Save size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.saveLangBtnText}>
                  {isSavingLang ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Section 3: AUDIO */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>AUDIO</Text>
              <Mic size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>Upload audio → Transcribe</Text>
              <Text style={styles.cardHeaderSub}>
                Pick any recorded audio file. The transcript will appear below.
              </Text>

              {/* Action Buttons Row */}
              <View style={styles.audioActionsRow}>
                <TouchableOpacity
                  style={styles.uploadAudioBtn}
                  onPress={handlePickAndTranscribeAudio}
                  activeOpacity={0.8}
                  disabled={pickedTranscribing}
                >
                  <UploadCloud size={17} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.uploadAudioBtnText}>
                    {pickedTranscribing ? 'Transcribing…' : 'Upload audio'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.clearAudioBtn}
                  onPress={clearPickedTranscript}
                  activeOpacity={0.8}
                  disabled={pickedTranscribing || (!pickedTranscript && !pickedTranscriptError && !pickedAudioUri)}
                >
                  <Trash2 size={16} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.clearAudioBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Audio State Box */}
              <View style={styles.audioStateBox}>
                <View style={styles.audioIconCircle}>
                  <AudioLines size={22} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={styles.audioStateTitle}>
                  {pickedAudioUri ? 'Audio loaded' : 'No audio loaded'}
                </Text>
                <Text style={styles.audioStateSub}>
                  {pickedAudioUri
                    ? pickedAudioUri.split('/').pop()
                    : 'Supports MP3, WAV, M4A, and AAC up to 50MB'}
                </Text>
              </View>

              {pickedTranscribing && (
                <View style={styles.transcribeLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.transcribeLoadingText}>
                    {typeof modelDownloadPct === 'number' && modelDownloadPct < 100
                      ? `Downloading model… ${modelDownloadPct}%`
                      : 'Transcribing speech…'}
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
                      {pickedTranscriptCopied && (
                        <Text style={styles.transcribeCopiedText}>Copied</Text>
                      )}
                      <TouchableOpacity
                        style={styles.copyIconBtn}
                        onPress={copyPickedTranscript}
                        activeOpacity={0.8}
                      >
                        <Copy size={16} color={colors.primary} strokeWidth={2.2} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.transcribeResultText}>{pickedTranscript}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 2: FLOATING MIC & KEYBOARD (media_1794547606953_57253bb7.jpg)
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'floatingMic' && (
          <View>
            {/* Subheader bar */}
            <View style={styles.subHeaderRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={onBackPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
              </TouchableOpacity>
              <View style={styles.subHeaderCol}>
                <View style={styles.engineTagRow}>
                  <Text style={styles.engineTagText}>Voice & Input Engine •</Text>
                </View>
                <Text style={styles.subHeaderTitle} numberOfLines={1}>Floating Mic & Keyboard</Text>
              </View>
            </View>

            {/* Hero Ready Banner */}
            <View style={styles.heroBannerWrap}>
              <View style={styles.heroBannerTop}>
                <View style={styles.heroIconSquare}>
                  <AudioLines size={20} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <View style={styles.heroBannerDetails}>
                  <Text style={styles.heroBannerTitle}>Overlay is Active & Ready</Text>
                  <Text style={styles.heroBannerSub}>Floating pill anchored to screen edge</Text>
                </View>
                <View style={styles.badgeLive}>
                  <Check size={11} color="#10B981" strokeWidth={3} />
                  <Text style={styles.badgeLiveText}>Live</Text>
                </View>
              </View>

              <View style={styles.heroWaveRow}>
                <View style={styles.waveBarsRow}>
                  <View style={[styles.waveBar, styles.waveBarH6]} />
                  <View style={[styles.waveBar, styles.waveBarH12]} />
                  <View style={[styles.waveBar, styles.waveBarH8]} />
                  <View style={[styles.waveBar, styles.waveBarH16]} />
                  <View style={[styles.waveBar, styles.waveBarH10]} />
                  <View style={[styles.waveBar, styles.waveBarH6]} />
                </View>
                <Text style={styles.heroTriggerText}>Press & hold screen trigger anytime</Text>
              </View>
            </View>

            {/* SECTION 1: FLOATING MIC */}
            <View style={styles.sectionHeaderRow}>
              <Mic size={16} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.sectionLabelWithIcon}>SECTION 1: FLOATING MIC</Text>
            </View>

            {/* Card 1: Overlay actions */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <Text style={styles.cardHeaderTitle}>Overlay actions</Text>
                <View style={styles.activePillBadge}>
                  <Text style={styles.activePillBadgeText}>{`${activeOverlayCount} Active`}</Text>
                </View>
              </View>
              <Text style={styles.cardHeaderSub}>
                Choose what the floating overlay can do. Keep at least one enabled.
              </Text>

              {/* Toggles list */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleIconCircle}>
                  <Mic size={17} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.toggleDetails}>
                  <Text style={styles.toggleTitle}>Microphone</Text>
                  <Text style={styles.toggleSub}>Dictate / transcribe</Text>
                </View>
                <Switch
                  value={overlayMicEnabled}
                  onValueChange={onOverlayMicToggle}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleIconCircle}>
                  <Languages size={17} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.toggleDetails}>
                  <Text style={styles.toggleTitle}>Translation</Text>
                  <Text style={styles.toggleSub}>Speak → on-device translate</Text>
                </View>
                <Switch
                  value={overlayTranslationEnabled}
                  onValueChange={onOverlayTranslationToggle}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleIconCircle}>
                  <AskAiIcon size={18} />
                </View>
                <View style={styles.toggleDetails}>
                  <Text style={styles.toggleTitle}>Ask Question</Text>
                  <Text style={styles.toggleSub}>
                    Voice → AI answer (injected as returned, no extra translation)
                  </Text>
                </View>
                <Switch
                  value={overlayAskQuestionEnabled}
                  onValueChange={onOverlayAskQuestionToggle}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleIconCircle}>
                  <Zap size={17} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.toggleDetails}>
                  <Text style={styles.toggleTitle}>Voice Command</Text>
                  <Text style={styles.toggleSub}>Record → transcribe → edit → execute</Text>
                </View>
                <Switch
                  value={overlayVoiceCommandEnabled}
                  onValueChange={onOverlayVoiceCommandToggle}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Card 2: Internal Modes */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <Text style={styles.cardHeaderTitle}>Internal Modes</Text>
                <View style={styles.badgeAutomated}>
                  <Text style={styles.badgeAutomatedText}>Automated</Text>
                </View>
              </View>
              <Text style={styles.cardHeaderSub}>Background automation rules</Text>

              <View style={styles.toggleRow}>
                <View style={styles.toggleDetailsNoIcon}>
                  <Text style={styles.toggleTitle}>Internal Transcribe</Text>
                  <Text style={styles.toggleSub}>
                    Applies when overlay Microphone is on. Off while Microphone overlay is off.
                  </Text>
                </View>
                <Switch
                  value={internalTranscribe}
                  onValueChange={onInternalTranscribeToggle}
                  disabled={!overlayMicEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleDetailsNoIcon}>
                  <Text style={styles.toggleTitle}>Internal Translation</Text>
                  <Text style={styles.toggleSub}>
                    Applies when overlay Translation is on. Off while Translation overlay is off.
                  </Text>
                </View>
                <Switch
                  value={internalFloatingTranslation}
                  onValueChange={onInternalFloatingTranslationToggle}
                  disabled={!overlayTranslationEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* SECTION 2: TYPE EASY KEYBOARD */}
            <View style={styles.sectionHeaderRow}>
              <Keyboard size={16} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.sectionLabelWithIcon}>SECTION 2: TYPE EASY KEYBOARD</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.keyboardCardHeader}>
                <View style={styles.keyboardIconBox}>
                  <Keyboard size={20} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.keyboardTitleCol}>
                  <View style={styles.keyboardTitleRow}>
                    <Text style={styles.keyboardTitle}>Advanced Keyboard</Text>
                    <CheckCircle2 size={16} color={colors.primary} strokeWidth={2.4} />
                  </View>
                  <Text style={styles.keyboardSub}>
                    Full QWERTY with Translate, Grammar Check and Voice input built in
                  </Text>
                </View>
              </View>

              {/* Features list container */}
              <View style={styles.keyboardFeaturesBox}>
                <View style={styles.featureItemRow}>
                  <Text style={styles.featureBullet}>🌐</Text>
                  <Text style={styles.featureText}>Translate text while typing</Text>
                </View>
                <View style={styles.featureItemRow}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>Grammar check in one tap</Text>
                </View>
                <View style={styles.featureItemRow}>
                  <Text style={styles.featureBullet}>🎤</Text>
                  <Text style={styles.featureText}>Voice input — speak to type</Text>
                </View>
                <View style={styles.featureItemRow}>
                  <Text style={styles.featureBullet}>⇧</Text>
                  <Text style={styles.featureText}>Shift, Caps Lock, Symbols layer</Text>
                </View>
                <View style={styles.featureItemRow}>
                  <Text style={styles.featureBullet}>💡</Text>
                  <Text style={styles.featureText}>Word suggestions bar</Text>
                </View>
              </View>

              {/* Toggles */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleDetailsNoIcon}>
                  <Text style={styles.toggleTitle}>Enable Keyboard</Text>
                  <Text style={styles.toggleSub}>
                    Opens Android keyboard settings to enable Type Easy
                  </Text>
                </View>
                <Switch
                  value={keyboardEnabled}
                  onValueChange={() => {
                    NativeModules.KeyboardModule?.openKeyboardSettings?.();
                    setTimeout(() => checkKeyboardStatus(), 1500);
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleDetailsNoIcon}>
                  <Text style={styles.toggleTitle}>Select Keyboard</Text>
                  <Text style={styles.toggleSub}>
                    Opens the keyboard picker to switch to Type Easy
                  </Text>
                </View>
                <Switch
                  value={keyboardSelected}
                  onValueChange={() => {
                    NativeModules.KeyboardModule?.showKeyboardPicker?.();
                    setTimeout(() => checkKeyboardStatus(), 1500);
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={styles.openKeyboardBtn}
                onPress={() => {
                  NativeModules.KeyboardModule?.openKeyboardSettings?.();
                  setTimeout(() => checkKeyboardStatus(), 1500);
                }}
                activeOpacity={0.8}
              >
                <Keyboard size={17} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.openKeyboardBtnText}>Open Keyboard Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 3: PERMISSIONS (media_1794547622744_d7b23c6e.png)
           ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'permissions' && (
          <View>
            {/* Subheader bar */}
            <View style={styles.subHeaderRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={onBackPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
              </TouchableOpacity>
              <View style={styles.subHeaderCol}>
                <Text style={styles.subHeaderTitle} numberOfLines={1}>Permissions</Text>
                <Text style={styles.systemHubText}>SYSTEM ACCESS HUB</Text>
              </View>
              <View style={styles.versionPill}>
                <View style={styles.versionDot} />
                <Text style={styles.versionPillText}>{`${grantedCount} Active`}</Text>
              </View>
            </View>

            {/* Hero Voice Intelligence Banner */}
            <View style={styles.heroVoiceBanner}>
              <View style={styles.heroVoiceIconCircle}>
                <ShieldCheck size={22} color="#FFFFFF" strokeWidth={2.4} />
              </View>
              <View style={styles.heroVoiceDetails}>
                <Text style={styles.heroVoiceTitle}>Engine ready for voice intelligence</Text>
                <Text style={styles.heroVoiceSub}>
                  All primary audio conduits and transcription channels are authorized and running locally.
                </Text>
              </View>
              <View style={styles.heroWaveGraphic}>
                <View style={[styles.heroWaveStick, styles.waveBarH8]} />
                <View style={[styles.heroWaveStick, styles.waveBarH16]} />
                <View style={[styles.heroWaveStick, styles.waveBarH12]} />
                <View style={[styles.heroWaveStick, styles.waveBarH20]} />
              </View>
            </View>

            {/* App Permissions & Access */}
            <View style={styles.permissionsSectionHeader}>
              <Text style={styles.permSectionTitle}>App Permissions & Access</Text>
              <TouchableOpacity
                style={styles.refreshAllPillBtn}
                onPress={refreshAll}
                activeOpacity={0.8}
              >
                <RotateCw size={14} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.refreshAllPillText}>Refresh All</Text>
              </TouchableOpacity>
            </View>

            {/* 4 Standard Permissions */}
            {[
              {
                key: 'MICROPHONE',
                name: 'Microphone',
                Icon: Mic,
              },
              {
                key: 'CALL_LOG',
                name: 'Call Logs',
                Icon: PhoneCall,
              },
              {
                key: 'PHONE',
                name: 'Phone State',
                Icon: Smartphone,
              },
              {
                key: 'CONTACTS',
                name: 'Contacts',
                Icon: Users,
              },
            ].map((item) => {
              const isGranted = isPermissionGranted(item.key);
              const isBlocked = isPermissionBlocked(item.key);
              const IconComp = item.Icon;
              return (
                <View key={item.key} style={styles.permCard}>
                  <View style={styles.permTopRow}>
                    <View style={styles.permIconCircle}>
                      <IconComp size={18} color={colors.primary} strokeWidth={2.2} />
                    </View>
                    <View style={styles.permDetails}>
                      <View style={styles.permTitleRow}>
                        <Text style={styles.permTitleText}>{item.name}</Text>
                        <View style={isGranted ? styles.badgeGranted : styles.badgeDenied}>
                          <Check size={11} color={isGranted ? '#10B981' : '#F59E0B'} strokeWidth={3} />
                          <Text style={isGranted ? styles.badgeGrantedText : styles.badgeDeniedText}>
                            {isGranted ? 'Granted' : 'Denied'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.permDescText}>{getStdDescription(item.key)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.permActionButton, isGranted ? styles.permActionGranted : styles.permActionAllow]}
                    onPress={() => handleStdRequest(item.key)}
                    disabled={stdLoading}
                    activeOpacity={0.8}
                  >
                    <Check size={14} color={isGranted ? '#10B981' : '#FFFFFF'} strokeWidth={2.6} />
                    <Text style={isGranted ? styles.permActionGrantedText : styles.permActionAllowText}>
                      {isGranted ? 'Granted' : isBlocked ? 'Open Settings' : 'Allow'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* System & Overlay Section */}
            <Text style={styles.systemSectionTitle}>System & Overlay</Text>

            {/* Display Over Other Apps */}
            <View style={styles.permCard}>
              <View style={styles.permTopRow}>
                <View style={styles.permIconCircle}>
                  <Layers size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.permDetails}>
                  <View style={styles.permTitleRow}>
                    <Text style={styles.permTitleText}>Display Over Other Apps</Text>
                    <View style={isSysPermissionGranted(SYS_NAMES.OVERLAY) ? styles.badgeGranted : styles.badgeDenied}>
                      <Check
                        size={11}
                        color={isSysPermissionGranted(SYS_NAMES.OVERLAY) ? '#10B981' : '#F59E0B'}
                        strokeWidth={3}
                      />
                      <Text style={isSysPermissionGranted(SYS_NAMES.OVERLAY) ? styles.badgeGrantedText : styles.badgeDeniedText}>
                        {isSysPermissionGranted(SYS_NAMES.OVERLAY) ? 'Granted' : 'Denied'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.permDescText}>
                    Display floating dictation heads and responsive voice controls directly on top of your...
                  </Text>
                </View>
              </View>

              <View style={styles.sysActionButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.sysPrimaryBtn,
                    isSysPermissionGranted(SYS_NAMES.OVERLAY) ? styles.permActionGranted : styles.permActionAllow,
                  ]}
                  onPress={() => handleSysRequest(SYS_NAMES.OVERLAY)}
                  disabled={isPermissionLoading(SYS_NAMES.OVERLAY)}
                  activeOpacity={0.8}
                >
                  <Check
                    size={14}
                    color={isSysPermissionGranted(SYS_NAMES.OVERLAY) ? '#10B981' : '#FFFFFF'}
                    strokeWidth={2.6}
                  />
                  <Text style={isSysPermissionGranted(SYS_NAMES.OVERLAY) ? styles.permActionGrantedText : styles.permActionAllowText}>
                    {isSysPermissionGranted(SYS_NAMES.OVERLAY) ? 'Enabled' : 'Enable'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sysCheckBtn}
                  onPress={() => handleCheckSys(SYS_NAMES.OVERLAY)}
                  activeOpacity={0.8}
                >
                  <RotateCw size={13} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.sysCheckBtnText}>Check</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Accessibility Service */}
            <View style={styles.permCard}>
              <View style={styles.permTopRow}>
                <View style={styles.permIconCircle}>
                  <Accessibility size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.permDetails}>
                  <View style={styles.permTitleRow}>
                    <Text style={styles.permTitleText}>Accessibility Service</Text>
                    <View style={isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? styles.badgeGranted : styles.badgeDenied}>
                      <Check
                        size={11}
                        color={isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? '#10B981' : '#F59E0B'}
                        strokeWidth={3}
                      />
                      <Text style={isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? styles.badgeGrantedText : styles.badgeDeniedText}>
                        {isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? 'Granted' : 'Denied'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.permDescText}>
                    Accessibility service for enhanced functionality, smart cursor placement, and global vocal...
                  </Text>
                </View>
              </View>

              <View style={styles.sysActionButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.sysPrimaryBtn,
                    isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? styles.permActionGranted : styles.permActionAllow,
                  ]}
                  onPress={() => handleSysRequest(SYS_NAMES.ACCESSIBILITY)}
                  disabled={isPermissionLoading(SYS_NAMES.ACCESSIBILITY)}
                  activeOpacity={0.8}
                >
                  <Check
                    size={14}
                    color={isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? '#10B981' : '#FFFFFF'}
                    strokeWidth={2.6}
                  />
                  <Text style={isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? styles.permActionGrantedText : styles.permActionAllowText}>
                    {isSysPermissionGranted(SYS_NAMES.ACCESSIBILITY) ? 'Enabled' : 'Enable'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sysCheckBtn}
                  onPress={() => handleCheckSys(SYS_NAMES.ACCESSIBILITY)}
                  activeOpacity={0.8}
                >
                  <RotateCw size={13} color={colors.text.primary} strokeWidth={2.2} />
                  <Text style={styles.sysCheckBtnText}>Check</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* App Permissions in System Settings */}
            <View style={styles.card}>
              <View style={styles.settingsLinkTop}>
                <View style={styles.settingsGearCircle}>
                  <SettingsIcon size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.settingsLinkDetails}>
                  <Text style={styles.cardHeaderTitle}>App Permissions in System Settings</Text>
                  <Text style={styles.cardHeaderSub}>
                    If a permission was permanently denied, open system settings to enable it manually.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.openAppSettingsBtn}
                onPress={openAppSettings}
                activeOpacity={0.8}
              >
                <Text style={styles.openAppSettingsBtnText}>Open App Settings</Text>
                <ExternalLink size={16} color="#FFFFFF" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Footer Notice */}
            <View style={styles.permFooterNotice}>
              <Info size={14} color={colors.text.secondary} strokeWidth={2} />
              <Text style={styles.permFooterNoticeText}>
                After enabling permissions in system settings, return here and tap 'Refresh All' to update statuses.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Language Picker Modal */}
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

export default SettingsScreen;

function createSettingsStyles(colors, isDark) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
    },
    segmentBarWrapper: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.background,
    },
    segmentBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    segmentBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    },
    segmentBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    segmentText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      paddingTop: 4,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderCol: {
      flex: 1,
      marginLeft: 12,
    },
    engineTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 2,
    },
    engineTagText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    subHeaderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    subHeaderSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 1,
    },
    systemHubText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.5,
      marginTop: 1,
    },
    versionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    versionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#10B981',
    },
    versionPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.8,
    },
    sectionLabelWithIcon: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.6,
      marginLeft: 6,
      flex: 1,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
    cardHeaderTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    cardHeaderSub: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 12,
    },
    cardHeaderBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    themeOptionsWrap: {
      marginBottom: 10,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
    },
    themeRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    themeIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeIconBoxActive: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#EFF6FF',
    },
    themeTextCol: {
      flex: 1,
    },
    themeTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    themeTitleActive: {
      color: colors.primary,
      fontWeight: '800',
    },
    themeSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    checkCircleActive: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkCirclePlaceholder: {
      width: 22,
      height: 22,
    },
    themeFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
    },
    themeFooterDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#10B981',
      marginRight: 6,
    },
    themeFooterText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    langSelectorContainer: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
      position: 'relative',
      marginBottom: 14,
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    langSideLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      width: 44,
      letterSpacing: 0.5,
    },
    langCenterWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    langNameText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    langBadgePill: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.3)' : '#DBEAFE',
    },
    langBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    swapFloatingBtn: {
      position: 'absolute',
      right: 18,
      top: '50%',
      marginTop: -16,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
      zIndex: 10,
    },
    saveLangBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 2,
    },
    saveLangBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    audioActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    uploadAudioBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 12,
    },
    uploadAudioBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    clearAudioBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    clearAudioBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    audioStateBox: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 16,
      paddingVertical: 24,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    },
    audioIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    audioStateTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    audioStateSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
      textAlign: 'center',
    },
    transcribeLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
    },
    transcribeLoadingText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    transcribeErrorBox: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    transcribeErrorText: {
      color: '#EF4444',
      fontSize: 12,
      fontWeight: '600',
    },
    transcribeResultBox: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    transcribeResultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    transcribeResultLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
    },
    transcribeHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    transcribeCopiedText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    copyIconBtn: {
      padding: 4,
    },
    transcribeResultText: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 19,
    },
    heroBannerWrap: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.15)' : '#EFF6FF',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.28)' : '#DBEAFE',
      marginBottom: 14,
    },
    heroBannerTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroIconSquare: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    heroBannerDetails: {
      flex: 1,
    },
    heroBannerTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    heroBannerSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    badgeLive: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BFDBFE',
    },
    badgeLiveText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#10B981',
    },
    heroWaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(0, 229, 146, 0.2)' : '#DBEAFE',
    },
    waveBarsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    waveBar: {
      width: 3,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    waveBarH6: { height: 6 },
    waveBarH8: { height: 8 },
    waveBarH10: { height: 10 },
    waveBarH12: { height: 12 },
    waveBarH16: { height: 16 },
    waveBarH20: { height: 20 },
    heroTriggerText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    activePillBadge: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    activePillBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    toggleIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    toggleDetails: {
      flex: 1,
      marginRight: 8,
    },
    toggleDetailsNoIcon: {
      flex: 1,
      marginRight: 8,
    },
    toggleTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    toggleSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
      lineHeight: 16,
    },
    badgeAutomated: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    badgeAutomatedText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#10B981',
    },
    keyboardCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    keyboardIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    keyboardTitleCol: {
      flex: 1,
    },
    keyboardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    keyboardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    keyboardSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
      lineHeight: 16,
    },
    keyboardFeaturesBox: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      gap: 8,
    },
    featureItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    featureBullet: {
      fontSize: 13,
      width: 18,
      textAlign: 'center',
    },
    featureText: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: '500',
    },
    openKeyboardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      marginTop: 12,
    },
    openKeyboardBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    heroVoiceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.15)' : '#EFF6FF',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.28)' : '#DBEAFE',
      marginBottom: 16,
    },
    heroVoiceIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    heroVoiceDetails: {
      flex: 1,
    },
    heroVoiceTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    heroVoiceSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 3,
      lineHeight: 17,
    },
    heroWaveGraphic: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 8,
    },
    heroWaveStick: {
      width: 3,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    permissionsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    permSectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    refreshAllPillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.28)' : '#DBEAFE',
    },
    refreshAllPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    permCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    permTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    permIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    permDetails: {
      flex: 1,
    },
    permTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    permTitleText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    badgeGranted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BFDBFE',
    },
    badgeGrantedText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#10B981',
    },
    badgeDenied: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    },
    badgeDeniedText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#F59E0B',
    },
    permDescText: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 16,
      marginTop: 4,
    },
    permActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 12,
    },
    permActionGranted: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BFDBFE',
    },
    permActionAllow: {
      backgroundColor: colors.primary,
    },
    permActionGrantedText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#10B981',
    },
    permActionAllowText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    systemSectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      marginTop: 10,
      marginBottom: 10,
    },
    sysActionButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sysPrimaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 12,
    },
    sysCheckBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 12,
    },
    sysCheckBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    settingsLinkTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    settingsGearCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    settingsLinkDetails: {
      flex: 1,
    },
    openAppSettingsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
    },
    openAppSettingsBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    permFooterNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 6,
      marginTop: 6,
    },
    permFooterNoticeText: {
      flex: 1,
      fontSize: 11,
      color: colors.text.secondary,
      lineHeight: 15,
    },
    bottomSpacer: {
      height: 28,
    },
  });
}
