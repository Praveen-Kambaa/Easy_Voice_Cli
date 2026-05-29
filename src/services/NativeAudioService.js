import { NativeModules, DeviceEventEmitter, Platform, Alert, Linking } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
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
    if (Platform.OS === 'ios') {
      const perm = PERMISSIONS.IOS.MICROPHONE;
      const current = await check(perm);
      if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) {
        return true;
      }
      const next = await request(perm);
      return next === RESULTS.GRANTED || next === RESULTS.LIMITED;
    }
    return true;
  }

  isNativeRecorderAvailable() {
    return AudioRecorderModule != null && typeof AudioRecorderModule.startRecording === 'function';
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
      console.warn('[NativeAudioService] isAccessibilityEnabled:', e?.message || e);
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
      console.warn('[NativeAudioService] openAccessibilitySettings:', e?.message || e);
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
      if (!this.isNativeRecorderAvailable()) {
        throw new Error(
          Platform.OS === 'ios'
            ? 'Audio recording is not available. Rebuild the iOS app after installing pods.'
            : 'Audio recorder native module is not available.',
        );
      }

      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      const hasMic = await this.requestAudioPermission();
      if (!hasMic) {
        throw new Error('Microphone permission is required to record audio.');
      }

      const timestamp = Date.now();
      const fileName = `recording_${timestamp}.m4a`;

      console.log('[NativeAudioService] startRecording → fileName:', fileName);

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

      const pathForNative =
        Platform.OS === 'android' &&
        typeof filePath === 'string' &&
        filePath.startsWith('file://')
          ? filePath.replace(/^file:\/\//, '')
          : filePath;

      if (!this.isNativeRecorderAvailable()) {
        throw new Error('Audio playback is not available on this device.');
      }
      await AudioRecorderModule.startPlayback(pathForNative);

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
