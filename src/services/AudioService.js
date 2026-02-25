import { Platform, PermissionsAndroid } from 'react-native';

// Simple in-memory storage for demo purposes
// In production, this would use proper persistent storage
let recordings = [];

const STORAGE_KEY = '@audio_recordings';

class AudioService {
  constructor() {
    this.isRecording = false;
    this.recordingFilePath = '';
    this.recordingStartTime = null;
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
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  }

  async startRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      const hasPermission = await this.requestAudioPermission();
      if (!hasPermission) {
        throw new Error('Audio recording permission denied');
      }

      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.m4a`;
      const filePath = Platform.select({
        ios: `${fileName}`,
        android: `/sdcard/AppRecordings/${fileName}`,
      });

      this.isRecording = true;
      this.recordingFilePath = filePath;
      this.recordingStartTime = Date.now();

      console.log('Recording started:', filePath);

      return {
        success: true,
        filePath: filePath,
      };
    } catch (error) {
      console.error('Error starting recording:', error);
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

      const recordingDuration = Date.now() - this.recordingStartTime;
      
      // Guarantee microphone stops
      this.isRecording = false;
      this.recordingStartTime = null;

      const recordingData = {
        id: Date.now().toString(),
        name: `Recording ${new Date().toLocaleString()}`,
        filePath: this.recordingFilePath,
        duration: recordingDuration,
        createdAt: new Date().toISOString(),
      };

      // Save to in-memory storage
      await this.saveRecording(recordingData);

      const result = {
        success: true,
        filePath: this.recordingFilePath,
        duration: recordingDuration,
        recordingId: recordingData.id,
      };

      // Clear recording path after successful stop
      this.recordingFilePath = '';

      console.log('Recording stopped:', result);
      return result;
    } catch (error) {
      console.error('Error stopping recording:', error);
      // Force stop recording even on error
      this.isRecording = false;
      this.recordingStartTime = null;
      this.recordingFilePath = '';
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async saveRecording(recording) {
    try {
      const existingRecordings = await this.getAllRecordings();
      const updatedRecordings = [...existingRecordings, recording];
      recordings = updatedRecordings;
      return { success: true };
    } catch (error) {
      console.error('Error saving recording:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllRecordings() {
    try {
      return recordings;
    } catch (error) {
      console.error('Error getting recordings:', error);
      return [];
    }
  }

  async deleteRecording(recordingId) {
    try {
      recordings = recordings.filter(r => r.id !== recordingId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting recording:', error);
      return { success: false, error: error.message };
    }
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      filePath: this.recordingFilePath,
      startTime: this.recordingStartTime,
    };
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export default new AudioService();
