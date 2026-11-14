import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Linking,
  AppState,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  Check,
  Award,
  TrendingUp,
  Clock,
  Zap,
  Coins,
  Info,
  PlusCircle,
  RotateCw,
  CreditCard,
  Shield,
  Activity,
  Languages,
  LogOut,
  ChevronRight,
  User,
} from 'lucide-react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { getUserPlan, getUserUsage, updateTokensOnly } from '../../services/typeEasyUsageApi';

function formatINR(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0.000';
  return `₹${v.toFixed(3)}`;
}

function clamp01(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

const QUICK_AMOUNTS = [50, 100, 500, 1000];

export default function ProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const isDark = colors.background !== '#F8FAFC';
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { user, logout } = useAuth();
  const showAlert = useAlert();

  const userId = user?.userId;
  const token = user?.token;

  const headerName = useMemo(() => {
    return (user?.name || user?.displayName || user?.username || 'User').trim();
  }, [user?.name, user?.displayName, user?.username]);

  const headerEmail = useMemo(() => {
    return (user?.email || 'No email registered').trim();
  }, [user?.email]);

  const userInitials = useMemo(() => {
    const parts = headerName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return headerName.slice(0, 2).toUpperCase() || 'U';
  }, [headerName]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState(null);
  const [usage, setUsage] = useState(null);
  const [tokensDraft, setTokensDraft] = useState('50');
  const [updatingTokens, setUpdatingTokens] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    setLoading(true);
    try {
      const [p, u] = await Promise.all([
        getUserPlan({ userId, token }),
        getUserUsage({ userId, token }),
      ]);
      if (p.success) setPlan(p.data);
      if (u.success) setUsage(u.data);
    } catch (_err) {
      // Fallbacks will keep UI intact
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
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
    const amount = Number(tokensDraft);
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid positive token number.');
      return;
    }
    setUpdatingTokens(true);
    const r = await updateTokensOnly({ userId, token, tokensUsed: tokensDraft });
    setUpdatingTokens(false);
    if (!r.success) {
      showAlert('Update tokens', r.error || 'Could not update tokens');
      return;
    }
    showAlert('Updated', r.data?.message || 'Tokens updated successfully');
    load();
  };

  const planName = plan?.plan || 'Free';
  const tokensUsedNum = Number(usage?.tokens_used ?? plan?.tokensUsed ?? plan?.tokens_used ?? 0);
  const costNum = usage?.cost ?? plan?.cost ?? 0;
  const weeklyTokensNum = Number(plan?.weeklyTokens ?? plan?.weekly_tokens ?? usage?.weeklyTokens ?? 0);
  const weeklyLimitNum = Number(plan?.weeklyLimit ?? plan?.weekly_limit ?? usage?.weeklyLimit ?? 0);
  const weeklyProgress = weeklyLimitNum > 0 ? clamp01(weeklyTokensNum / weeklyLimitNum) : 0;

  const onRenewPress = useCallback(async () => {
    const url = 'https://typeeasy.kambaa.ai/pricing/';
    try {
      await Linking.openURL(url);
    } catch (_e) {
      showAlert('Renewal', 'Could not open the pricing page.');
    }
  }, [showAlert]);

  const onLogoutPress = () => {
    showAlert(
      'Log out',
      'Are you sure you want to log out and clear this active device session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (_e) {
              showAlert('Logout', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <AppHeader
        title="Profile"
        showHomeBrand
        brandIcon={<User size={14} color={colors.primary} strokeWidth={2.4} />}
        forceMenu
        rightComponent={
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => {}}
            accessibilityLabel="Profile"
          >
            <User size={18} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Subheader bar commented out to avoid duplicate Profile title */}
        {/*
        <View style={styles.subHeaderRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation?.goBack?.() || navigation?.navigate?.('Home')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.subHeaderTitle}>Profile</Text>
          <View style={styles.subHeaderRightActions}>
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() => showAlert('Edit Profile', 'Profile editing will be available in the next release.')}
              accessibilityLabel="Edit profile"
            >
              <Pencil size={18} color={colors.text.primary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() => navigation?.navigate?.('Settings')}
              accessibilityLabel="Settings"
            >
              <Settings size={18} color={colors.text.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
        */}

        {/* User Identity Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{userInitials}</Text>
            </View>
            <View style={styles.avatarBadge}>
              <Check size={12} color="#FFFFFF" strokeWidth={3} />
            </View>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName} numberOfLines={1}>{headerName}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{headerEmail}</Text>
            <View style={styles.userMetaRow}>
              <View style={styles.userMetaDot} />
              <Text style={styles.userMetaText}>{`${planName} Tier Member`}</Text>
            </View>
          </View>
        </View>

        {/* Plan & Usage Card */}
        <View style={styles.card}>
          <View style={styles.planHeaderRow}>
            <View style={styles.planHeaderLeft}>
              <Award size={20} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.planTitle}>Plan</Text>
            </View>
            <View style={styles.planBadges}>
              <View style={styles.badgeFree}>
                <Text style={styles.badgeFreeText}>{planName.toUpperCase()}</Text>
              </View>
              <View style={styles.badgeActive}>
                <Text style={styles.badgeActiveText}>• Active</Text>
              </View>
            </View>
          </View>

          {/* Tokens & Cost Accrued Box */}
          <View style={styles.statsBox}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Tokens used</Text>
              <Text style={styles.statValue}>{tokensUsedNum.toLocaleString()}</Text>
              <View style={styles.usageIndicatorRow}>
                <TrendingUp size={13} color="#10B981" strokeWidth={2.4} />
                <Text style={styles.usageOkText}>Normal usage</Text>
              </View>
            </View>
            <View style={styles.statColDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Cost accrued</Text>
              <Text style={styles.statValue}>{formatINR(costNum)}</Text>
              <Text style={styles.statSubText}>Standard rate</Text>
            </View>
          </View>

          {/* Weekly Allowance Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressTopRow}>
              <View style={styles.allowanceLabelRow}>
                <Coins size={14} color={colors.text.secondary} strokeWidth={2} />
                <Text style={styles.progressLabel}>Weekly allowance</Text>
              </View>
              <Text style={styles.progressValue}>
                {weeklyLimitNum > 0
                  ? `${weeklyTokensNum.toLocaleString()} / ${weeklyLimitNum.toLocaleString()}`
                  : `${weeklyTokensNum.toLocaleString()} tokens`}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(weeklyProgress * 100)}%` },
                ]}
              />
            </View>
            <View style={styles.progressBottomRow}>
              <Text style={styles.userIdText}>
                {userId ? `User ID: #${userId}` : 'User ID: —'}
              </Text>
              <View style={styles.resetsRow}>
                <Clock size={12} color={colors.text.secondary} strokeWidth={2} />
                <Text style={styles.resetsText}>
                  {plan?.resetsIn ? `Resets in ${plan.resetsIn}` : 'Weekly cycle'}
                </Text>
              </View>
            </View>
          </View>

          {/* Renew / Upgrade Plan Button */}
          <TouchableOpacity
            style={styles.renewPlanBtn}
            onPress={onRenewPress}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Zap size={18} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
            <Text style={styles.renewPlanBtnText}>Renew / Upgrade plan</Text>
          </TouchableOpacity>
        </View>

        {/* Update Tokens Card */}
        <View style={styles.card}>
          <View style={styles.updateHeaderRow}>
            <View style={styles.updateHeaderLeft}>
              <View style={styles.updateIconCircle}>
                <Coins size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.cardTitle}>Update tokens</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                showAlert(
                  'Tokens Info',
                  'Tokens are consumed by speech-to-text processing and AI prompt generations.'
                )
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Info size={19} color={colors.text.secondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Text style={styles.updateDesc}>
            Add tokens to keep real-time transcription and generative AI voice models actively listening.
          </Text>

          {/* Input field */}
          <View style={styles.inputContainer}>
            <PlusCircle size={20} color={colors.text.secondary} strokeWidth={2} />
            <TextInput
              value={tokensDraft}
              onChangeText={setTokensDraft}
              placeholder="50"
              placeholderTextColor={colors.text.light}
              keyboardType="numeric"
              style={styles.tokenInput}
            />
            <View style={styles.tokenTag}>
              <Text style={styles.tokenTagText}>TKNS</Text>
            </View>
          </View>

          {/* Quick amount chips */}
          <View style={styles.quickChipsRow}>
            {QUICK_AMOUNTS.map((amt) => {
              const label = `+${amt.toLocaleString()}`;
              const isSelected = tokensDraft === String(amt);
              return (
                <TouchableOpacity
                  key={amt}
                  style={[styles.quickChip, isSelected && styles.quickChipSelected]}
                  onPress={() => setTokensDraft(String(amt))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickChipText, isSelected && styles.quickChipTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={onUpdateTokens}
            activeOpacity={0.8}
            disabled={updatingTokens || loading}
          >
            <CreditCard size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.primaryActionBtnText}>
              {updatingTokens ? 'Updating tokens…' : 'Update tokens'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={load}
            activeOpacity={0.8}
            disabled={loading}
          >
            <RotateCw size={17} color={colors.primary} strokeWidth={2.2} />
            <Text style={styles.secondaryActionBtnText}>
              {loading ? 'Refreshing…' : 'Refresh balance'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preferences & Privacy Section */}
        <View style={styles.prefSection}>
          <Text style={styles.sectionHeaderTitle}>PREFERENCES & PRIVACY</Text>
          <View style={styles.prefCard}>
            <TouchableOpacity
              style={styles.prefItemRow}
              onPress={() =>
                showAlert(
                  'Account Security',
                  'Two-factor authentication and biometric protection are active.'
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.prefIconCircle}>
                <Shield size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.prefDetails}>
                <Text style={styles.prefTitle}>Account Security</Text>
                <Text style={styles.prefSub}>2-factor authentication & password</Text>
              </View>
              <ChevronRight size={17} color={colors.text.light} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.prefItemRow}
              onPress={() =>
                showAlert(
                  'Voice Data Privacy',
                  'All speech recordings are stored locally and encrypted on-device.'
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.prefIconCircle}>
                <Activity size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.prefDetails}>
                <Text style={styles.prefTitle}>Voice Data Privacy</Text>
                <Text style={styles.prefSub}>Local audio cache & ML retention</Text>
              </View>
              <ChevronRight size={17} color={colors.text.light} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.prefItemRow}
              onPress={() => {
                if (navigation?.navigate) {
                  navigation.navigate('Translator');
                } else {
                  showAlert('Language Preferences', 'Default dictation language is English (India).');
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.prefIconCircle}>
                <Languages size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.prefDetails}>
                <Text style={styles.prefTitle}>Language Preferences</Text>
                <Text style={styles.prefSub}>English (India) • Auto-detect enabled</Text>
              </View>
              <ChevronRight size={17} color={colors.text.light} strokeWidth={2.2} />
            </TouchableOpacity>

            <View style={styles.prefDivider} />

            <TouchableOpacity
              style={styles.prefItemRow}
              onPress={onLogoutPress}
              activeOpacity={0.7}
            >
              <View style={styles.logoutIconCircle}>
                <LogOut size={18} color="#EF4444" strokeWidth={2.2} />
              </View>
              <View style={styles.prefDetails}>
                <Text style={styles.logoutTitle}>Log out</Text>
                <Text style={styles.prefSub}>Clear active device session</Text>
              </View>
              <ChevronRight size={17} color="#EF4444" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
    },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
      paddingTop: 2,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderTitle: {
      flex: 1,
      marginLeft: 12,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
    },
    subHeaderRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconCircleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileAvatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
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
    avatarWrap: {
      position: 'relative',
      marginRight: 14,
    },
    avatarCircle: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: -0.4,
    },
    avatarBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.card,
    },
    userDetails: {
      flex: 1,
      justifyContent: 'center',
    },
    userName: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    userEmail: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    userMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },
    userMetaDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#10B981',
      marginRight: 6,
    },
    userMetaText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
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
    planHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    planHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    planTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    planBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badgeFree: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.3)' : '#DBEAFE',
    },
    badgeFreeText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.3,
    },
    badgeActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BFDBFE',
    },
    badgeActiveText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#10B981',
    },
    statsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
    },
    statCol: {
      flex: 1,
    },
    statColDivider: {
      width: 1,
      height: 38,
      backgroundColor: colors.borderLight,
      marginHorizontal: 12,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text.primary,
      marginTop: 3,
      letterSpacing: -0.3,
    },
    usageIndicatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
    },
    usageOkText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    statSubText: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 3,
    },
    progressSection: {
      marginBottom: 14,
    },
    progressTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    allowanceLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    progressValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    progressBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    userIdText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    resetsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    resetsText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    renewPlanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.16)' : '#EFF6FF',
      borderRadius: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.28)' : '#DBEAFE',
    },
    renewPlanBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.primary,
    },
    updateHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    updateHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    updateIconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    updateDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
      paddingHorizontal: 12,
      height: 48,
      marginBottom: 10,
    },
    tokenInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
      paddingVertical: 0,
    },
    tokenTag: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tokenTagText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 0.5,
    },
    quickChipsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    quickChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    },
    quickChipSelected: {
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.22)' : '#EFF6FF',
      borderColor: colors.primary,
    },
    quickChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    quickChipTextSelected: {
      color: colors.primary,
      fontWeight: '800',
    },
    primaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      marginBottom: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
    primaryActionBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    secondaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.12)' : '#EFF6FF',
      borderRadius: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 229, 146, 0.25)' : '#DBEAFE',
    },
    secondaryActionBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.primary,
    },
    prefSection: {
      marginTop: 2,
    },
    sectionHeaderTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
      letterSpacing: 0.8,
      marginBottom: 10,
      marginLeft: 4,
    },
    prefCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
    prefItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    prefIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(0, 229, 146, 0.18)' : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    prefDetails: {
      flex: 1,
    },
    prefTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    prefSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    prefDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderLight,
      marginVertical: 4,
    },
    logoutIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEF2F2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    logoutTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#EF4444',
    },
    bottomSpacer: {
      height: 28,
    },
  });
}
