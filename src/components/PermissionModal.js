import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { PERMISSION_NAMES } from '../utils/AndroidPermissions';

const { width, height } = Dimensions.get('window');

/**
 * Reusable Permission Modal Component
 * Provides clear user explanation before redirecting to settings
 * Google Play compliant with proper user consent flow
 */
const PermissionModal = ({
  visible,
  permissionType,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  // Get permission-specific content
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
            'Enhance user experience with floating widgets',
          ],
          instructions: [
            'Tap "Open Settings" below',
            'Find "Display over other apps" or "Draw over other apps"',
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
            'Provide automated assistance',
            'Enhance accessibility features',
          ],
          instructions: [
            'Tap "Open Settings" below',
            'Find "Accessibility" or "Accessibility Services"',
            'Locate this app in the services list',
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

  const renderInstructionStep = (step, index) => (
    <View key={index} style={styles.instructionStep}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{index + 1}</Text>
      </View>
      <Text style={styles.stepText}>{step}</Text>
    </View>
  );

  const renderBenefit = (benefit, index) => (
    <View key={index} style={styles.benefitItem}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.benefitText}>{benefit}</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>{content.icon}</Text>
            <Text style={styles.title}>{content.title}</Text>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Description */}
            <Text style={styles.description}>{content.description}</Text>

            {/* Benefits Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Why we need this permission:</Text>
              <View style={styles.benefitsList}>
                {content.benefits.map(renderBenefit)}
              </View>
            </View>

            {/* Instructions Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How to enable:</Text>
              <View style={styles.instructionsList}>
                {content.instructions.map(renderInstructionStep)}
              </View>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                We respect your privacy and only use these permissions to enhance your experience.
                You can disable these permissions at any time in your device settings.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.cancelButtonText]}>
                Cancel
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, loading && styles.disabledButton]}
              onPress={onConfirm}
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.confirmButtonText]}>
                {loading ? 'Opening...' : 'Open Settings'}
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: width * 0.9,
    maxHeight: height * 0.85,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E50',
    textAlign: 'center',
    lineHeight: 28,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  description: {
    fontSize: 16,
    color: '#5A6C7D',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#3498DB',
    fontWeight: '600',
    marginTop: 2,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: '#5A6C7D',
    lineHeight: 22,
  },
  instructionsList: {
    gap: 12,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#5A6C7D',
    lineHeight: 22,
  },
  privacyNote: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3498DB',
  },
  privacyText: {
    fontSize: 13,
    color: '#6C757D',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  confirmButton: {
    backgroundColor: '#3498DB',
  },
  disabledButton: {
    backgroundColor: '#BDC3C7',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#495057',
  },
  confirmButtonText: {
    color: '#FFFFFF',
  },
});

export default PermissionModal;
