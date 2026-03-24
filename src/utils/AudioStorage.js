import AsyncStorage from '@react-native-async-storage/async-storage';

const AUDIO_RECORDINGS_KEY = '@audio_recordings';

export const AudioStorage = {
  // Save audio recording metadata
  async saveRecording(audioPath, timestamp = Date.now()) {
    try {
      const recordings = await this.getRecordings();
      const newRecording = {
        id: `recording_${timestamp}`,
        path: audioPath,
        timestamp: timestamp,
        date: new Date(timestamp).toISOString(),
      };
      
      // Keep only last 50 recordings to prevent storage bloat
      const updatedRecordings = [newRecording, ...recordings].slice(0, 50);
      
      await AsyncStorage.setItem(AUDIO_RECORDINGS_KEY, JSON.stringify(updatedRecordings));
      return newRecording;
    } catch (error) {
      console.error('Failed to save audio recording:', error);
      return null;
    }
  },

  // Get all recordings
  async getRecordings() {
    try {
      const recordings = await AsyncStorage.getItem(AUDIO_RECORDINGS_KEY);
      return recordings ? JSON.parse(recordings) : [];
    } catch (error) {
      console.error('Failed to get recordings:', error);
      return [];
    }
  },

  // Get latest recording
  async getLatestRecording() {
    try {
      const recordings = await this.getRecordings();
      return recordings.length > 0 ? recordings[0] : null;
    } catch (error) {
      console.error('Failed to get latest recording:', error);
      return null;
    }
  },

  // Clear old recordings (older than 7 days)
  async clearOldRecordings() {
    try {
      const recordings = await this.getRecordings();
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      const filteredRecordings = recordings.filter(
        recording => recording.timestamp > sevenDaysAgo
      );
      
      await AsyncStorage.setItem(AUDIO_RECORDINGS_KEY, JSON.stringify(filteredRecordings));
      return filteredRecordings;
    } catch (error) {
      console.error('Failed to clear old recordings:', error);
      return [];
    }
  },

  // Delete specific recording
  async deleteRecording(recordingId) {
    try {
      const recordings = await this.getRecordings();
      const filteredRecordings = recordings.filter(
        recording => recording.id !== recordingId
      );
      
      await AsyncStorage.setItem(AUDIO_RECORDINGS_KEY, JSON.stringify(filteredRecordings));
      return true;
    } catch (error) {
      console.error('Failed to delete recording:', error);
      return false;
    }
  },

  // Get recording count
  async getRecordingCount() {
    try {
      const recordings = await this.getRecordings();
      return recordings.length;
    } catch (error) {
      console.error('Failed to get recording count:', error);
      return 0;
    }
  }
};
