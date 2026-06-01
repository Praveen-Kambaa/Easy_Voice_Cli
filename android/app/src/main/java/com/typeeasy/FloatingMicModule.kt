package com.typeeasy

import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.typeeasy.speech.VoiceSpeechRecognitionManager
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class FloatingMicModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var speechManager: VoiceSpeechRecognitionManager? = null
    private val speechInFlight = AtomicBoolean(false)
    private val fileSpeechInFlight = AtomicBoolean(false)
    private var fileMediaPlayer: MediaPlayer? = null

    override fun getName(): String {
        return "FloatingMicModule"
    }

    @ReactMethod
    fun startFloatingMic(promise: Promise) {
        try {
            val context = reactApplicationContext
            
            if (!hasOverlayPermission(context)) {
                promise.reject("OVERLAY_PERMISSION_DENIED", "Overlay permission not granted")
                return
            }
            
            if (!hasRecordAudioPermission(context)) {
                promise.reject("RECORD_AUDIO_PERMISSION_DENIED", "Record audio permission not granted")
                return
            }
            
            if (!isAccessibilityServiceEnabled(context)) {
                promise.reject("ACCESSIBILITY_SERVICE_DISABLED", "Accessibility service not enabled")
                return
            }
            
            FloatingMicService.startService(context)
            promise.resolve("Floating mic service started")
        } catch (e: Exception) {
            promise.reject("SERVICE_START_ERROR", "Failed to start floating mic service: ${e.message}")
        }
    }

    @ReactMethod
    fun startRecording(promise: Promise) {
        try {
            val context = reactApplicationContext
            
            if (!hasRecordAudioPermission(context)) {
                promise.reject("RECORD_AUDIO_PERMISSION_DENIED", "Record audio permission not granted")
                return
            }
            
            // Start recording via broadcast to service
            val intent = Intent("com.typeeasy.START_RECORDING")
            context.sendAppScopedBroadcast(intent)
            promise.resolve("Recording started")
        } catch (e: Exception) {
            promise.reject("RECORDING_START_ERROR", "Failed to start recording: ${e.message}")
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        try {
            val context = reactApplicationContext
            
            // Stop recording via broadcast to service
            val intent = Intent("com.typeeasy.STOP_RECORDING")
            context.sendAppScopedBroadcast(intent)
            promise.resolve("Recording stop requested")
        } catch (e: Exception) {
            promise.reject("RECORDING_STOP_ERROR", "Failed to stop recording: ${e.message}")
        }
    }

    @ReactMethod
    fun stopFloatingMic(promise: Promise) {
        try {
            FloatingMicService.stopService(reactApplicationContext)
            promise.resolve("Floating mic service stopped")
        } catch (e: Exception) {
            promise.reject("SERVICE_STOP_ERROR", "Failed to stop floating mic service: ${e.message}")
        }
    }

    @ReactMethod
    fun isFloatingMicServiceRunning(promise: Promise) {
        try {
            promise.resolve(FloatingMicService.isInstanceRunning)
        } catch (e: Exception) {
            promise.reject("SERVICE_STATE_ERROR", "Failed to read floating mic service state: ${e.message}")
        }
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val context = reactApplicationContext
            val permissions = Arguments.createMap()
            
            permissions.putBoolean("overlay", hasOverlayPermission(context))
            permissions.putBoolean("recordAudio", hasRecordAudioPermission(context))
            permissions.putBoolean("accessibility", isAccessibilityServiceEnabled(context))
            permissions.putBoolean("allGranted", hasAllPermissions(context))
            
            promise.resolve(permissions)
        } catch (e: Exception) {
            promise.reject("PERMISSION_CHECK_ERROR", "Failed to check permissions: ${e.message}")
        }
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve("Overlay settings opened")
        } catch (e: Exception) {
            promise.reject("SETTINGS_OPEN_ERROR", "Failed to open overlay settings: ${e.message}")
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve("Accessibility settings opened")
        } catch (e: Exception) {
            promise.reject("SETTINGS_OPEN_ERROR", "Failed to open accessibility settings: ${e.message}")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for event emitter
    }

    /**
     * Persists floating mic mode and voice API base URL (same host/path prefix as JS buildEasyVoiceUrl("")).
     * Call whenever the user changes Settings or on app launch.
     */
    @ReactMethod
    fun syncFloatingMicSettings(
        internalTranscribe: Boolean,
        voiceBaseUrl: String,
        speechTranslatePath: String,
        sourceLang: String,
        targetLang: String,
        elevenLabsApiKey: String,
        overlayMicEnabled: Boolean,
        overlayTranslationEnabled: Boolean,
        internalFloatingTranslation: Boolean,
        overlayAskQuestionEnabled: Boolean,
        overlayVoiceCommandEnabled: Boolean,
        aiProviderApiKey: String,
        aiChatApiBaseUrl: String,
        aiChatModel: String,
        tavilyApiKey: String,
        promise: Promise,
    ) {
        try {
            FloatingMicConfigStore.applySettings(
                reactApplicationContext,
                internalTranscribe,
                voiceBaseUrl,
                speechTranslatePath,
                sourceLang,
                targetLang,
                elevenLabsApiKey,
                overlayMicEnabled,
                overlayTranslationEnabled,
                internalFloatingTranslation,
                overlayAskQuestionEnabled,
                overlayVoiceCommandEnabled,
                aiProviderApiKey,
                aiChatApiBaseUrl,
                aiChatModel,
                tavilyApiKey,
            )
            reactApplicationContext.sendAppScopedBroadcast(Intent("com.typeeasy.FLOATING_MIC_CONFIG_UPDATED"))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FLOATING_MIC_SYNC_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun injectText(text: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent("com.typeeasy.VOICE_RESULT").apply {
                putExtra("transcribed_text", text)
                putExtra("timestamp", System.currentTimeMillis())
            }
            context.sendAppScopedBroadcast(intent)
            promise.resolve("Text injected successfully")
        } catch (e: Exception) {
            promise.reject("INJECTION_ERROR", "Failed to inject text: ${e.message}")
        }
    }

    /**
     * One-shot speech to text using Android SpeechRecognizer (prefers offline).
     * Resolves with recognized text, or rejects on error.
     *
     * This is intended for in-app mic flows (e.g. Ask Question screen) without requiring the floating overlay service.
     */
    @ReactMethod
    fun startSpeechToText(promise: Promise) {
        try {
            val context = reactApplicationContext
            if (!hasRecordAudioPermission(context)) {
                promise.reject("RECORD_AUDIO_PERMISSION_DENIED", "Record audio permission not granted")
                return
            }
            if (!speechInFlight.compareAndSet(false, true)) {
                promise.reject("SPEECH_BUSY", "Speech recognition is already running")
                return
            }
            if (speechManager == null) {
                speechManager = VoiceSpeechRecognitionManager(context)
            }
            speechManager?.startRecording(
                onResult = { text ->
                    speechInFlight.set(false)
                    promise.resolve(text)
                },
                onError = { msg ->
                    speechInFlight.set(false)
                    promise.reject("SPEECH_ERROR", msg)
                }
            )
        } catch (e: Exception) {
            speechInFlight.set(false)
            promise.reject("SPEECH_START_ERROR", "Failed to start speech recognition: ${e.message}")
        }
    }

    /** Cancel current speech recognition session (best-effort). */
    @ReactMethod
    fun stopSpeechToText(promise: Promise) {
        try {
            speechManager?.stopRecording()
        } catch (_: Exception) {
            // ignore
        } finally {
            speechInFlight.set(false)
            promise.resolve(true)
        }
    }

    /**
     * Best-effort "internal" transcription for an existing audio file, without any backend API.
     *
     * IMPORTANT LIMITATION:
     * Android SpeechRecognizer does not accept an audio file as input.
     * This method plays the file locally and runs offline SpeechRecognizer listening on-device.
     * Results depend on device capabilities, volume, and environment.
     *
     * @param fileUri file:// URI returned by AudioPickerModule
     * @returns recognized text (String)
     */
    @ReactMethod
    fun transcribeAudioFileInternally(fileUri: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            if (!hasRecordAudioPermission(context)) {
                promise.reject("RECORD_AUDIO_PERMISSION_DENIED", "Record audio permission not granted")
                return
            }
            if (fileUri.isBlank()) {
                promise.reject("NO_FILE", "Audio file URI is required")
                return
            }
            if (!fileSpeechInFlight.compareAndSet(false, true)) {
                promise.reject("SPEECH_BUSY", "File transcription is already running")
                return
            }

            val localPath = if (fileUri.startsWith("file://")) fileUri.removePrefix("file://") else fileUri
            val f = File(localPath)
            if (!f.exists() || f.length() <= 0L) {
                fileSpeechInFlight.set(false)
                promise.reject("FILE_MISSING", "Audio file not found or empty: $localPath")
                return
            }

            UiThreadUtil.runOnUiThread {
                try {
                    if (speechManager == null) {
                        speechManager = VoiceSpeechRecognitionManager(context)
                    }

                    // Ensure any prior player is released
                    try {
                        fileMediaPlayer?.stop()
                    } catch (_: Exception) {
                    }
                    try {
                        fileMediaPlayer?.release()
                    } catch (_: Exception) {
                    }
                    fileMediaPlayer = null

                    val mp = MediaPlayer()
                    fileMediaPlayer = mp

                    // Start offline speech recognition first, then play.
                    speechManager?.startRecording(
                        onResult = { text ->
                            try {
                                runCatching { fileMediaPlayer?.stop() }
                                runCatching { fileMediaPlayer?.release() }
                            } finally {
                                fileMediaPlayer = null
                                fileSpeechInFlight.set(false)
                                promise.resolve(text)
                            }
                        },
                        onError = { msg ->
                            try {
                                runCatching { fileMediaPlayer?.stop() }
                                runCatching { fileMediaPlayer?.release() }
                            } finally {
                                fileMediaPlayer = null
                                fileSpeechInFlight.set(false)
                                promise.reject("SPEECH_ERROR", msg)
                            }
                        }
                    )

                    mp.setOnCompletionListener {
                        // Give recognizer a brief moment to finalize results
                        try {
                            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                runCatching { speechManager?.stopRecording() }
                            }, 400L)
                        } catch (_: Exception) {
                        }
                    }

                    mp.setOnErrorListener { _, _, _ ->
                        try {
                            runCatching { speechManager?.stopRecording() }
                        } finally {
                            runCatching { mp.release() }
                            fileMediaPlayer = null
                            fileSpeechInFlight.set(false)
                            promise.reject("PLAYBACK_ERROR", "Failed to play selected audio")
                        }
                        true
                    }

                    mp.setDataSource(context, Uri.fromFile(f))
                    mp.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC)
                    mp.setOnPreparedListener { player ->
                        player.start()
                    }
                    mp.prepareAsync()
                } catch (e: Exception) {
                    try {
                        runCatching { fileMediaPlayer?.release() }
                    } finally {
                        fileMediaPlayer = null
                        fileSpeechInFlight.set(false)
                        promise.reject("SPEECH_START_ERROR", "Failed to transcribe file: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            fileSpeechInFlight.set(false)
            promise.reject("SPEECH_START_ERROR", "Failed to transcribe file: ${e.message}")
        }
    }

    override fun onCatalystInstanceDestroy() {
        try {
            speechManager?.destroy()
        } catch (_: Exception) {
            // ignore
        } finally {
            speechManager = null
            speechInFlight.set(false)
            fileSpeechInFlight.set(false)
            try {
                fileMediaPlayer?.release()
            } catch (_: Exception) {
            } finally {
                fileMediaPlayer = null
            }
        }
        super.onCatalystInstanceDestroy()
    }

    private fun hasOverlayPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
    }

    private fun hasRecordAudioPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == 
                android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val accessibilityManager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        
        val serviceName =
            "${context.packageName}/com.typeeasy.services.MyAccessibilityService"
        return enabledServices?.contains(serviceName) == true || 
               accessibilityManager.getEnabledAccessibilityServiceList(0).any { 
                   it.resolveInfo.serviceInfo.packageName == context.packageName 
               }
    }

    private fun hasAllPermissions(context: Context): Boolean {
        return hasOverlayPermission(context) && 
               hasRecordAudioPermission(context) && 
               isAccessibilityServiceEnabled(context)
    }

    fun saveAudioRecording(audioPath: String) {
        try {
            // This will be called from the service to save audio recording info
            // The actual AsyncStorage saving will be handled in React Native
            sendEventToReactNative("onAudioRecorded", audioPath)
        } catch (e: Exception) {
            // Handle error
        }
    }

    fun sendEventToReactNative(eventName: String, data: String?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("FloatingMic_$eventName", data)
    }
}
