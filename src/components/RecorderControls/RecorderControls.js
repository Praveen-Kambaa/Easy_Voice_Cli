import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';

const RecorderControls = ({
  isRecording,
  isPaused,
  onStart,
  onPause,
  onResume,
  onStop,
  disabled = false,
}) => {
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

const styles = StyleSheet.create({
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
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  pauseButton: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  resumeButton: {
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
  },
  stopButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RecorderControls;
