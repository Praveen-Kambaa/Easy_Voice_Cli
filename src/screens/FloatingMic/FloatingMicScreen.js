import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  DeviceEventEmitter,
  TouchableOpacity,
  Animated,
  Easing,
  Switch,
  Platform,
  Linking,
  NativeModules,
} from 'react-native';
import {
// ArrowLeft,
// HelpCircle,
// SlidersHorizontal,
  Mic,
  Play,
  Power,
  Layers,
  ShieldCheck,
  FileText,
  ChevronRight,
  ClipboardPaste,
  Vibrate,
  EyeOff,
  Sparkles,
  Volume2,
  Keyboard,
} from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AskAiIcon } from '../../components/common/AskAiIcon';
import { useFloatingMic } from '../../hooks/useFloatingMic';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { FloatingSpeechHistoryService } from '../../services/FloatingSpeechHistoryService';

const FloatingMicScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const showAlert = useAlert();

  const [historyNotes, setHistoryNotes] = useState([]);
  const [lastNote, setLastNote] = useState(null);
  const [bubblePosition, setBubblePosition] = useState('Right Edge');

  // Overlay behaviors state
  const [directInsert, setDirectInsert] = useState(true);
  const [tactileClick, setTactileClick] = useState(true);
  const [fadeIdle, setFadeIdle] = useState(false);

  const orbAnim = useRef(new Animated.Value(0)).current;

  const {
    isServiceActive,
    permissions,
    toggleFloatingMic,
    refreshFloatingMicSnapshot,
    handleMissingPermissions,
    needsPermissions,
  } = useFloatingMic();

  const loadHistory = useCallback(async () => {
    try {
      const all = await FloatingSpeechHistoryService.getAll();
      setHistoryNotes(all);
      if (all && all.length > 0) {
        setLastNote(all[all.length - 1]);
      }
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshFloatingMicSnapshot();
      loadHistory();
    }, [refreshFloatingMicSnapshot, loadHistory]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'FloatingMicService_onTranscriptionComplete',
      (text) => {
        loadHistory();
      },
    );
    return () => sub.remove();
  }, [loadHistory]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(orbAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [orbAnim]);

  const handleOpenKeyboardSettings = () => {
    if (typeof NativeModules.KeyboardModule?.openKeyboardSettings === 'function') {
      NativeModules.KeyboardModule.openKeyboardSettings();
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const handleTestBubble = () => {
    if (Platform.OS === 'ios') {
      showAlert(
        'TypeEasy on iOS',
        'Floating overlay bubbles are an Android-specific feature. On iOS and Mac, use the TypeEasy Keyboard extension to dictate and translate in any app!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Keyboard Settings', onPress: handleOpenKeyboardSettings },
        ]
      );
      return;
    }
    if (needsPermissions) {
      handleMissingPermissions();
      return;
    }
    showAlert('Test Bubble', 'Floating mic test initiated. Look for the floating bubble on screen.');
    if (!isServiceActive) {
      toggleFloatingMic();
    }
  };

  const handleToggleDock = () => {
    if (Platform.OS === 'ios') {
      showAlert(
        'TypeEasy on iOS',
        'Floating overlay bubbles are an Android-specific feature. On iOS and Mac, use the TypeEasy Keyboard extension to dictate and translate in any app!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Keyboard Settings', onPress: handleOpenKeyboardSettings },
        ]
      );
      return;
    }
    if (needsPermissions) {
      handleMissingPermissions();
      return;
    }
    toggleFloatingMic();
  };

  const handleReposition = () => {
    setBubblePosition((prev) => (prev === 'Right Edge' ? 'Left Edge' : 'Right Edge'));
    showAlert('Bubble Position', `Floating bubble positioned on the ${bubblePosition === 'Right Edge' ? 'Left Edge' : 'Right Edge'}.`);
  };

  const handleResetBehaviors = () => {
    setDirectInsert(true);
    setTactileClick(true);
    setFadeIdle(false);
    showAlert('Reset', 'Overlay behaviors reset to default.');
  };

  const lastNoteText = lastNote?.text ? String(lastNote.text).trim() : '';
  const notesCount = historyNotes.length;

  return (
    <ScreenContainer>
      <AppHeader
        title="Floating Mic"
        showHomeBrand
        forceMenu
        rightComponent={
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Mic size={18} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subheader bar commented out to prevent duplicate Floating Mic title
        <View style={styles.subHeaderRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
          </TouchableOpacity>
          <View style={styles.subHeaderTitles}>
            <Text style={styles.subHeaderTitle}>Floating Mic</Text>
            <Text style={styles.subHeaderSubtitle}>Global System Dictation</Text>
          </View>
          <View style={styles.subHeaderIcons}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() =>
                showAlert(
                  'About Floating Mic',
                  'Floating Mic provides universal voice dictation across all installed apps. Drag the bubble to reposition it anywhere on your screen.',
                )
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <HelpCircle size={20} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <SlidersHorizontal size={19} color={colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
        */}

        {/* Hero Card */}
        <View style={styles.heroCard}>
          {/* Animated concentric glowing ripple rings */}
          <View style={styles.orbContainer}>
            <Animated.View
              style={[
                styles.rippleOuter,
                {
                  transform: [
                    {
                      scale: orbAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1.06],
                      }),
                    },
                  ],
                  opacity: orbAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 0.7],
                  }),
                },
              ]}
            />
            <View style={styles.rippleMid} />
            <View style={styles.rippleInner} />
            <TouchableOpacity
              style={styles.centerOrb}
              onPress={handleToggleDock}
              activeOpacity={0.88}
            >
              <Mic size={34} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
            <View style={styles.sparkleBadge}>
              <AskAiIcon size={13} />
            </View>
          </View>

          {/* Status Badge */}
          <View
            style={[
              styles.statusPill,
              !isServiceActive && styles.statusPillInactive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                !isServiceActive && styles.statusDotInactive,
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                !isServiceActive && styles.statusPillTextInactive,
              ]}
            >
              {isServiceActive ? 'Overlay Active' : 'Overlay Inactive'}
            </Text>
          </View>

          {/* Main Title & Subtitle */}
          <Text style={styles.heroTitle}>
            {Platform.OS === 'ios'
              ? 'iOS System Dictation'
              : (isServiceActive ? 'Floating Overlay Active' : 'Floating Overlay Inactive')}
          </Text>
          <Text style={styles.heroSub}>
            {Platform.OS === 'ios'
              ? 'Use TypeEasy Keyboard in any app to trigger voice dictation & translation instantly.'
              : 'Tap the hovering bubble in any app to trigger voice dictation instantly.'}
          </Text>

          {/* Last Heard Voice Note Mini Card - only shown when there's an actual note */}
          {lastNoteText ? (
            <View style={styles.lastHeardCard}>
              <View style={styles.lastHeardIconWrap}>
                <Volume2 size={16} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.lastHeardContent}>
                <View style={styles.lastHeardHeader}>
                  <Text style={styles.lastHeardTitle}>Last Heard Voice Note</Text>
                  {lastNote?.createdAt ? (
                    <Text style={styles.lastHeardTime}>
                      {new Date(lastNote.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.lastHeardQuote} numberOfLines={1}>
                  &ldquo;{lastNoteText}&rdquo;
                </Text>
              </View>
            </View>
          ) : null}

          {/* Two Action Buttons Row */}
          <View style={styles.heroActionsRow}>
            <TouchableOpacity
              style={styles.testBubbleBtn}
              onPress={handleTestBubble}
              activeOpacity={0.8}
            >
              <Play size={15} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
              <Text style={styles.testBubbleBtnText}>Test Bubble</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dockBubbleBtn}
              onPress={handleToggleDock}
              activeOpacity={0.88}
            >
              <Power size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.dockBubbleBtnText}>
                {Platform.OS === 'ios'
                  ? 'Keyboard Setup'
                  : (isServiceActive ? 'Dock Bubble' : 'Start Bubble')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2-Column Status Cards: Position & System */}
        <View style={styles.statusCardsRow}>
          <TouchableOpacity
            style={styles.statusCard}
            onPress={handleReposition}
            activeOpacity={0.78}
          >
            <View style={styles.statusCardTop}>
              <View style={styles.statusCardIconBoxBlue}>
                <Layers size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.statusCardKicker}>Position</Text>
            </View>
            <Text style={styles.statusCardTitle}>{bubblePosition}</Text>
            <Text style={styles.statusCardLink}>Tap to reposition 🔗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statusCard}
            onPress={Platform.OS === 'ios' ? handleOpenKeyboardSettings : handleMissingPermissions}
            activeOpacity={0.78}
          >
            <View style={styles.statusCardTop}>
              <View style={styles.statusCardIconBoxGreen}>
                {Platform.OS === 'ios' ? (
                  <Keyboard size={18} color="#15803D" strokeWidth={2.2} />
                ) : (
                  <ShieldCheck size={18} color="#15803D" strokeWidth={2.2} />
                )}
              </View>
              <Text style={styles.statusCardKicker}>System</Text>
            </View>
            <Text style={styles.statusCardTitle}>
              {Platform.OS === 'ios' ? 'TypeEasy Keyboard' : 'Draw Over Apps'}
            </Text>
            <Text style={styles.statusCardGranted}>
              {Platform.OS === 'ios' ? '✓ Configured' : (permissions?.overlay ? '✓ Granted' : 'Setup Required')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Link Card: Speech Transcripts */}
        <TouchableOpacity
          style={styles.transcriptsCard}
          onPress={() => navigation.navigate('FloatingMicHistory')}
          activeOpacity={0.8}
        >
          <View style={styles.transcriptsIconBox}>
            <FileText size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.transcriptsContent}>
            <Text style={styles.transcriptsTitle}>Speech Transcripts</Text>
            <Text style={styles.transcriptsSub}>
              {notesCount > 0
                ? `${notesCount} transcript${notesCount === 1 ? '' : 's'} recorded`
                : 'No transcripts recorded yet'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.text.secondary} strokeWidth={2.2} />
        </TouchableOpacity>

        {/* OVERLAY BEHAVIORS Section */}
        <View style={styles.behaviorsSection}>
          <View style={styles.behaviorsHeader}>
            <Text style={styles.behaviorsKicker}>OVERLAY BEHAVIORS</Text>
            <TouchableOpacity onPress={handleResetBehaviors} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Row 1: Direct Insert */}
          <View style={styles.behaviorRow}>
            <View style={styles.behaviorIconBox}>
              <ClipboardPaste size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.behaviorTextCol}>
              <Text style={styles.behaviorTitle}>Direct Insert in Apps</Text>
              <Text style={styles.behaviorSub}>Auto-paste into WhatsApp, Slack …</Text>
            </View>
            <Switch
              value={directInsert}
              onValueChange={setDirectInsert}
              trackColor={{ false: colors.switch?.trackOff || '#D1D5DB', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Row 2: Tactile Speech Click */}
          <View style={styles.behaviorRow}>
            <View style={styles.behaviorIconBox}>
              <Vibrate size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.behaviorTextCol}>
              <Text style={styles.behaviorTitle}>Tactile Speech Click</Text>
              <Text style={styles.behaviorSub}>Haptic pulse when speech pauses</Text>
            </View>
            <Switch
              value={tactileClick}
              onValueChange={setTactileClick}
              trackColor={{ false: colors.switch?.trackOff || '#D1D5DB', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Row 3: Fade Bubble When Idle */}
          <View style={styles.behaviorRow}>
            <View style={styles.behaviorIconBox}>
              <EyeOff size={18} color={colors.text.secondary} strokeWidth={2.2} />
            </View>
            <View style={styles.behaviorTextCol}>
              <Text style={styles.behaviorTitle}>Fade Bubble When Idle</Text>
              <Text style={styles.behaviorSub}>Reduce bubble opacity to 35% aft…</Text>
            </View>
            <Switch
              value={fadeIdle}
              onValueChange={setFadeIdle}
              trackColor={{ false: colors.switch?.trackOff || '#D1D5DB', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    bottomSpacer: {
      height: 8,
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      gap: 14,
    },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderTitles: {
      flex: 1,
      marginLeft: 12,
    },
    subHeaderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
    },
    subHeaderSubtitle: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 1,
    },
    subHeaderIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerIconBtn: {
      padding: 4,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    orbContainer: {
      width: 170,
      height: 170,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      marginVertical: 10,
    },
    rippleOuter: {
      position: 'absolute',
      width: 164,
      height: 164,
      borderRadius: 82,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
    },
    rippleMid: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.2)' : '#DBEAFE',
    },
    rippleInner: {
      position: 'absolute',
      width: 98,
      height: 98,
      borderRadius: 49,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.35)' : '#BFDBFE',
    },
    centerOrb: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 6,
    },
    sparkleBadge: {
      position: 'absolute',
      top: 14,
      right: 20,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      marginTop: 8,
      marginBottom: 8,
    },
    statusPillInactive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: '#16A34A',
    },
    statusDotInactive: {
      backgroundColor: colors.text.secondary,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    statusPillTextInactive: {
      color: colors.text.secondary,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 6,
    },
    heroSub: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 280,
      marginBottom: 16,
    },
    lastHeardCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.08)' : '#EFF6FF',
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.2)' : '#DBEAFE',
      marginBottom: 16,
    },
    lastHeardIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lastHeardContent: {
      flex: 1,
    },
    lastHeardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    lastHeardTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    lastHeardTime: {
      fontSize: 10,
      color: colors.text.secondary,
    },
    lastHeardQuote: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    heroActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
    },
    testBubbleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      paddingVertical: 12,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    testBubbleBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.primary,
    },
    dockBubbleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#0F56B3',
      paddingVertical: 12,
      borderRadius: 22,
      shadowColor: '#0F56B3',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    dockBubbleBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    statusCardsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    statusCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    statusCardIconBoxBlue: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusCardIconBoxGreen: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusCardKicker: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    statusCardTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 4,
    },
    statusCardLink: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    statusCardGranted: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    transcriptsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    transcriptsIconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    transcriptsContent: {
      flex: 1,
    },
    transcriptsTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    transcriptsSub: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    behaviorsSection: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 14,
    },
    behaviorsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    behaviorsKicker: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 1.1,
    },
    resetText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    behaviorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    behaviorIconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.14)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    behaviorTextCol: {
      flex: 1,
    },
    behaviorTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    behaviorSub: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 1,
    },
  });
}

export default FloatingMicScreen;
