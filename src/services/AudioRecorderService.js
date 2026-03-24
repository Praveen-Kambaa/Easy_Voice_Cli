import { Platform, PermissionsAndroid } from 'react-native';
import { NativeModules } from 'react-native';

const { AudioRecorderModule } = NativeModules;

class AudioRecorderService {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.recordedFilePath = '';
    this.recordingStartTime = null;
    this.recordingDuration = 0;
    this.durationInterval = null;
  }

  async requestAudioPermission() {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Audio Recording Permission',
            message: 'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true; // iOS handles permissions differently
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  }

  async startRecording() {
    try {
      if (this.isRecording && !this.isPaused) {
        throw new Error('Recording is already in progress');
      }

      const hasPermission = await this.requestAudioPermission();
      if (!hasPermission) {
        throw new Error('Audio recording permission denied');
      }

      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.m4a`;

      // Use native module for real audio recording
      if (AudioRecorderModule) {
        const result = await AudioRecorderModule.startRecording(fileName);
        
        this.isRecording = true;
        this.isPaused = false;
        this.recordingStartTime = Date.now();
        this.recordedFilePath = result;

        // Start duration tracking
        this.durationInterval = setInterval(() => {
          if (this.isRecording && !this.isPaused) {
            this.recordingDuration = Date.now() - this.recordingStartTime;
          }
        }, 100);

        console.log('Recording started:', result);

        return {
          success: true,
          filePath: result,
        };
      } else {
        throw new Error('AudioRecorderModule not available');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async pauseRecording() {
    try {
      if (!this.isRecording || this.isPaused) {
        throw new Error('No active recording to pause');
      }

      if (AudioRecorderModule) {
        await AudioRecorderModule.pauseRecording();
      }
      
      this.isPaused = true;
      console.log('Recording paused');

      return {
        success: true,
        message: 'Recording paused',
      };
    } catch (error) {
      console.error('Error pausing recording:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async resumeRecording() {
    try {
      if (!this.isRecording || !this.isPaused) {
        throw new Error('No paused recording to resume');
      }

      if (AudioRecorderModule) {
        await AudioRecorderModule.resumeRecording();
      }
      
      this.isPaused = false;
      console.log('Recording resumed');

      return {
        success: true,
        message: 'Recording resumed',
      };
    } catch (error) {
      console.error('Error resuming recording:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) {
        throw new Error('No active recording to stop');
      }

      let result = this.recordedFilePath;
      
      // Stop native recording
      if (AudioRecorderModule) {
        try {
          const nativeResult = await AudioRecorderModule.stopRecording();
          if (nativeResult) {
            result = nativeResult;
          }
        } catch (nativeError) {
          console.log('Native stop failed:', nativeError);
          // Try force stop
          await AudioRecorderModule.forceStopRecording();
        }
      }

      // Clear duration interval
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }

      const finalDuration = this.recordingDuration;
      
      // Reset state - this ensures microphone is turned OFF
      this.isRecording = false;
      this.isPaused = false;
      this.recordingDuration = 0;
      this.recordingStartTime = null;

      console.log('Recording stopped:', result);

      return {
        success: true,
        filePath: result,
        duration: finalDuration,
      };
    } catch (error) {
      console.error('Error stopping recording:', error);
      
      // Force cleanup on error to ensure microphone is OFF
      this.isRecording = false;
      this.isPaused = false;
      this.recordingDuration = 0;
      this.recordingStartTime = null;
      
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }

      // Try force stop
      if (AudioRecorderModule) {
        try {
          await AudioRecorderModule.forceStopRecording();
        } catch (forceError) {
          console.error('Force stop failed:', forceError);
        }
      }
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async startPlayback(filePath) {
    try {
      if (AudioRecorderModule) {
        await AudioRecorderModule.startPlayback(filePath);
      }
      
      return {
        success: true,
        message: 'Playback started',
      };
    } catch (error) {
      console.error('Error starting playback:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async pausePlayback() {
    try {
      if (AudioRecorderModule) {
        await AudioRecorderModule.pausePlayback();
      }
      
      return {
        success: true,
        message: 'Playback paused',
      };
    } catch (error) {
      console.error('Error pausing playback:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async stopPlayback() {
    try {
      if (AudioRecorderModule) {
        await AudioRecorderModule.stopPlayback();
      }
      
      return {
        success: true,
        message: 'Playback stopped',
      };
    } catch (error) {
      console.error('Error stopping playback:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      duration: this.recordingDuration,
      filePath: this.recordedFilePath,
    };
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Force cleanup method for emergency stop
  forceCleanup() {
    this.isRecording = false;
    this.isPaused = false;
    this.recordingDuration = 0;
    this.recordingStartTime = null;
    
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    
    // Try to force stop native recording
    if (AudioRecorderModule) {
      try {
        AudioRecorderModule.forceStopRecording();
      } catch (error) {
        console.error('Error force stopping native recording:', error);
      }
    }
    
    console.log('Forced cleanup completed');
  }
}

const audioRecorderService = new AudioRecorderService();
export default audioRecorderService;
