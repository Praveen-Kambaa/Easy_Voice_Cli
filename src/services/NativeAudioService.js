import { NativeModules, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FileSystem, Dirs } from 'react-native-file-access';
import { formatDateTime } from '../utils/dateTimeFormat';

const { AudioRecorderModule } = NativeModules;

const RECORDINGS_STORAGE_KEY = '@typeeasy_voice_recordings';
const LEGACY_RECORDINGS_PATH = `${Dirs.DocumentDir}/recordings.json`;

export const VOICE_RECORDINGS_UPDATED_EVENT = 'VoiceRecordingsUpdated';

async function migrateLegacyRecordingsIfNeeded() {
  try {
    const exists = await FileSystem.exists(LEGACY_RECORDINGS_PATH);
    if (!exists) return [];
    const raw = await FileSystem.readFile(LEGACY_RECORDINGS_PATH);
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    await AsyncStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify(arr));
    await FileSystem.unlink(LEGACY_RECORDINGS_PATH).catch(() => {});
    return arr;
  } catch (e) {
    console.warn('[NativeAudioService] legacy recordings migrate:', e);
    return [];
  }
}

async function readAllRecordingsFromStorage() {
  const fromStorage = await AsyncStorage.getItem(RECORDINGS_STORAGE_KEY);
  if (fromStorage != null) {
    const parsed = JSON.parse(fromStorage);
    return Array.isArray(parsed) ? parsed : [];
  }
  return migrateLegacyRecordingsIfNeeded();
}

async function writeAllRecordings(recordings) {
  await AsyncStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify(recordings));
  DeviceEventEmitter.emit(VOICE_RECORDINGS_UPDATED_EVENT);
}

class NativeAudioService {
  constructor() {
    this.isRecording = false;
    this.recordingFilePath = '';
    this.recordingStartTime = null;
    this.isPlaying = false;
    this.currentPlaybackFile = '';
    this._playbackCompleteCallback = null;

    // Listen for native playback completion event
    DeviceEventEmitter.addListener('onPlaybackComplete', () => {
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      if (this._playbackCompleteCallback) {
        const cb = this._playbackCompleteCallback;
        this._playbackCompleteCallback = null;
        cb();
      }
    });
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
        name: `Recording ${formatDateTime(new Date())}`,
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

  async playRecording(filePath, onComplete) {
    try {
      if (this.isPlaying) {
        await this.stopPlayback();
      }

      console.log('[NativeAudioService] playRecording:', filePath);

      this._playbackCompleteCallback = onComplete || null;

      // Call native method with Promise (resolves when playback STARTS)
      await AudioRecorderModule.startPlayback(filePath);

      this.isPlaying = true;
      this.currentPlaybackFile = filePath;

      console.log('[NativeAudioService] Playback started');

      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] playRecording error:', error);
      this.isPlaying = false;
      this.currentPlaybackFile = '';
      this._playbackCompleteCallback = null;
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
      this.isPlaying = false;
      this.currentPlaybackFile = '';

      // Audio finished naturally on its own before stop was called — not an error
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('no audio') || msg.includes('not playing') || msg.includes('nothing playing')) {
        return { success: true };
      }

      console.error('[NativeAudioService] stopPlayback error:', error);
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

  async saveRecording(recording) {
    try {
      const recordings = await this.getAllRecordings();
      recordings.push(recording);
      await writeAllRecordings(recordings);
      return { success: true };
    } catch (error) {
      console.error('[NativeAudioService] saveRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllRecordings() {
    try {
      return await readAllRecordingsFromStorage();
    } catch (error) {
      console.error('[NativeAudioService] getAllRecordings error:', error);
      return [];
    }
  }

  async deleteRecording(recordingId) {
    try {
      const recordings = await this.getAllRecordings();
      const filteredRecordings = recordings.filter(r => r.id !== recordingId);
      await writeAllRecordings(filteredRecordings);
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
      await writeAllRecordings(recordings);
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
    return formatDateTime(dateString);
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
