package com.evcli

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class FloatingMicModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

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
            val intent = Intent("com.evcli.START_RECORDING")
            context.sendBroadcast(intent)
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
            val intent = Intent("com.evcli.STOP_RECORDING")
            context.sendBroadcast(intent)
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

    @ReactMethod
    fun injectText(text: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent("com.evcli.VOICE_RESULT").apply {
                putExtra("transcribed_text", text)
                putExtra("timestamp", System.currentTimeMillis())
            }
            context.sendBroadcast(intent)
            promise.resolve("Text injected successfully")
        } catch (e: Exception) {
            promise.reject("INJECTION_ERROR", "Failed to inject text: ${e.message}")
        }
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
        
        val serviceName = "${context.packageName}/${context.packageName}.MyAccessibilityService"
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
