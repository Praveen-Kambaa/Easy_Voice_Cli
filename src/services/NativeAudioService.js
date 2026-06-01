import logger from '../utils/logger';
import { NativeModules, DeviceEventEmitter, Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FileSystem, Dirs } from 'react-native-file-access';
import { formatDateTime } from '../utils/dateTimeFormat';

const { AudioRecorderModule, AndroidPermissionsModule } = NativeModules;

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
    logger.warn('[NativeAudioService] legacy recordings migrate:', e);
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

  /**
   * Android-only: check whether Accessibility Service is enabled.
   * Some OEMs are more permissive about long-running background features when a user-enabled
   * accessibility service is active (this does not grant call-audio tap permissions).
   */
  async isAccessibilityEnabled() {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      if (typeof AndroidPermissionsModule?.checkAccessibilityPermission === 'function') {
        return Boolean(await AndroidPermissionsModule.checkAccessibilityPermission());
      }
      return false;
    } catch (e) {
      logger.warn('[NativeAudioService] isAccessibilityEnabled:', e?.message || e);
      return false;
    }
  }

  /** Android-only: open Accessibility settings screen. */
  async openAccessibilitySettings() {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (typeof AndroidPermissionsModule?.openAccessibilitySettings !== 'function') {
      return false;
    }
    try {
      await AndroidPermissionsModule.openAccessibilitySettings();
      return true;
    } catch (e) {
      logger.warn('[NativeAudioService] openAccessibilitySettings:', e?.message || e);
      return false;
    }
  }

  /**
   * Android-only: if Accessibility is disabled, guide the user.\n
   * Some OEMs require enabling “Restricted settings” in App Info before the accessibility service
   * can be turned on. This does not grant call-audio tap permissions, but it helps keep background
   * features stable on stricter Android builds.
   */
  async ensureAccessibilityEnabledOrPrompt() {
    if (Platform.OS !== 'android') {
      return true;
    }
    const ok = await this.isAccessibilityEnabled();
    if (ok) {
      return true;
    }

    Alert.alert(
      'Enable Accessibility',
      "Two-way call recording on newer Android versions requires the app's Accessibility Service to be enabled.\n\n" +
        "If the toggle is blocked, open App info → (⋮) Allow restricted settings, then enable Accessibility again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Accessibility settings',
          onPress: () => this.openAccessibilitySettings(),
        },
        {
          text: 'Open App info',
          onPress: () => Linking.openSettings().catch(() => {}),
        },
      ],
    );
    return false;
  }

  async startRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.m4a`;

      logger.debug('[NativeAudioService] startRecording → fileName:', fileName);

      // Call native method with Promise
      const filePath = await AudioRecorderModule.startRecording(fileName);

      this.isRecording = true;
      this.recordingFilePath = filePath;
      this.recordingStartTime = Date.now();

      logger.debug('[NativeAudioService] Recording started:', filePath);

      return { success: true, filePath };
    } catch (error) {
      logger.error('[NativeAudioService] startRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * @param {{ persist?: boolean }} [options] - Set `persist: false` to skip adding to "My Recordings" (e.g. voice-only reminders).
   */
  async stopRecording(options) {
    const persist = options?.persist !== false;
    try {
      if (!this.isRecording) {
        throw new Error('No active recording to stop');
      }

      const duration = Date.now() - this.recordingStartTime;
      logger.debug('[NativeAudioService] stopRecording, duration:', duration, 'ms');

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

      if (persist) {
        await this.saveRecording(recordingData);
      }

      return {
        success: true,
        filePath,
        duration,
        recordingId: recordingData.id,
        recordingData,
      };
    } catch (error) {
      logger.error('[NativeAudioService] stopRecording error:', error);
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

      logger.debug('[NativeAudioService] playRecording:', filePath);

      this._playbackCompleteCallback = onComplete || null;

      const pathForNative =
        Platform.OS === 'android' &&
        typeof filePath === 'string' &&
        filePath.startsWith('file://')
          ? filePath.replace(/^file:\/\//, '')
          : filePath;

      await AudioRecorderModule.startPlayback(pathForNative);

      this.isPlaying = true;
      this.currentPlaybackFile = filePath;

      logger.debug('[NativeAudioService] Playback started');

      return { success: true };
    } catch (error) {
      logger.error('[NativeAudioService] playRecording error:', error);
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

      logger.debug('[NativeAudioService] Playback stopped');

      return { success: true };
    } catch (error) {
      this.isPlaying = false;
      this.currentPlaybackFile = '';

      // Audio finished naturally on its own before stop was called — not an error
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('no audio') || msg.includes('not playing') || msg.includes('nothing playing')) {
        return { success: true };
      }

      logger.error('[NativeAudioService] stopPlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  async pausePlayback() {
    try {
      // Not implemented in native module
      return { success: false, error: 'Pause not supported' };
    } catch (error) {
      logger.error('[NativeAudioService] pausePlayback error:', error);
      return { success: false, error: error.message };
    }
  }

  async resumePlayback() {
    try {
      // Not implemented in native module
      return { success: false, error: 'Resume not supported' };
    } catch (error) {
      logger.error('[NativeAudioService] resumePlayback error:', error);
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
      logger.error('[NativeAudioService] saveRecording error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllRecordings() {
    try {
      return await readAllRecordingsFromStorage();
    } catch (error) {
      logger.error('[NativeAudioService] getAllRecordings error:', error);
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
      logger.error('[NativeAudioService] deleteRecording error:', error);
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
      logger.error('[NativeAudioService] updateRecordingTranscript error:', error);
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
      logger.debug('[NativeAudioService] forceCleanup (expected):', e.message);
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
