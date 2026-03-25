package com.typeeasy

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.typeeasy.FloatingMicService
import com.typeeasy.utils.PermissionUtils
import com.typeeasy.speech.SpeechRecognitionManager
import com.typeeasy.services.VoiceKeyboardService
import kotlinx.coroutines.*

/**
 * React Native Bridge Module for Voice Assistant
 * Provides JS interface to control floating overlay and permissions
 */
class VoiceAssistantModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    // Main thread handler and coroutine scope for safe operations
    private val mainHandler = Handler(Looper.getMainLooper())
    private val mainScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // Lazy initialization - NOT created in constructor
    private var speechRecognitionManager: SpeechRecognitionManager? = null
    
    
    override fun getName(): String {
        return "VoiceAssistantModule"
    }
    
    /**
     * Get speech recognition manager - lazy initialization on main thread
     */
    private fun getSpeechRecognitionManager(): SpeechRecognitionManager {
        return speechRecognitionManager ?: SpeechRecognitionManager(reactApplicationContext).also {
            speechRecognitionManager = it
        }
    }
    
    /**
     * Start floating overlay service
     */
    @ReactMethod
    fun startFloatingOverlay(promise: Promise) {
        try {
            val context = reactApplicationContext
            
            if (!PermissionUtils.canDrawOverlays(context)) {
                promise.reject("OVERLAY_PERMISSION_DENIED", "Overlay permission not granted")
                return
            }
            
            if (!PermissionUtils.hasRecordAudioPermission(context)) {
                promise.reject("AUDIO_PERMISSION_DENIED", "Record audio permission not granted")
                return
            }
            
            FloatingMicService.startService(context)
            promise.resolve("Floating overlay started")
            
        } catch (e: Exception) {
            promise.reject("START_ERROR", "Failed to start floating overlay: ${e.message}")
        }
    }
    
    /**
     * Stop floating overlay service
     */
    @ReactMethod
    fun stopFloatingOverlay(promise: Promise) {
        try {
            FloatingMicService.stopService(reactApplicationContext)
            promise.resolve("Floating overlay stopped")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "Failed to stop floating overlay: ${e.message}")
        }
    }
    
    /**
     * Check overlay permission
     */
    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            val hasPermission = PermissionUtils.canDrawOverlays(reactApplicationContext)
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to check overlay permission: ${e.message}")
        }
    }
    
    /**
     * Check accessibility permission
     */
    @ReactMethod
    fun checkAccessibilityPermission(promise: Promise) {
        try {
            val hasPermission = PermissionUtils.isAccessibilityServiceEnabled(reactApplicationContext)
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to check accessibility permission: ${e.message}")
        }
    }
    
    /**
     * Check record audio permission
     */
    @ReactMethod
    fun checkRecordAudioPermission(promise: Promise) {
        try {
            val hasPermission = PermissionUtils.hasRecordAudioPermission(reactApplicationContext)
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to check record audio permission: ${e.message}")
        }
    }
    
    /**
     * Check all permissions
     */
    @ReactMethod
    fun checkAllPermissions(promise: Promise) {
        try {
            val context = reactApplicationContext
            val result = Arguments.createMap()
            
            result.putBoolean("overlay", PermissionUtils.canDrawOverlays(context))
            result.putBoolean("accessibility", PermissionUtils.isAccessibilityServiceEnabled(context))
            result.putBoolean("recordAudio", PermissionUtils.hasRecordAudioPermission(context))
            result.putBoolean("speechRecognition", PermissionUtils.supportsSpeechRecognition(context))
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to check permissions: ${e.message}")
        }
    }
    
    /**
     * Open overlay permission settings
     */
    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            PermissionUtils.openOverlaySettings(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", "Failed to open overlay settings: ${e.message}")
        }
    }
    
    /**
     * Open accessibility settings
     */
    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            PermissionUtils.openAccessibilitySettings(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", "Failed to open accessibility settings: ${e.message}")
        }
    }
    
    /**
     * Get missing permissions
     */
    @ReactMethod
    fun getMissingPermissions(promise: Promise) {
        try {
            val missing = PermissionUtils.getMissingPermissions(reactApplicationContext)
            val result = Arguments.createArray()
            
            missing.forEach { permission ->
                result.pushString(permission)
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to get missing permissions: ${e.message}")
        }
    }
    
    /**
     * Start speech recognition
     */
    @ReactMethod
    fun startSpeechRecognition(promise: Promise) {
        mainScope.launch {
            try {
                val manager = getSpeechRecognitionManager()
                manager.startRecording(
                    onResult = { result ->
                        promise.resolve(result)
                    },
                    onError = { error ->
                        promise.reject("SPEECH_ERROR", error)
                    }
                )
            } catch (e: Exception) {
                promise.reject("START_ERROR", "Failed to start speech recognition: ${e.message}")
            }
        }
    }
    
    /**
     * Stop speech recognition
     */
    @ReactMethod
    fun stopSpeechRecognition(promise: Promise) {
        mainScope.launch {
            try {
                val manager = getSpeechRecognitionManager()
                manager.stopRecording()
                promise.resolve("Speech recognition stopped")
            } catch (e: Exception) {
                promise.reject("STOP_ERROR", "Failed to stop speech recognition: ${e.message}")
            }
        }
    }
    
    /**
     * Check if speech recognition is available
     */
    @ReactMethod
    fun isSpeechRecognitionAvailable(promise: Promise) {
        mainScope.launch {
            try {
                val manager = getSpeechRecognitionManager()
                val isAvailable = SpeechRecognitionManager.isAvailable(reactApplicationContext)
                promise.resolve(isAvailable)
            } catch (e: Exception) {
                promise.reject("CHECK_ERROR", "Failed to check speech recognition: ${e.message}")
            }
        }
    }
    
    /**
     * Dual-Approach Text Injection - Production Grade
     * Tries Voice Keyboard first, then falls back to Accessibility
     */
    @ReactMethod
    fun injectText(text: String, promise: Promise) {
        mainScope.launch {
            try {
                if (text.isEmpty()) {
                    promise.reject("EMPTY_TEXT", "Text cannot be empty")
                    return@launch
                }
                
                android.util.Log.d("VoiceAssistant", "Starting dual-approach text injection: '$text'")
                
                // Method 1: Try Voice Keyboard (most reliable)
                if (VoiceKeyboardService.isActive()) {
                    val keyboardSuccess = VoiceKeyboardService.insertText(text)
                    if (keyboardSuccess) {
                        android.util.Log.d("VoiceAssistant", "✓ Voice Keyboard injection successful")
                        val result = Arguments.createMap()
                        result.putString("status", "success")
                        result.putString("method", "voice_keyboard")
                        result.putString("text", text)
                        promise.resolve(result)
                        return@launch
                    } else {
                        android.util.Log.w("VoiceAssistant", "Voice Keyboard injection failed")
                    }
                } else {
                    android.util.Log.w("VoiceAssistant", "Voice Keyboard not active")
                }
                
                // Method 2: Fall back to Accessibility Service
                val accessibilityIntent = Intent("com.typeeasy.VOICE_RESULT").apply {
                    putExtra("transcribed_text", text)
                    putExtra("timestamp", System.currentTimeMillis())
                }
                reactApplicationContext.sendBroadcast(accessibilityIntent)
                
                android.util.Log.d("VoiceAssistant", "✓ Accessibility fallback triggered")
                val result = Arguments.createMap()
                result.putString("status", "success")
                result.putString("method", "accessibility")
                result.putString("text", text)
                result.putString("fallback", "true")
                promise.resolve(result)
                
            } catch (e: Exception) {
                android.util.Log.e("VoiceAssistant", "Text injection failed", e)
                promise.reject("INJECTION_ERROR", "Failed to inject text: ${e.message}")
            }
        }
    }
    
    /**
     * Check injection method availability
     */
    @ReactMethod
    fun getInjectionMethods(promise: Promise) {
        try {
            val result = Arguments.createMap()
            
            // Voice Keyboard status
            val voiceKeyboardActive = VoiceKeyboardService.isActive()
            result.putBoolean("voiceKeyboard", voiceKeyboardActive)
            
            // Accessibility status (simplified check)
            val accessibilityIntent = Intent("com.typeeasy.VOICE_RESULT")
            val accessibilityAvailable = accessibilityIntent.resolveActivity(reactApplicationContext.packageManager) != null
            result.putBoolean("accessibility", accessibilityAvailable)
            
            // Recommended method
            result.putString("recommended", if (voiceKeyboardActive) "voice_keyboard" else "accessibility")
            
            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("VoiceAssistant", "Error checking injection methods", e)
            promise.reject("METHODS_ERROR", "Failed to check injection methods: ${e.message}")
        }
    }
    
    /**
     * Clean up resources when module is destroyed
     */
    override fun onCatalystInstanceDestroy() {
        mainScope.launch {
            speechRecognitionManager?.destroy()
            speechRecognitionManager = null
            mainScope.cancel()
        }
        super.onCatalystInstanceDestroy()
    }
}
