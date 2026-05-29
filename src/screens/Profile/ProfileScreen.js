import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Linking, AppState } from 'react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { getUserPlan, getUserUsage, updateTokensOnly } from '../../services/typeEasyUsageApi';

function formatINR(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `₹${v.toFixed(3)}`;
}

function clamp01(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const showAlert = useAlert();

  const userId = user?.userId;
  const token = user?.token;

  const headerName = useMemo(() => {
    return (user?.name || user?.displayName || user?.email || 'User').trim();
  }, [user?.name, user?.displayName, user?.email]);

  const headerEmail = useMemo(() => {
    const e = plan?.email || user?.email;
    return (e || '—').trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [usage, setUsage] = useState(null);
  const [tokensDraft, setTokensDraft] = useState('');
  const [updatingTokens, setUpdatingTokens] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [p, u] = await Promise.all([
      getUserPlan({ userId, token }),
      getUserUsage({ userId, token }),
    ]);
    if (p.success) setPlan(p.data);
    if (u.success) setUsage(u.data);
    setLoading(false);
  }, [userId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // When user comes back from browser/payment, refresh plan+usage automatically.
    let prevState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
        load();
      }
      prevState = nextState;
    });
    return () => sub.remove();
  }, [load]);

  const onUpdateTokens = async () => {
    if (!userId) {
      showAlert('Profile', 'Missing user id. Please login again.');
      return;
    }
    setUpdatingTokens(true);
    const r = await updateTokensOnly({ userId, token, tokensUsed: tokensDraft });
    setUpdatingTokens(false);
    if (!r.success) {
      showAlert('Update tokens', r.error || 'Could not update tokens');
      return;
    }
    showAlert('Updated', r.data?.message || 'Tokens updated');
    setTokensDraft('');
    load();
  };

  const planName = plan?.plan || '—';
  const planExpiresAt = plan?.planExpiresAt || plan?.plan_expires_at || null;
  const weeklyTokens = plan?.weeklyTokens ?? plan?.weekly_tokens ?? usage?.weeklyTokens;
  const weeklyLimit = plan?.weeklyLimit ?? plan?.weekly_limit ?? usage?.weeklyLimit;
  const tokensUsed = usage?.tokens_used ?? plan?.tokensUsed ?? plan?.tokens_used;
  const cost = usage?.cost ?? plan?.cost;
  const active =
    plan?.is_active != null ? !!plan?.is_active : plan?.isActive != null ? !!plan?.isActive : null;
  const weeklyProgress =
    weeklyTokens != null && weeklyLimit != null && Number(weeklyLimit) > 0
      ? clamp01(Number(weeklyTokens) / Number(weeklyLimit))
      : 0;

  const onRenewPress = useCallback(async () => {
    const url = 'https://typeeasy.kambaa.ai/pricing/';
    try {
      await Linking.openURL(url);
    } catch (_e) {
      showAlert('Renewal', 'Could not open the pricing page.');
    }
  }, [showAlert]);

  return (
    <ScreenContainer>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{headerName}</Text>
          <Text style={styles.heroSub}>{headerEmail}</Text>
        </View>

        <AppCard>
          <View style={styles.planTop}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planTitle}>Plan</Text>
              <View style={styles.badges}>
                <View style={[styles.badge, styles.badgePrimary]}>
                  <Text style={styles.badgeTextPrimary}>{planName}</Text>
                </View>
                {active != null ? (
                  <View style={[styles.badge, active ? styles.badgeOk : styles.badgeMuted]}>
                    <Text style={[styles.badgeText, active ? styles.badgeTextOk : styles.badgeTextMuted]}>
                      {active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={styles.planSub}>
              {loading ? 'Loading plan…' : 'Your current subscription & usage'}
            </Text>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Tokens used</Text>
              <Text style={styles.kpiValue}>{tokensUsed ?? '—'}</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Cost</Text>
              <Text style={styles.kpiValue}>{formatINR(cost)}</Text>
            </View>
          </View>

          <View style={styles.progressWrap}>
            <View style={styles.progressTopRow}>
              <Text style={styles.progressLabel}>Weekly usage</Text>
              <Text style={styles.progressValue}>
                {weeklyTokens != null && weeklyLimit != null ? `${weeklyTokens}/${weeklyLimit}` : '—'}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(weeklyProgress * 100)}%` }]} />
            </View>
          </View>

          <View style={styles.miniRows}>
            <View style={styles.miniRow}>
              <Text style={styles.miniLabel}>User ID</Text>
              <Text style={styles.miniValue}>{userId ? String(userId) : '—'}</Text>
            </View>
            {planExpiresAt ? (
              <View style={styles.miniRow}>
                <Text style={styles.miniLabel}>Expires</Text>
                <Text style={styles.miniValue} numberOfLines={1}>
                  {String(planExpiresAt)}
                </Text>
              </View>
            ) : null}
            {plan?.planChangedAt ? (
              <View style={styles.miniRow}>
                <Text style={styles.miniLabel}>Changed</Text>
                <Text style={styles.miniValue} numberOfLines={1}>
                  {String(plan.planChangedAt)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.renewRow}>
            <PrimaryButton
              title="Renew / Upgrade plan"
              onPress={onRenewPress}
              variant="outline"
              disabled={loading}
            />
          </View>
        </AppCard>

        <AppCard>
          <Text style={styles.sectionTitle}>Update tokens</Text>
          <Text style={styles.sectionSub}>
            Adds tokens to your usage using the TypeEasy endpoint.
          </Text>
          <TextInput
            value={tokensDraft}
            onChangeText={setTokensDraft}
            placeholder="Enter tokens (e.g. 50)"
            placeholderTextColor={colors.text.light}
            keyboardType="numeric"
            style={styles.input}
          />
          <PrimaryButton
            title={updatingTokens ? 'Updating…' : 'Update tokens'}
            onPress={onUpdateTokens}
            loading={updatingTokens}
            disabled={loading}
            style={styles.btn}
          />
          <PrimaryButton
            title={loading ? 'Refreshing…' : 'Refresh'}
            onPress={load}
            variant="outline"
            disabled={loading}
          />
        </AppCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 12,
  },
  hero: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.6,
  },
  heroSub: {
    marginTop: 6,
    fontSize: 13,
    color: colors.text.secondary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 10,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  planTop: {
    marginBottom: 12,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  planSub: {
    marginTop: 6,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  renewRow: {
    marginTop: 12,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgePrimary: {
    backgroundColor: 'rgba(30, 136, 255, 0.10)',
    borderColor: 'rgba(30, 136, 255, 0.25)',
  },
  badgeTextPrimary: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  badgeOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
    borderColor: 'rgba(16, 185, 129, 0.22)',
  },
  badgeMuted: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.borderLight,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 12,
  },
  badgeTextOk: {
    color: '#10B981',
  },
  badgeTextMuted: {
    color: colors.text.secondary,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  kpi: {
    flex: 1,
  },
  kpiDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.borderLight,
    marginHorizontal: 10,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  progressWrap: {
    marginBottom: 12,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  miniRows: {
    gap: 8,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  miniLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    flex: 1,
  },
  miniValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    maxWidth: '60%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  rowLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    flex: 1,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  input: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    marginBottom: 12,
  },
  btn: {
    marginBottom: 10,
  },
  });
}

