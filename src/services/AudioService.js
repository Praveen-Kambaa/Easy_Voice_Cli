import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';
import VoiceRecorder from 'react-native-voice-recorder';

// In-memory storage - declared BEFORE class so it's available from the start
let recordings = [];

class AudioService {
  constructor() {
    this.isRecording = false;
    this.recordingFilePath = '';
    this.recordingStartTime = null;
    this.isPlaying = false;
    this.currentPlaybackFile = '';
  }

  // ─── Permissions ─────────────────────────────────────────────────────────────

  async requestAudioPermission() {
    try {
      if (Platform.OS !== 'android') {
        return true;
      }

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'This app needs microphone access to record audio.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error('[AudioService] Permission error:', error);
      return false;
    }
  }

  // ─── Recording ────────────────────────────────────────────────────────────────

  async startRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      const hasPermission = await this.requestAudioPermission();
      if (!hasPermission) {
        throw new Error('Audio recording permission denied');
      }

      // Use CachesDirectoryPath – always writable, no extra permissions needed on Android
      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.mp4`;
      const filePath = `${RNFS.CachesDirectoryPath}/${fileName}`;

      console.log('[AudioService] startRecording → path:', filePath);

      // Start recording with VoiceRecorder
      await VoiceRecorder.startRecording({
        path: filePath,
        format: 'mp4',
        quality: 'high',
      });

      console.log('[AudioService] VoiceRecorder started successfully');

      this.isRecording = true;
      this.recordingFilePath = filePath;
      this.recordingStartTime = Date.now();

      return { success: true, filePath };
    } catch (error) {
      console.error('[AudioService] startRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) {
        throw new Error('No active recording to stop');
      }

      const duration = Date.now() - this.recordingStartTime;
      console.log('[AudioService] stopRecording, duration:', duration, 'ms');

      // Stop recording with VoiceRecorder
      const result = await VoiceRecorder.stopRecording();
      console.log('[AudioService] VoiceRecorder stopped:', result);

      const savedPath = this.recordingFilePath;

      // Verify file was created
      const exists = await RNFS.exists(savedPath);
      if (!exists) {
        throw new Error('Recording file not found after stop');
      }
      const stat = await RNFS.stat(savedPath);
      console.log('[AudioService] file saved at:', savedPath, '– size:', stat.size, 'bytes');

      this.isRecording = false;
      this.recordingStartTime = null;
      this.recordingFilePath = '';

      const recordingData = {
        id: Date.now().toString(),
        name: `Recording ${new Date().toLocaleString()}`,
        filePath: savedPath,
        duration,
        createdAt: new Date().toISOString(),
        rawTranscript: null,
        refinedTranscript: null,
        voiceAssetId: null,
      };

      await this.saveRecording(recordingData);

      return {
        success: true,
        filePath: savedPath,
        duration,
        recordingId: recordingData.id,
        recordingData,
      };
    } catch (error) {
      console.error('[AudioService] stopRecording error:', error);
      this.isRecording = false;
      this.recordingStartTime = null;
      this.recordingFilePath = '';
      return { success: false, error: error.message };
    }
  }

  // ─── Playback ─────────────────────────────────────────────────────────────────

  async playRecording(filePath) {
    try {
      if (this.isPlaying) {
        await this.stopPlayback();
      }

      console.log('[AudioService] playRecording:', filePath);

      const exists = await RNFS.exists(filePath);
      if (!exists) {
        throw new Error('Audio file does not exist: ' + filePath);
      }

      // For now, we'll just simulate playback
      // In a real implementation, you'd use a proper audio player
      this.isPlaying = true;
      this.currentPlaybackFile = filePath;

      console.log('[AudioService] playback started (simulated)');
      
      // Simulate playback ending after 3 seconds
      setTimeout(() => {
        this.isPlaying = false;
        this.currentPlaybackFile = '';
        console.log('[AudioService] playback ended (simulated)');
      }, 3000);

      return { success: true };
    } catch (error) {
      console.error('[AudioService] playRecording error:', error);
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
      
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      console.log('[AudioService] playback stopped');
      return { success: true };
    } catch (error) {
      console.error('[AudioService] stopPlayback error:', error);
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      return { success: false, error: error.message };
    }
  }

  async pausePlayback() {
    try {
      // Not implemented for VoiceRecorder
      return { success: false, error: 'Pause not supported with current recorder' };
    } catch (error) {
      console.error('[AudioService] pausePlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  async resumePlayback() {
    try {
      // Not implemented for VoiceRecorder
      return { success: false, error: 'Resume not supported with current recorder' };
    } catch (error) {
      console.error('[AudioService] resumePlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── Storage ──────────────────────────────────────────────────────────────────

  async saveRecording(recording) {
    try {
      recordings = [...recordings, recording];
      return { success: true };
    } catch (error) {
      console.error('[AudioService] saveRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllRecordings() {
    return recordings;
  }

  async deleteRecording(recordingId) {
    recordings = recordings.filter(r => r.id !== recordingId);
    return { success: true };
  }

  async updateRecordingTranscript(recordingId, transcriptData) {
    const idx = recordings.findIndex(r => r.id === recordingId);
    if (idx === -1) {
      return { success: false, error: 'Recording not found' };
    }
    recordings[idx] = { ...recordings[idx], ...transcriptData, updatedAt: new Date().toISOString() };
    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

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
        await VoiceRecorder.stopRecording();
      }
    } catch (e) {
      console.log('[AudioService] forceCleanup (expected):', e.message);
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

export default new AudioService();
