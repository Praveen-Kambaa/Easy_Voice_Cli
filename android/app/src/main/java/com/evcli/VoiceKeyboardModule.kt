package com.evcli

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.evcli.services.VoiceKeyboardService
import android.util.Log

/**
 * Voice Keyboard Module - React Native Bridge
 * Provides API for keyboard management and text insertion
 */
class VoiceKeyboardModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "VoiceKeyboardModule"
        private const val VOICE_KEYBOARD_PACKAGE = "com.evcli.services.VoiceKeyboardService"
    }
    
    override fun getName(): String {
        return "VoiceKeyboard"
    }
    
    /**
     * Insert text using Voice Keyboard
     */
    @ReactMethod
    fun insertText(text: String, promise: Promise) {
        try {
            if (text.isEmpty()) {
                promise.reject("EMPTY_TEXT", "Text cannot be empty")
                return
            }
            
            val success = VoiceKeyboardService.insertText(text)
            
            if (success) {
                Log.d(TAG, "Text inserted successfully: '$text'")
                val result = Arguments.createMap()
                result.putString("status", "success")
                result.putString("method", "ime")
                result.putString("text", text)
                promise.resolve(result)
            } else {
                Log.w(TAG, "Text insertion failed, keyboard not active")
                val result = Arguments.createMap()
                result.putString("status", "failed")
                result.putString("reason", "keyboard_not_active")
                result.putString("message", "Voice Keyboard not selected")
                promise.resolve(result)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error inserting text", e)
            promise.reject("INSERTION_ERROR", "Failed to insert text: ${e.message}")
        }
    }
    
    /**
     * Check if Voice Keyboard is active
     */
    @ReactMethod
    fun isActive(promise: Promise) {
        try {
            val isActive = VoiceKeyboardService.isActive()
            val isCurrentKeyboard = isCurrentKeyboardVoiceKeyboard()
            
            val result = Arguments.createMap()
            result.putBoolean("active", isActive)
            result.putBoolean("current", isCurrentKeyboard)
            result.putString("status", if (isCurrentKeyboard) "selected" else "not_selected")
            
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking keyboard status", e)
            promise.reject("STATUS_ERROR", "Failed to check keyboard status: ${e.message}")
        }
    }
    
    /**
     * Open keyboard settings
     */
    @ReactMethod
    fun openKeyboardSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            
            Log.d(TAG, "Opened keyboard settings")
            val result = Arguments.createMap()
            result.putString("status", "opened")
            result.putString("message", "Keyboard settings opened")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening keyboard settings", e)
            promise.reject("SETTINGS_ERROR", "Failed to open keyboard settings: ${e.message}")
        }
    }
    
    /**
     * Show keyboard selection dialog
     */
    @ReactMethod
    fun showKeyboardSelector(promise: Promise) {
        try {
            val imm = reactApplicationContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
            
            Log.d(TAG, "Showed keyboard picker")
            val result = Arguments.createMap()
            result.putString("status", "shown")
            result.putString("message", "Keyboard selector shown")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing keyboard selector", e)
            promise.reject("SELECTOR_ERROR", "Failed to show keyboard selector: ${e.message}")
        }
    }
    
    /**
     * Get available keyboards
     */
    @ReactMethod
    fun getAvailableKeyboards(promise: Promise) {
        try {
            val imm = reactApplicationContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            val inputMethodList = imm.inputMethodList
            
            val keyboards = Arguments.createArray()
            
            for (inputMethod in inputMethodList) {
                val keyboard = Arguments.createMap()
                keyboard.putString("id", inputMethod.id)
                keyboard.putString("packageName", inputMethod.packageName)
                keyboard.putString("serviceName", inputMethod.serviceName)
                keyboard.putString("label", inputMethod.loadLabel(reactApplicationContext.packageManager).toString())
                keyboard.putBoolean("isVoiceKeyboard", inputMethod.id.contains("VoiceKeyboard"))
                keyboards.pushMap(keyboard)
            }
            
            val result = Arguments.createMap()
            result.putArray("keyboards", keyboards)
            result.putInt("count", keyboards.size())
            
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting available keyboards", e)
            promise.reject("KEYBOARDS_ERROR", "Failed to get keyboards: ${e.message}")
        }
    }
    
    /**
     * Check if current keyboard is Voice Keyboard
     */
    private fun isCurrentKeyboardVoiceKeyboard(): Boolean {
        return try {
            val imm = reactApplicationContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            val currentInputMethodId = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD
            )
            currentInputMethodId?.contains("VoiceKeyboard") == true
        } catch (e: Exception) {
            Log.e(TAG, "Error checking current keyboard", e)
            false
        }
    }
    
    /**
     * Get current keyboard info
     */
    @ReactMethod
    fun getCurrentKeyboard(promise: Promise) {
        try {
            val imm = reactApplicationContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            val currentInputMethodId = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD
            )
            
            val result = Arguments.createMap()
            result.putString("id", currentInputMethodId ?: "")
            result.putBoolean("isVoiceKeyboard", currentInputMethodId?.contains("VoiceKeyboard") == true)
            
            // Find keyboard details
            val inputMethods = imm.inputMethodList
            inputMethods?.forEach { inputMethod ->
                if (inputMethod.id == currentInputMethodId) {
                    result.putString("packageName", inputMethod.packageName)
                    result.putString("serviceName", inputMethod.serviceName)
                    result.putString("label", inputMethod.loadLabel(reactApplicationContext.packageManager).toString())
                }
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting current keyboard", e)
            promise.reject("CURRENT_KEYBOARD_ERROR", "Failed to get current keyboard: ${e.message}")
        }
    }
}
