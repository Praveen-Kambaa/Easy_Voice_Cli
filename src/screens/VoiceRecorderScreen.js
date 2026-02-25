import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RecorderControls from '../components/RecorderControls/RecorderControls';
import AudioRecorderService from '../services/AudioRecorderService';
import { AudioStorageService } from '../services/AudioStorageService';

const VoiceRecorderScreen = ({ navigation }) => {
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    isPaused: false,
    duration: 0,
    filePath: '',
  });

  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      if (recordingState.isRecording && !recordingState.isPaused) {
        const currentState = AudioRecorderService.getRecordingState();
        setRecordingState(currentState);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [recordingState.isRecording, recordingState.isPaused]);

  useEffect(() => {
    if (recordingState.isRecording && !recordingState.isPaused) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recordingState.isRecording, recordingState.isPaused, pulseAnim]);

  const handleStart = async () => {
    try {
      const result = await AudioRecorderService.startRecording();
      if (result.success) {
        setRecordingState(AudioRecorderService.getRecordingState());
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handlePause = async () => {
    try {
      const result = await AudioRecorderService.pauseRecording();
      if (result.success) {
        setRecordingState(AudioRecorderService.getRecordingState());
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pause recording');
    }
  };

  const handleResume = async () => {
    try {
      const result = await AudioRecorderService.resumeRecording();
      if (result.success) {
        setRecordingState(AudioRecorderService.getRecordingState());
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to resume recording');
    }
  };

  const handleStop = async () => {
    try {
      const result = await AudioRecorderService.stopRecording();
      if (result.success) {
        // Save recording to storage
        const saveResult = await AudioStorageService.saveRecording({
          filePath: result.filePath,
          duration: result.duration,
        });
        
        if (saveResult.success) {
          Alert.alert(
            'Recording Saved! 🎉',
            `Audio file saved successfully!\nDuration: ${AudioRecorderService.formatDuration(result.duration)}`,
            [
              { text: 'OK', style: 'cancel' },
              { text: 'View Recordings', onPress: () => navigation.navigate('RecordedAudio') }
            ]
          );
        } else {
          Alert.alert('Warning', `Recording saved but storage failed: ${saveResult.error}`);
        }
        
        setRecordingState(AudioRecorderService.getRecordingState());
      } else {
        // If stop fails, try force cleanup
        AudioRecorderService.forceCleanup();
        setRecordingState(AudioRecorderService.getRecordingState());
        Alert.alert('Error', `Failed to stop recording: ${result.error}\nMicrophone has been force-stopped for safety.`);
      }
    } catch (error) {
      // Emergency cleanup
      AudioRecorderService.forceCleanup();
      setRecordingState(AudioRecorderService.getRecordingState());
      Alert.alert('Error', `Failed to stop recording: ${error.message}\nMicrophone has been force-stopped for safety.`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <Text style={styles.headerIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Recorder</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RecordedAudio')}>
          <Text style={styles.headerIcon}>🎵</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Animated.View 
          style={[
            styles.recordingCard, 
            recordingState.isRecording && !recordingState.isPaused && styles.recordingCardActive
          ]}
        >
          <Animated.View 
            style={[
              styles.recordingIndicator,
              { transform: [{ scale: pulseAnim }] }
            ]}
          >
            <Text style={styles.recordingEmoji}>
              {recordingState.isRecording ? "🎙️" : "🎤"}
            </Text>
          </Animated.View>
          
          <Text style={styles.statusText}>
            {recordingState.isRecording 
              ? recordingState.isPaused 
                ? '⏸️ Recording Paused' 
                : '🎙️ Recording...'
              : '🎤 Ready to Record'
            }
          </Text>
          
          {recordingState.isRecording && (
            <Text style={styles.durationText}>
              {AudioRecorderService.formatDuration(recordingState.duration)}
            </Text>
          )}
        </Animated.View>

        <View style={styles.controlsContainer}>
          <RecorderControls
            isRecording={recordingState.isRecording}
            isPaused={recordingState.isPaused}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
          />
        </View>

        <View style={styles.quickTips}>
          <Text style={styles.tipsTitle}>Quick Tips</Text>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>👆</Text>
            <Text style={styles.tipText}>Tap Start to begin recording</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>⏸️</Text>
            <Text style={styles.tipText}>Use Pause/Resume to control</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>⏹️</Text>
            <Text style={styles.tipText}>Tap Stop to save your recording</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>📁</Text>
            <Text style={styles.tipText}>Files saved in high-quality M4A format</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  recordingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recordingCardActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  recordingIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  durationText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3B82F6',
    fontFamily: 'monospace',
  },
  recordingEmoji: {
    fontSize: 48,
  },
  controlsContainer: {
    marginBottom: 32,
  },
  quickTips: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
});

export default VoiceRecorderScreen;
