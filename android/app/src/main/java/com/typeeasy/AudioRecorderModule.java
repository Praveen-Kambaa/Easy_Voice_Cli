package com.typeeasy;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
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

    private final AudioManager.OnAudioFocusChangeListener playbackFocusListener = focusChange ->
        Log.d(TAG, "playback audio focus change=" + focusChange);

    private AudioFocusRequest audioFocusRequest;

    public AudioRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    private AudioManager getSysAudioManager() {
        return (AudioManager) getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE);
    }

    /** Leave in-call / communication routing so MediaPlayer is audible on the main speaker. */
    private void requestPlaybackAudioFocus() {
        AudioManager am = getSysAudioManager();
        am.setMode(AudioManager.MODE_NORMAL);
        //noinspection deprecation
        am.setSpeakerphoneOn(false);
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attr)
                .setOnAudioFocusChangeListener(playbackFocusListener)
                .setWillPauseWhenDucked(false)
                .build();
            result = am.requestAudioFocus(audioFocusRequest);
        } else {
            result = am.requestAudioFocus(playbackFocusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        Log.d(TAG, "requestPlaybackAudioFocus result=" + result);
    }

    private void abandonPlaybackAudioFocus() {
        AudioManager am = getSysAudioManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) {
                am.abandonAudioFocusRequest(audioFocusRequest);
                audioFocusRequest = null;
            }
        } else {
            am.abandonAudioFocus(playbackFocusListener);
        }
        am.setMode(AudioManager.MODE_NORMAL);
    }

    @Override
    public String getName() {
        return "AudioRecorderModule";
    }

    /** Strip file:// so MediaPlayer always gets a filesystem path. */
    private static String normalizePlaybackPath(String filePath) {
        if (filePath == null) {
            return "";
        }
        String p = filePath.trim();
        if (p.startsWith("file://")) {
            p = p.substring(7);
        }
        return p;
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

            abandonPlaybackAudioFocus();

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
            abandonPlaybackAudioFocus();
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

            String path = normalizePlaybackPath(filePath);
            final boolean isContentUri = path.startsWith("content://");
            File audioFile = isContentUri ? null : new File(path);
            long fileLen = -1L;
            if (!isContentUri) {
                if (!audioFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Audio file not found: " + path);
                    return;
                }
                fileLen = audioFile.length();
                if (fileLen < 64) {
                    promise.reject("FILE_TOO_SMALL", "Audio file is empty or corrupt (size=" + fileLen + ")");
                    return;
                }
            }

            mediaPlayer = new MediaPlayer();

            // Session id must be set before setDataSource; omit if allocation failed (0).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                int sessionId = getSysAudioManager().generateAudioSessionId();
                if (sessionId != 0) {
                    mediaPlayer.setAudioSessionId(sessionId);
                }
            }

            // Route through media / music stream so playback is audible after phone calls (not in-call / voice-call stream).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                mediaPlayer.setAudioAttributes(attrs);
            } else {
                mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            }

            mediaPlayer.setVolume(1.0f, 1.0f);

            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    isPlaying = false;
                    try {
                        mp.release();
                    } catch (Exception ignored) {
                    }
                    mediaPlayer = null;
                    abandonPlaybackAudioFocus();
                    Log.d(TAG, "Playback completed");
                    sendEvent("onPlaybackComplete", null);
                }
            });

            mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra + " path=" + path);
                    isPlaying = false;
                    try {
                        mp.release();
                    } catch (Exception ignored) {
                    }
                    mediaPlayer = null;
                    abandonPlaybackAudioFocus();
                    return true;
                }
            });

            requestPlaybackAudioFocus();

            // Log media volume — on many OEMs "Silent" / DND still allows 0 volume here → audible silence.
            AudioManager amVol = getSysAudioManager();
            int curVol = amVol.getStreamVolume(AudioManager.STREAM_MUSIC);
            int maxVol = amVol.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            Log.i(TAG, "STREAM_MUSIC volume " + curVol + "/" + maxVol + " (raise volume or turn off Silent mode if you hear nothing)");
            if (curVol == 0) {
                Log.w(TAG, "Media volume is 0 — playback may be silent until user raises volume.");
            }

            try {
                mediaPlayer.setWakeMode(getReactApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            } catch (Exception e) {
                Log.w(TAG, "setWakeMode: " + e.getMessage());
            }

            // Prefer Context+Uri — fewer OEM path bugs than raw string path.
            if (isContentUri) {
                mediaPlayer.setDataSource(getReactApplicationContext(), Uri.parse(path));
            } else {
                mediaPlayer.setDataSource(getReactApplicationContext(), Uri.fromFile(audioFile));
            }
            mediaPlayer.prepare();
            mediaPlayer.start();

            isPlaying = true;

            Log.d(TAG, "Playback started: " + path + " size=" + fileLen);
            promise.resolve("Playback started");

        } catch (Exception e) {
            Log.e(TAG, "Error starting playback", e);
            isPlaying = false;
            abandonPlaybackAudioFocus();
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
            abandonPlaybackAudioFocus();

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
            abandonPlaybackAudioFocus();
            promise.reject("STOP_ERROR", "Error stopping playback: " + e.getMessage());
        }
    }
}
