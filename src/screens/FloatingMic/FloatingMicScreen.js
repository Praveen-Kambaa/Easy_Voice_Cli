import logger from '../../utils/logger';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  NativeModules,
  DeviceEventEmitter,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { History, ChevronRight, ShieldCheck, Radio, SlidersHorizontal } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useFloatingMic } from '../../hooks/useFloatingMic';
import { useTheme } from '../../context/ThemeContext';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';

const { FloatingMicModule } = NativeModules;

const FloatingMicScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lastTranscription, setLastTranscription] = useState('');
  const orbAnim = React.useRef(new Animated.Value(0)).current;

  const {
    isServiceActive,
    permissions,
    recordingState,
    toggleFloatingMic,
    checkPermissions,
    refreshFloatingMicSnapshot,
    handleMissingPermissions,
    needsPermissions,
  } = useFloatingMic();

  useFocusEffect(
    useCallback(() => {
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          refreshFloatingMicSnapshot();
          if (!isGlobalAlertModalVisible()) {
            setLastTranscription('');
          }
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2 != null) {
          cancelAnimationFrame(raf2);
        }
      };
    }, [refreshFloatingMicSnapshot]),
  );

  useEffect(() => {
    const listeners = [
      DeviceEventEmitter.addListener('FloatingMic_onAudioRecorded', (audioPath) => {
        logger.debug('Audio recorded:', audioPath);
      }),
      DeviceEventEmitter.addListener('FloatingMicService_onTranscriptionComplete', (text) => {
        setLastTranscription(typeof text === 'string' ? text : String(text ?? ''));
      }),
    ];
    return () => listeners.forEach(l => l.remove());
  }, []);

  useEffect(() => {
    if (!isServiceActive) {
      orbAnim.stopAnimation();
      orbAnim.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(orbAnim, { toValue: 0, duration: 1400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isServiceActive, orbAnim]);

  const permissionRows = [
    { label: 'Overlay Permission', value: permissions.overlay },
    { label: 'Record Audio', value: permissions.recordAudio },
    { label: 'Accessibility Service', value: permissions.accessibility, labels: ['Enabled', 'Disabled'] },
    { label: 'All Permissions', value: permissions.allGranted, labels: ['Ready', 'Setup Required'] },
  ];

  const headlineStatus = needsPermissions
    ? 'Complete setup to enable the floating mic overlay.'
    : isServiceActive
      ? 'Running in the background. Tap the floating icon to record.'
      : 'Start the service to show the floating mic overlay.';

  return (
    <ScreenContainer>
      <AppHeader title="Floating Mic" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero (signature) */}
        <View style={styles.hero}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlowA} pointerEvents="none" />
            <View style={styles.heroGlowB} pointerEvents="none" />

            <View style={styles.heroTop}>
              <View style={styles.heroTitleCol}>
                <Text style={styles.heroTitle}>Floating Mic</Text>
                <Text style={styles.heroSub}>{headlineStatus}</Text>
              </View>

              <TouchableOpacity
                style={[styles.orbWrap, needsPermissions && styles.orbWrapDisabled]}
                activeOpacity={0.9}
                onPress={() => {
                  if (needsPermissions) {
                    handleMissingPermissions();
                    return;
                  }
                  toggleFloatingMic();
                }}
              >
                <Animated.View
                  style={[
                    styles.orbPulse,
                    {
                      opacity: orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] }),
                      transform: [{ scale: orbAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
                    },
                  ]}
                />
                <View style={[styles.orb, isServiceActive && styles.orbActive]}>
                  <Radio size={18} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.heroMetaRow}>
              <StatusBadge
                status={needsPermissions ? 'blocked' : isServiceActive ? 'granted' : 'denied'}
                label={needsPermissions ? 'Setup required' : isServiceActive ? 'Active' : 'Inactive'}
              />
              <Text style={styles.heroMetaText}>
                {lastTranscription ? `Last heard: ${lastTranscription}` : 'Last heard: —'}
              </Text>
            </View>
          </View>
        </View>

        {/* Permission Status */}
        {/* <AppCard>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleLeft}>
              <ShieldCheck size={18} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.sectionTitle}>Permissions</Text>
            </View>
            <StatusBadge
              status={permissions.allGranted ? 'granted' : 'blocked'}
              label={permissions.allGranted ? 'Ready' : 'Setup'}
            />
          </View>

          {permissionRows.map((row, idx) => (
            <View
              key={`perm-${row.label}`}
              style={[styles.infoRow, idx < permissionRows.length - 1 && styles.rowDivider]}
            >
              <Text style={styles.rowLabel}>{row.label}</Text>
              <StatusBadge
                status={row.value ? 'granted' : 'blocked'}
                label={row.value ? (row.labels?.[0] ?? 'Granted') : (row.labels?.[1] ?? 'Denied')}
              />
            </View>
          ))}
        </AppCard> */}

        {/* Service Status */}
        {/* <AppCard>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleLeft}>
              <Radio size={18} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.sectionTitle}>Status</Text>
            </View>
          </View>

          <View style={[styles.infoRow, styles.rowDivider]}>
            <Text style={styles.rowLabel}>Floating Mic Service</Text>
            <StatusBadge status={isServiceActive ? 'granted' : 'denied'} label={isServiceActive ? 'Active' : 'Inactive'} />
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Recording State</Text>
            <StatusBadge
              status={
                recordingState.state === 'RECORDING' ? 'blocked' :
                recordingState.state === 'PAUSED' ? 'denied' : 'granted'
              }
              label={
                recordingState.state === 'RECORDING' ? 'Recording' :
                recordingState.state === 'PAUSED' ? 'Paused' :
                recordingState.state === 'STOPPED' ? 'Stopped' : 'Idle'
              }
            />
          </View>

          {recordingState.lastResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Last Result</Text>
              <Text style={styles.resultText}>{recordingState.lastResult}</Text>
            </View>
          ) : null}

          {recordingState.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Error</Text>
              <Text style={styles.errorText}>{recordingState.error}</Text>
            </View>
          ) : null}

          {lastTranscription ? (
            <View style={styles.transcriptionBox}>
              <Text style={styles.transcriptionLabel}>Last Transcription</Text>
              <Text style={styles.transcriptionText}>{lastTranscription}</Text>
            </View>
          ) : null}
        </AppCard> */}

        <TouchableOpacity
          style={styles.historyRow}
          onPress={() => navigation.navigate('FloatingMicHistory')}
          activeOpacity={0.7}
        >
          <History size={20} color={colors.primary} strokeWidth={1.8} />
          <View style={styles.historyRowText}>
            <Text style={styles.historyRowTitle}>Speech history</Text>
            <Text style={styles.historyRowSub}>Transcripts from the floating mic</Text>
          </View>
          <ChevronRight size={18} color={colors.text.light} strokeWidth={2} />
        </TouchableOpacity>

        {/* Controls */}
        {/* <AppCard>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleLeft}>
              <SlidersHorizontal size={18} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.sectionTitle}>Controls</Text>
            </View>
          </View>

          <PrimaryButton
            title={isServiceActive ? 'Stop Floating Mic' : 'Start Floating Mic'}
            onPress={toggleFloatingMic}
            disabled={needsPermissions}
            variant={isServiceActive ? 'danger' : 'primary'}
            style={styles.mainControlBtn}
          />

          <View style={styles.secondaryActionsRow}>
            {needsPermissions ? (
              <View style={styles.secondaryActionCol}>
                <PrimaryButton
                  title="Setup"
                  onPress={handleMissingPermissions}
                  variant="outline"
                  style={styles.secondaryBtn}
                />
              </View>
            ) : null}
            <View style={[styles.secondaryActionCol, !needsPermissions && styles.secondaryActionColFull]}>
              <PrimaryButton
                title="Refresh"
                onPress={checkPermissions}
                variant="ghost"
                style={styles.secondaryBtn}
              />
            </View>
          </View>
        </AppCard> */}

        {/* Instructions */}
        <AppCard>
          <Text style={styles.sectionTitle}>How to Use</Text>
          {[
            'Ensure all permissions are granted (green status)',
            'Tap "Start Floating Mic" to activate the service',
            'A floating microphone icon will appear on your screen',
            'Drag the icon to position it anywhere on screen',
            'Tap the microphone to start/stop voice recording',
            'Speech results will show in the "Last Result" field',
            'The service works even when the app is in the background',
          ].map((text, idx) => (
            <View key={idx} style={styles.instructionRow}>
              <Text style={styles.instructionNumber}>{idx + 1}</Text>
              <Text style={styles.instructionText}>{text}</Text>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </ScreenContainer>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 40,
      gap: 14,
    },

    hero: {
      paddingTop: 6,
      paddingBottom: 4,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.07,
      shadowRadius: 20,
      elevation: 3,
    },
    heroGlowA: {
      position: 'absolute',
      top: -140,
      right: -120,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: 'rgba(30, 136, 255, 0.14)',
    },
    heroGlowB: {
      position: 'absolute',
      bottom: -160,
      left: -150,
      width: 320,
      height: 320,
      borderRadius: 160,
      backgroundColor: 'rgba(96, 165, 250, 0.10)',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroTitleCol: {
      flex: 1,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.7,
      lineHeight: 32,
    },
    heroSub: {
      marginTop: 6,
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 19,
    },
    orbWrap: {
      width: 54,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbWrapDisabled: {
      opacity: 0.6,
    },
    orbPulse: {
      position: 'absolute',
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.primary,
    },
    orb: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.20,
      shadowRadius: 16,
      elevation: 6,
    },
    orbActive: {
      shadowOpacity: 0.28,
      shadowRadius: 20,
      elevation: 8,
    },
    heroMetaRow: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    heroMetaText: {
      flex: 1,
      fontSize: 12,
      color: colors.text.secondary,
    },

    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.06,
      shadowRadius: 18,
      elevation: 3,
    },
    historyRowText: {
      flex: 1,
    },
    historyRowTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    historyRowSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },

    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
      paddingBottom: 10,
    },

    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      flex: 1,
      marginRight: 12,
    },

    resultBox: {
      marginTop: 12,
      padding: 12,
      backgroundColor: colors.status.grantedBg,
      borderRadius: 8,
    },
    resultLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.status.granted,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    resultText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },

    errorBox: {
      marginTop: 12,
      padding: 12,
      backgroundColor: colors.status.blockedBg,
      borderRadius: 8,
    },
    errorLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.status.blocked,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    errorText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },

    transcriptionBox: {
      marginTop: 12,
      padding: 12,
      backgroundColor: colors.backgroundAlt,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    transcriptionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    transcriptionText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },

    mainControlBtn: {
      marginBottom: 10,
    },
    secondaryActionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryActionCol: {
      flex: 1,
    },
    secondaryActionColFull: {
      flex: 1,
    },
    secondaryBtn: {
      minHeight: 46,
    },

    instructionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
      gap: 10,
    },
    instructionNumber: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 22,
      flexShrink: 0,
    },
    instructionText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 20,
      flex: 1,
    },
  });
}



export default FloatingMicScreen;
