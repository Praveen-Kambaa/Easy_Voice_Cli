import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { AudioRecorderModule } = NativeModules;

class NativeAudioService {
  constructor() {
    this.isRecording = false;
    this.recordingFilePath = '';
    this.recordingStartTime = null;
    this.isPlaying = false;
    this.currentPlaybackFile = '';
  }

  async requestAudioPermission() {
    // For Android, we'll handle permissions in the native module
    return true;
  }

  async startRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.m4a`;

      console.log('[NativeAudioService] startRecording → fileName:', fileName);

      // Call native method with Promise
      const filePath = await AudioRecorderModule.startRecording(fileName);

      this.isRecording = true;
      this.recordingFilePath = filePath;
      this.recordingStartTime = Date.now();

      console.log('[NativeAudioService] Recording started:', filePath);

      return { success: true, filePath };
    } catch (error) {
      console.error('[NativeAudioService] startRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) {
        throw new Error('No active recording to stop');
      }

      const duration = Date.now() - this.recordingStartTime;
      console.log('[NativeAudioService] stopRecording, duration:', duration, 'ms');

      // Call native method with Promise
      const filePath = await AudioRecorderModule.stopRecording();

      this.isRecording = false;
      this.recordingStartTime = null;

      const recordingData = {
        id: Date.now().toString(),
        name: `Recording ${new Date().toLocaleString()}`,
        filePath: filePath,
        duration,
        createdAt: new Date().toISOString(),
        rawTranscript: null,
        refinedTranscript: null,
        voiceAssetId: null,
      };

      await this.saveRecording(recordingData);

      return {
        success: true,
        filePath,
        duration,
        recordingId: recordingData.id,
        recordingData,
      };
    } catch (error) {
      console.error('[NativeAudioService] stopRecording error:', error);
      this.isRecording = false;
      this.recordingStartTime = null;
      this.recordingFilePath = '';
      return { success: false, error: error.message };
    }
  }

  async playRecording(filePath) {
    try {
      if (this.isPlaying) {
        await this.stopPlayback();
      }

      console.log('[NativeAudioService] playRecording:', filePath);

      // Call native method with Promise
      await AudioRecorderModule.startPlayback(filePath);

      this.isPlaying = true;
      this.currentPlaybackFile = filePath;

      console.log('[NativeAudioService] Playback started');

      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] playRecording error:', error);
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      return { success: false, error: error.message };
    }
  }

  async stopPlayback() {
    try {
      if (!this.isPlaying) {
        return { success: true };
      }

      // Call native method with Promise
      await AudioRecorderModule.stopPlayback();

      this.isPlaying = false;
      this.currentPlaybackFile = '';

      console.log('[NativeAudioService] Playback stopped');

      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] stopPlayback error:', error);
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      return { success: false, error: error.message };
    }
  }

  async pausePlayback() {
    try {
      // Not implemented in native module
      return { success: false, error: 'Pause not supported' };
    } catch (error) {
      console.error('[NativeAudioService] pausePlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  async resumePlayback() {
    try {
      // Not implemented in native module
      return { success: false, error: 'Resume not supported' };
    } catch (error) {
      console.error('[NativeAudioService] resumePlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  // File-based storage using RNFS
  async saveRecording(recording) {
    try {
      const recordings = await this.getAllRecordings();
      recordings.push(recording);
      const recordingsPath = `${RNFS.DocumentDirectoryPath}/recordings.json`;
      await RNFS.writeFile(recordingsPath, JSON.stringify(recordings), 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] saveRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllRecordings() {
    try {
      const recordingsPath = `${RNFS.DocumentDirectoryPath}/recordings.json`;
      const exists = await RNFS.exists(recordingsPath);
      if (!exists) {
        return [];
      }
      const recordings = await RNFS.readFile(recordingsPath, 'utf8');
      return JSON.parse(recordings);
    } catch (error) {
      console.error('[NativeAudioService] getAllRecordings error:', error);
      return [];
    }
  }

  async deleteRecording(recordingId) {
    try {
      const recordings = await this.getAllRecordings();
      const filteredRecordings = recordings.filter(r => r.id !== recordingId);
      const recordingsPath = `${RNFS.DocumentDirectoryPath}/recordings.json`;
      await RNFS.writeFile(recordingsPath, JSON.stringify(filteredRecordings), 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] deleteRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async updateRecordingTranscript(recordingId, transcriptData) {
    try {
      const recordings = await this.getAllRecordings();
      const idx = recordings.findIndex(r => r.id === recordingId);
      if (idx === -1) {
        return { success: false, error: 'Recording not found' };
      }
      recordings[idx] = { ...recordings[idx], ...transcriptData, updatedAt: new Date().toISOString() };
      const recordingsPath = `${RNFS.DocumentDirectoryPath}/recordings.json`;
      await RNFS.writeFile(recordingsPath, JSON.stringify(recordings), 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] updateRecordingTranscript error:', error);
      return { success: false, error: error.message };
    }
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      isPlaying: this.isPlaying,
      recordingFilePath: this.recordingFilePath,
      currentPlaybackFile: this.currentPlaybackFile,
      recordingStartTime: this.recordingStartTime,
    };
  }

  formatDuration(milliseconds) {
    const totalSec = Math.floor(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async forceCleanup() {
    try {
      if (this.isRecording) {
        await AudioRecorderModule.forceStopRecording();
      }
      if (this.isPlaying) {
        await this.stopPlayback();
      }
    } catch (e) {
      console.log('[NativeAudioService] forceCleanup (expected):', e.message);
    } finally {
      this.isRecording = false;
      this.isPlaying = false;
      this.recordingStartTime = null;
      this.recordingFilePath = '';
      this.currentPlaybackFile = '';
    }
    return { success: true };
  }
}

export default new NativeAudioService();
