import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { useAndroidPermissions } from '../hooks/useAndroidPermissions';
import PermissionModal from '../components/PermissionModal';
import { AppHeader } from '../components/Header/AppHeader';
import { ScreenContainer } from '../components/ScreenContainer';

/**
 * Example Screen demonstrating Android overlay and accessibility permissions
 * Shows clean architecture and modular code structure
 */
const AndroidPermissionsScreen = () => {
  const {
    permissionStates,
    loading,
    modalVisible,
    errors,
    checkPermission,
    checkAllPermissions,
    requestPermission,
    handleModalConfirm,
    handleModalCancel,
    isPermissionSupported,
    isPermissionGranted,
    isPermissionLoading,
    getPermissionStatusText,
    getPermissionStatusColor,
    getPermissionError,
    clearPermissionError,
    PERMISSION_NAMES,
  } = useAndroidPermissions();

  /**
   * Handle permission request with error handling
   */
  const handleRequestPermission = async (permissionType) => {
    try {
      // Check if permission is supported
      if (!isPermissionSupported(permissionType)) {
        Alert.alert(
          'Not Supported',
          `${permissionType} permission is not supported on this device.`
        );
        return;
      }

      // Clear any existing errors
      clearPermissionError(permissionType);

      // Request permission (this will show the modal)
      await requestPermission(permissionType);
    } catch (error) {
      console.error(`Error requesting ${permissionType}:`, error);
      Alert.alert(
        'Error',
        `Failed to request ${permissionType} permission. Please try again.`
      );
    }
  };

  /**
   * Handle manual permission check
   */
  const handleCheckPermission = async (permissionType) => {
    try {
      await checkPermission(permissionType);
    } catch (error) {
      console.error(`Error checking ${permissionType}:`, error);
    }
  };

  /**
   * Get button style based on permission state
   */
  const getButtonStyle = (permissionType) => {
    const isGranted = isPermissionGranted(permissionType);
    const isLoading = isPermissionLoading(permissionType);
    const hasError = getPermissionError(permissionType);

    if (isLoading) {
      return [styles.button, styles.loadingButton];
    }
    
    if (hasError) {
      return [styles.button, styles.errorButton];
    }
    
    if (isGranted) {
      return [styles.button, styles.grantedButton];
    }
    
    return [styles.button, styles.requestButton];
  };

  /**
   * Get button text based on permission state
   */
  const getButtonText = (permissionType) => {
    const isGranted = isPermissionGranted(permissionType);
    const isLoading = isPermissionLoading(permissionType);
    const hasError = getPermissionError(permissionType);

    if (isLoading) {
      return 'Checking...';
    }
    
    if (hasError) {
      return 'Retry';
    }
    
    if (isGranted) {
      return 'Granted';
    }
    
    return 'Request Permission';
  };

  /**
   * Render permission card
   */
  const renderPermissionCard = (permissionType) => {
    const isGranted = isPermissionGranted(permissionType);
    const isLoading = isPermissionLoading(permissionType);
    const hasError = getPermissionError(permissionType);
    const statusText = getPermissionStatusText(permissionType);
    const statusColor = getPermissionStatusColor(permissionType);
    const isSupported = isPermissionSupported(permissionType);

    return (
      <View key={permissionType} style={styles.permissionCard}>
        {/* Permission Header */}
        <View style={styles.permissionHeader}>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>{permissionType}</Text>
            <Text style={styles.permissionDescription}>
              {permissionType === PERMISSION_NAMES.OVERLAY
                ? 'Display content over other apps'
                : 'Accessibility service for enhanced functionality'}
            </Text>
          </View>
          
          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Error Display */}
        {hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error: {hasError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => handleCheckPermission(permissionType)}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Support Status */}
        {!isSupported && (
          <View style={styles.unsupportedContainer}>
            <Text style={styles.unsupportedText}>
              Not supported on this device
            </Text>
          </View>
        )}

        {/* Permission Actions */}
        <View style={styles.permissionActions}>
          <TouchableOpacity
            style={getButtonStyle(permissionType)}
            onPress={() => handleRequestPermission(permissionType)}
            disabled={isLoading || !isSupported}
          >
            <Text style={styles.buttonText}>
              {getButtonText(permissionType)}
            </Text>
          </TouchableOpacity>
          
          {/* Manual Check Button */}
          <TouchableOpacity
            style={[styles.checkButton, isLoading && styles.disabledButton]}
            onPress={() => handleCheckPermission(permissionType)}
            disabled={isLoading}
          >
            <Text style={styles.checkButtonText}>Check</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <AppHeader title="Android Permissions" />
      
      {/* Platform Warning */}
      {Platform.OS !== 'android' && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            This screen is designed for Android devices. Some features may not work on other platforms.
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.refreshButton, loading[PERMISSION_NAMES.OVERLAY] || loading[PERMISSION_NAMES.ACCESSIBILITY]]}
          onPress={checkAllPermissions}
          disabled={loading[PERMISSION_NAMES.OVERLAY] || loading[PERMISSION_NAMES.ACCESSIBILITY]}
        >
          <Text style={styles.refreshButtonText}>
            {loading[PERMISSION_NAMES.OVERLAY] || loading[PERMISSION_NAMES.ACCESSIBILITY]
              ? 'Refreshing...'
              : 'Refresh All Permissions'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Permissions List */}
      <ScrollView style={styles.permissionsContainer} showsVerticalScrollIndicator={false}>
        {Object.values(PERMISSION_NAMES).map(renderPermissionCard)}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Note: After enabling permissions in settings, return to this app to see the updated status.
        </Text>
      </View>

      {/* Permission Modals */}
      {Object.values(PERMISSION_NAMES).map(permissionType => (
        <PermissionModal
          key={permissionType}
          visible={modalVisible[permissionType]}
          permissionType={permissionType}
          onConfirm={() => handleModalConfirm(permissionType)}
          onCancel={() => handleModalCancel(permissionType)}
          loading={loading[permissionType]}
        />
      ))}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 22,
  },
  warningContainer: {
    backgroundColor: '#FFF3CD',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  actionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: '#3498DB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  permissionInfo: {
    flex: 1,
    marginRight: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#D32F2F',
    marginRight: 12,
  },
  retryButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  unsupportedContainer: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  unsupportedText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  permissionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  requestButton: {
    backgroundColor: '#3498DB',
  },
  grantedButton: {
    backgroundColor: '#4CAF50',
  },
  errorButton: {
    backgroundColor: '#F44336',
  },
  loadingButton: {
    backgroundColor: '#BDC3C7',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  checkButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DEE2E6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  disabledButton: {
    backgroundColor: '#F8F9FA',
    borderColor: '#E9ECEF',
  },
  checkButtonText: {
    color: '#495057',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AndroidPermissionsScreen;
