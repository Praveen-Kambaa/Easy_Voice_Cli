import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { PERMISSION_NAMES } from '../utils/AndroidPermissions';
import { Colors } from '../theme/Colors';

const { width, height } = Dimensions.get('window');

const PermissionModal = ({
  visible,
  permissionType,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const getPermissionContent = () => {
    switch (permissionType) {
      case PERMISSION_NAMES.OVERLAY:
        return {
          title: 'Overlay Permission Required',
          icon: '📱',
          description: 'This app needs permission to display content over other apps.',
          benefits: [
            'Show important information when you need it',
            'Provide quick access to app controls',
            'Enhance experience with floating widgets',
          ],
          instructions: [
            'Tap "Open Settings" below',
            'Find "Display over other apps"',
            'Enable the toggle for this app',
            'Return to continue',
          ],
        };

      case PERMISSION_NAMES.ACCESSIBILITY:
        return {
          title: 'Accessibility Service Required',
          icon: '♿',
          description: 'This app needs accessibility service permission to provide enhanced functionality.',
          benefits: [
            'Interact with system elements seamlessly',
            'Provide automated text insertion',
            'Enhance accessibility features',
          ],
          instructions: [
            'Tap "Open Settings" below',
            'Find "Accessibility" or "Accessibility Services"',
            'Locate this app in the list',
            'Enable the toggle for this app',
            'Grant the requested permissions',
            'Return to continue',
          ],
        };

      default:
        return {
          title: 'Permission Required',
          icon: '🔐',
          description: 'This app needs additional permissions to function properly.',
          benefits: ['Enable full app functionality'],
          instructions: ['Follow the on-screen instructions'],
        };
    }
  };

  const content = getPermissionContent();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>{content.icon}</Text>
            <Text style={styles.title}>{content.title}</Text>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            <Text style={styles.description}>{content.description}</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Why we need this:</Text>
              <View style={styles.benefitsList}>
                {content.benefits.map((benefit, index) => (
                  <View key={index} style={styles.benefitItem}>
                    <View style={styles.bullet} />
                    <Text style={styles.benefitText}>{benefit}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How to enable:</Text>
              <View style={styles.instructionsList}>
                {content.instructions.map((step, index) => (
                  <View key={index} style={styles.instructionStep}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                We respect your privacy and only use these permissions to enhance your experience.
                You can disable these permissions at any time in device settings.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton, loading && styles.disabledButton]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Open Settings</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    width: width - 48,
    maxHeight: height * 0.82,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  icon: {
    fontSize: 44,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
    lineHeight: 26,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  description: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  instructionsList: {
    gap: 10,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  privacyNote: {
    backgroundColor: Colors.backgroundAlt,
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.border,
    marginTop: 4,
  },
  privacyText: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  cancelButton: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default PermissionModal;
