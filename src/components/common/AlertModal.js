import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Colors } from '../../theme/Colors';

const { width } = Dimensions.get('window');

const AlertModal = ({ visible, title, message, buttons = [], onDismiss }) => {
  const handlePress = (btn) => {
    onDismiss();
    btn.onPress?.();
  };

  const isStackedLayout = buttons.length > 2;

  const getButtonTextStyle = (btn, isLast) => {
    const isCancel = btn.style === 'cancel';
    const isDestructive = btn.style === 'destructive';
    const isPrimary = !isCancel && !isDestructive && isLast && buttons.length > 1;
    const isSingle = buttons.length === 1;

    if (isDestructive || isPrimary || isSingle) return styles.whiteText;
    if (isCancel) return styles.cancelText;
    return styles.defaultText;
  };

  const getButtonContainerStyle = (btn, idx, isLast) => {
    const isCancel = btn.style === 'cancel';
    const isDestructive = btn.style === 'destructive';
    const isPrimary = !isCancel && !isDestructive && isLast && buttons.length > 1;
    const isSingle = buttons.length === 1;

    const base = [styles.button];

    if (isStackedLayout) {
      base.push(styles.stackedButton);
      if (idx > 0) base.push(styles.buttonStackSeparator);
    } else {
      if (idx > 0) base.push(styles.buttonSeparator);
    }

    if (isDestructive) base.push(styles.destructiveButton);
    else if (isPrimary || isSingle) base.push(styles.primaryButton);
    else if (isCancel) base.push(styles.cancelButton);
    else base.push(styles.defaultButton);

    return base;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Body */}
          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            {!!message && <Text style={styles.message}>{message}</Text>}
          </View>

          <View style={styles.divider} />

          {/* Buttons */}
          <View style={[styles.actions, isStackedLayout && styles.actionsColumn]}>
            {buttons.map((btn, idx) => {
              const isLast = idx === buttons.length - 1;
              return (
                <TouchableOpacity
                  key={idx}
                  style={getButtonContainerStyle(btn, idx, isLast)}
                  onPress={() => handlePress(btn)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.buttonText, getButtonTextStyle(btn, isLast)]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  container: {
    width: width - 64,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  // Button container layouts
  actions: {
    flexDirection: 'row',
  },
  actionsColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  stackedButton: {
    flex: undefined,
    minHeight: 52,
    width: '100%',
  },
  buttonSeparator: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  buttonStackSeparator: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  // Button type backgrounds
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  destructiveButton: {
    backgroundColor: Colors.recording.active,
  },
  cancelButton: {
    backgroundColor: Colors.surface,
  },
  defaultButton: {
    backgroundColor: Colors.backgroundAlt,
  },

  // Text styles
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  whiteText: {
    color: '#FFFFFF',
  },
  cancelText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  defaultText: {
    color: Colors.text.primary,
  },
});

export default AlertModal;
