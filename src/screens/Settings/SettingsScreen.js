import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { AppHeader } from '../../components/Header/AppHeader';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { AppCard } from '../../components/common/AppCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { StatusBadge } from '../../components/common/StatusBadge';
import PermissionModal from '../../components/PermissionModal';
import { usePermissionsManager } from '../../hooks/usePermissionsManager';
import { useAndroidPermissions } from '../../hooks/useAndroidPermissions';
import { useAlert } from '../../context/AlertContext';
import { Colors } from '../../theme/Colors';

const SettingsScreen = () => {
  const showAlert = useAlert();

  // ── Standard permissions (Microphone, Phone Call, SMS) ────────────────────
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
    } catch {}
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
        <Text style={styles.sectionLabel}>MICROPHONE & COMMUNICATION</Text>

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
});

export default SettingsScreen;
