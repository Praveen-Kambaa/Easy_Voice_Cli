import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Mic, Circle } from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import { TIME_LABELS, USER } from '../../constants';
import VoiceRecorderScreen from '../VoiceRecorder/VoiceRecorderScreen';
import { useAuth } from '../../context/AuthContext';

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createHomeStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const voiceCommandRef = useRef(null);
  const [homeRecording, setHomeRecording] = useState(false);
  const [homeElapsedMs, setHomeElapsedMs] = useState(0);
  const homeTimerRef = useRef(null);
  const homeStartRef = useRef(null);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshing(false);
  };

  const stopHomeTimer = useCallback(() => {
    if (homeTimerRef.current) clearInterval(homeTimerRef.current);
    homeTimerRef.current = null;
    homeStartRef.current = null;
    setHomeElapsedMs(0);
  }, []);

  useEffect(() => {
    return () => {
      stopHomeTimer();
    };
  }, [stopHomeTimer]);

  const displayName =
    (user?.name || user?.displayName || user?.username || user?.email || '').trim() || USER.DEFAULT_NAME;
  const greeting = `${TIME_LABELS.getGreeting()}, ${displayName}`;

  const name = greeting.split(',').slice(1).join(',').trim() || USER.DEFAULT_NAME;
  const greetingPrefix = greeting.replace(new RegExp(`,\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ',').trim();

  return (
    <ScreenContainer>
      <AppHeader title="Home" forceMenu />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Modern greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingTitle}>
            {greetingPrefix}{' '}
            <Text style={styles.greetingTitleAccent}>{name}</Text>
          </Text>
          <Text style={styles.greetingSub}>
            Your voice assistant is primed and ready for your requests.
          </Text>
        </View>

        {/* Primary Voice card (keeps voice command on Home) */}
        <View style={styles.primaryCard}>
          <View style={styles.voiceTopRow}>
            <View style={styles.voiceTopLeft}>
              <Text style={styles.primaryCardKicker}>VOICE COMMAND</Text>
              <Text style={styles.primaryCardTitle}>Neural Engine Active</Text>
              <Text style={styles.primaryCardSub}>Tap to start recording, then stop & send.</Text>
            </View>
            <TouchableOpacity
              style={styles.micOrb}
            onPress={async () => {
              if (homeRecording) return;
              const ok = await voiceCommandRef.current?.startRecording?.();
              if (ok) {
                setHomeRecording(true);
                homeStartRef.current = Date.now();
                homeTimerRef.current = setInterval(() => {
                  if (!homeStartRef.current) return;
                  setHomeElapsedMs(Date.now() - homeStartRef.current);
                }, 200);
              }
            }}
              activeOpacity={0.9}
            >
              <Mic size={22} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {!homeRecording ? (
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={async () => {
                const ok = await voiceCommandRef.current?.startRecording?.();
                if (ok) {
                  setHomeRecording(true);
                  homeStartRef.current = Date.now();
                  homeTimerRef.current = setInterval(() => {
                    if (!homeStartRef.current) return;
                    setHomeElapsedMs(Date.now() - homeStartRef.current);
                  }, 200);
                }
              }}
              activeOpacity={0.9}
            >
              <View style={styles.ctaIconBadge}>
                <Circle size={16} color="#FFFFFF" strokeWidth={2.8} />
              </View>
              <Text style={styles.ctaBtnText}>Start Voice Command</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.timerPill}>
              <Text style={styles.timerText}>
                {Math.floor(homeElapsedMs / 60000)}:
                {String(Math.floor((homeElapsedMs % 60000) / 1000)).padStart(2, '0')}
              </Text>
            </View>
          )}

          {homeRecording ? (
            <TouchableOpacity
              style={styles.stopBtnHome}
              onPress={async () => {
                setHomeRecording(false);
                stopHomeTimer();
                await voiceCommandRef.current?.stopRecording?.();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.stopBtnHomeText}>Stop</Text>
            </TouchableOpacity>
          ) : null}

          <VoiceRecorderScreen ref={voiceCommandRef} navigation={navigation} embedded homeEmbedded />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

function createHomeStyles(colors) {
  return StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: 'stretch',
    gap: 14,
  },

  greetingBlock: {
    paddingTop: 6,
  },
  greetingTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  greetingTitleAccent: {
    color: colors.primary,
  },
  greetingSub: {
    marginTop: 8,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },

  primaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  voiceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 14,
  },
  voiceTopLeft: {
    flex: 1,
  },
  primaryCardKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.2,
  },
  primaryCardTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  primaryCardSub: {
    marginTop: 6,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  micOrb: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  timerPill: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  stopBtnHome: {
    marginTop: 10,
    backgroundColor: colors.status.blocked,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnHomeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  });
}

export default HomeScreen;
