import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { usePermissionsManager } from '../hooks/usePermissionsManager';
import { AppHeader } from './Header/AppHeader';
import { ScreenContainer } from './ScreenContainer';

const PermissionDashboard = () => {
  const {
    permissionStatuses,
    loading,
    requestPermission,
    checkAllPermissions,
    openAppSettings,
    getPermissionStatusText,
    isPermissionGranted,
    isPermissionBlocked,
    PERMISSION_NAMES,
  } = usePermissionsManager();

  const handleRequestPermission = async (permissionType) => {
    if (isPermissionBlocked(permissionType)) {
      Alert.alert(
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
      Alert.alert('Success', `${PERMISSION_NAMES[permissionType]} permission granted!`);
    } else if (result === 'denied') {
      Alert.alert('Denied', `${PERMISSION_NAMES[permissionType]} permission was denied.`);
    } else if (result === 'blocked') {
      Alert.alert(
        'Blocked',
        `${PERMISSION_NAMES[permissionType]} permission was blocked. Please enable it in settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]
      );
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'granted':
        return '#4CAF50';
      case 'denied':
        return '#FF9800';
      case 'blocked':
        return '#F44336';
      case 'limited':
        return '#2196F3';
      case 'unavailable':
        return '#9E9E9E';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusBackgroundColor = (status) => {
    switch (status) {
      case 'granted':
        return '#E8F5E8';
      case 'denied':
        return '#FFF3E0';
      case 'blocked':
        return '#FFEBEE';
      case 'limited':
        return '#E3F2FD';
      case 'unavailable':
        return '#F5F5F5';
      default:
        return '#F5F5F5';
    }
  };

  const renderPermissionCard = (permissionType) => {
    const status = permissionStatuses[PERMISSION_NAMES[permissionType]];
    const statusText = getPermissionStatusText(status);
    const isGranted = isPermissionGranted(permissionType);
    const isBlocked = isPermissionBlocked(permissionType);

    return (
      <View key={permissionType} style={styles.permissionCard}>
        <View style={styles.permissionHeader}>
          <Text style={styles.permissionTitle}>{PERMISSION_NAMES[permissionType]}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusBackgroundColor(status) },
            ]}
          >
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {statusText}
            </Text>
          </View>
        </View>
        
        <View style={styles.permissionActions}>
          <TouchableOpacity
            style={[
              styles.requestButton,
              isGranted && styles.grantedButton,
              isBlocked && styles.blockedButton,
            ]}
            onPress={() => handleRequestPermission(permissionType)}
            disabled={loading}
          >
            <Text
              style={[
                styles.buttonText,
                isGranted && styles.grantedButtonText,
                isBlocked && styles.blockedButtonText,
              ]}
            >
              {isGranted ? 'Granted' : isBlocked ? 'Open Settings' : 'Request'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <AppHeader title="Dashboard" />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Permissions Dashboard</Text>
          <Text style={styles.subtitle}>
            Manage app permissions for microphone, phone calls, and SMS
          </Text>
        </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkAllPermissions}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>
            {loading ? 'Refreshing...' : 'Refresh Status'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.permissionsContainer}>
        {Object.values(PERMISSION_NAMES).map((permissionName) => {
          const permissionType = Object.keys(PERMISSION_NAMES).find(
            key => PERMISSION_NAMES[key] === permissionName
          );
          return renderPermissionCard(permissionType);
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Note: Some permissions may require additional configuration in device settings.
        </Text>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
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
  actionsContainer: {
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#3498DB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionsContainer: {
    gap: 16,
  },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  permissionActions: {
    alignItems: 'flex-start',
  },
  requestButton: {
    backgroundColor: '#3498DB',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    minWidth: 120,
    alignItems: 'center',
  },
  grantedButton: {
    backgroundColor: '#4CAF50',
  },
  blockedButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  grantedButtonText: {
    color: '#FFFFFF',
  },
  blockedButtonText: {
    color: '#FFFFFF',
  },
  footer: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerText: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default PermissionDashboard;
