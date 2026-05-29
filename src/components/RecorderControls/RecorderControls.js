import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const RecorderControls = ({
  isRecording,
  isPaused,
  onStart,
  onPause,
  onResume,
  onStop,
  disabled = false,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const animateButton = (callback) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    if (callback) callback();
  };

  return (
    <View style={styles.container}>
      {!isRecording ? (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.button, styles.startButton, disabled && styles.disabledButton]}
            onPress={() => animateButton(onStart)}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <View style={styles.iconContainer}>
                <Text style={styles.buttonEmoji}>🎙️</Text>
              </View>
              <Text style={styles.buttonText}>Start Recording</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={styles.activeControls}>
          {!isPaused ? (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.button, styles.pauseButton]}
                onPress={() => animateButton(onPause)}
                activeOpacity={0.8}
              >
                <View style={styles.buttonContent}>
                  <View style={styles.iconContainer}>
                    <Text style={styles.buttonEmoji}>⏸️</Text>
                  </View>
                  <Text style={styles.buttonText}>Pause</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.button, styles.resumeButton]}
                onPress={() => animateButton(onResume)}
                activeOpacity={0.8}
              >
                <View style={styles.buttonContent}>
                  <View style={styles.iconContainer}>
                    <Text style={styles.buttonEmoji}>▶️</Text>
                  </View>
                  <Text style={styles.buttonText}>Resume</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={() => animateButton(onStop)}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <View style={styles.iconContainer}>
                  <Text style={styles.buttonEmoji}>⏹️</Text>
                </View>
                <Text style={styles.buttonText}>Stop</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    activeControls: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
    },
    button: {
      borderRadius: 25,
      paddingVertical: 16,
      paddingHorizontal: 24,
      minWidth: 140,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    startButton: {
      backgroundColor: colors.recording.play,
      shadowColor: colors.recording.play,
    },
    pauseButton: {
      backgroundColor: colors.recording.pause,
      shadowColor: colors.recording.pause,
    },
    resumeButton: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
    },
    stopButton: {
      backgroundColor: colors.recording.active,
      shadowColor: colors.recording.active,
    },
    disabledButton: {
      backgroundColor: colors.text.light,
      elevation: 0,
      shadowOpacity: 0,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconContainer: {
      marginRight: 8,
    },
    buttonEmoji: {
      fontSize: 24,
    },
    buttonText: {
      color: colors.text.white,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}

export default RecorderControls;
