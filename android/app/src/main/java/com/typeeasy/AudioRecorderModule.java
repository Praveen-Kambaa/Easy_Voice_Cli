package com.typeeasy;

import android.media.MediaRecorder;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.annotation.Nullable;

import java.io.File;
import java.io.IOException;

public class AudioRecorderModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioRecorderModule";
    private MediaRecorder mediaRecorder;
    private MediaPlayer mediaPlayer;
    private String currentFilePath;
    private boolean isRecording = false;
    private boolean isPaused = false;
    private boolean isPlaying = false;

    public AudioRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AudioRecorderModule";
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        try {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        } catch (Exception e) {
            Log.e(TAG, "Error sending event: " + eventName, e);
        }
    }

    @ReactMethod
    public void startRecording(String fileName, Promise promise) {
        try {
            if (isRecording) {
                promise.reject("ALREADY_RECORDING", "Recording is already in progress");
                return;
            }

            // Use app's internal storage directory (no permissions needed)
            File recordingsDir = new File(getReactApplicationContext().getFilesDir(), "AppRecordings");
            if (!recordingsDir.exists()) {
                boolean created = recordingsDir.mkdirs();
                Log.d(TAG, "Directory created: " + created + " at " + recordingsDir.getAbsolutePath());
            }

            currentFilePath = new File(recordingsDir, fileName).getAbsolutePath();
            Log.d(TAG, "Recording file path: " + currentFilePath);

            mediaRecorder = new MediaRecorder();
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mediaRecorder.setOutputFile(currentFilePath);

            try {
                mediaRecorder.prepare();
                mediaRecorder.start();
                isRecording = true;
                isPaused = false;
                
                Log.d(TAG, "Recording started: " + currentFilePath);
                promise.resolve(currentFilePath);
            } catch (IOException e) {
                Log.e(TAG, "Failed to start recording", e);
                promise.reject("RECORDING_FAILED", "Failed to start recording: " + e.getMessage());
            }

        } catch (Exception e) {
            Log.e(TAG, "Error setting up recorder", e);
            promise.reject("SETUP_ERROR", "Error setting up recorder: " + e.getMessage());
        }
    }

    @ReactMethod
    public void pauseRecording(Promise promise) {
        try {
            if (!isRecording || isPaused) {
                promise.reject("NOT_RECORDING", "No active recording to pause");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                mediaRecorder.pause();
                isPaused = true;
                Log.d(TAG, "Recording paused");
                promise.resolve("Recording paused");
            } else {
                promise.reject("NOT_SUPPORTED", "Pause not supported on this Android version");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error pausing recording", e);
            promise.reject("PAUSE_ERROR", "Error pausing recording: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resumeRecording(Promise promise) {
        try {
            if (!isRecording || !isPaused) {
                promise.reject("NOT_PAUSED", "No paused recording to resume");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                mediaRecorder.resume();
                isPaused = false;
                Log.d(TAG, "Recording resumed");
                promise.resolve("Recording resumed");
            } else {
                promise.reject("NOT_SUPPORTED", "Resume not supported on this Android version");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error resuming recording", e);
            promise.reject("RESUME_ERROR", "Error resuming recording: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopRecording(Promise promise) {
        try {
            if (!isRecording) {
                promise.reject("NOT_RECORDING", "No active recording to stop");
                return;
            }

            try {
                mediaRecorder.stop();
                mediaRecorder.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping recorder (might be normal): " + e.getMessage());
            }

            isRecording = false;
            isPaused = false;
            mediaRecorder = null;

            Log.d(TAG, "Recording stopped: " + currentFilePath);
            promise.resolve(currentFilePath);

        } catch (Exception e) {
            Log.e(TAG, "Error stopping recording", e);
            // Force cleanup even on error
            isRecording = false;
            isPaused = false;
            if (mediaRecorder != null) {
                try {
                    mediaRecorder.release();
                } catch (Exception releaseError) {
                    Log.e(TAG, "Error releasing recorder", releaseError);
                }
                mediaRecorder = null;
            }
            promise.reject("STOP_ERROR", "Error stopping recording: " + e.getMessage());
        }
    }

    @ReactMethod
    public void forceStopRecording(Promise promise) {
        try {
            if (mediaRecorder != null) {
                try {
                    mediaRecorder.stop();
                } catch (Exception e) {
                    Log.w(TAG, "Error during force stop: " + e.getMessage());
                }
                
                try {
                    mediaRecorder.release();
                } catch (Exception e) {
                    Log.w(TAG, "Error during force release: " + e.getMessage());
                }
                
                mediaRecorder = null;
            }

            // Also cleanup media player if it's running
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.stop();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Error stopping media player: " + e.getMessage());
                }
                
                try {
                    mediaPlayer.release();
                } catch (Exception e) {
                    Log.w(TAG, "Error releasing media player: " + e.getMessage());
                }
                
                mediaPlayer = null;
            }

            isRecording = false;
            isPaused = false;
            isPlaying = false;

            Log.d(TAG, "Force stop completed");
            promise.resolve("Force stop completed");

        } catch (Exception e) {
            Log.e(TAG, "Error during force stop", e);
            // Ensure state is reset even on error
            isRecording = false;
            isPaused = false;
            isPlaying = false;
            mediaRecorder = null;
            mediaPlayer = null;
            promise.resolve("Force stop completed (with errors)");
        }
    }

    @ReactMethod
    public void startPlayback(String filePath, Promise promise) {
        try {
            if (isPlaying) {
                promise.reject("ALREADY_PLAYING", "Audio is already playing");
                return;
            }

            File audioFile = new File(filePath);
            if (!audioFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "Audio file not found: " + filePath);
                return;
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(filePath);
            mediaPlayer.prepare();
            mediaPlayer.start();

            isPlaying = true;

            // Set completion listener
            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    isPlaying = false;
                    mp.release();
                    mediaPlayer = null;
                    Log.d(TAG, "Playback completed");
                    sendEvent("onPlaybackComplete", null);
                }
            });

            Log.d(TAG, "Playback started: " + filePath);
            promise.resolve("Playback started");

        } catch (Exception e) {
            Log.e(TAG, "Error starting playback", e);
            isPlaying = false;
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.release();
                } catch (Exception releaseError) {
                    Log.e(TAG, "Error releasing media player", releaseError);
                }
                mediaPlayer = null;
            }
            promise.reject("PLAYBACK_ERROR", "Error starting playback: " + e.getMessage());
        }
    }

    @ReactMethod
    public void pausePlayback(Promise promise) {
        try {
            if (!isPlaying || mediaPlayer == null) {
                promise.reject("NOT_PLAYING", "No audio is currently playing");
                return;
            }

            if (mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
                Log.d(TAG, "Playback paused");
                promise.resolve("Playback paused");
            } else {
                promise.reject("NOT_PLAYING", "Audio is not currently playing");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error pausing playback", e);
            promise.reject("PAUSE_ERROR", "Error pausing playback: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopPlayback(Promise promise) {
        try {
            if (!isPlaying || mediaPlayer == null) {
                promise.reject("NOT_PLAYING", "No audio is currently playing");
                return;
            }

            if (mediaPlayer.isPlaying()) {
                mediaPlayer.stop();
            }
            
            mediaPlayer.release();
            mediaPlayer = null;
            isPlaying = false;

            Log.d(TAG, "Playback stopped");
            promise.resolve("Playback stopped");

        } catch (Exception e) {
            Log.e(TAG, "Error stopping playback", e);
            // Force cleanup even on error
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.release();
                } catch (Exception releaseError) {
                    Log.e(TAG, "Error releasing media player", releaseError);
                }
                mediaPlayer = null;
            }
            isPlaying = false;
            promise.reject("STOP_ERROR", "Error stopping playback: " + e.getMessage());
        }
    }
}
