package com.typeeasy.services

import android.inputmethodservice.InputMethodService
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.InputConnection
import android.util.Log

/**
 * Voice Keyboard Service - Production-Grade Text Injection
 * Provides reliable text insertion when Accessibility fails
 */
class VoiceKeyboardService : InputMethodService() {
    
    companion object {
        private const val TAG = "VoiceKeyboard"
        var currentInstance: VoiceKeyboardService? = null
        
        /**
         * Public method for text insertion
         */
        fun insertText(text: String): Boolean {
            return currentInstance?.performTextInsertion(text) ?: false
        }
        
        /**
         * Check if keyboard is active
         */
        fun isActive(): Boolean {
            return currentInstance != null
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        currentInstance = this
        Log.d(TAG, "Voice Keyboard Service created")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        currentInstance = null
        Log.d(TAG, "Voice Keyboard Service destroyed")
    }
    
    override fun onCreateInputView(): View? {
        // Return null for invisible keyboard
        // This creates a hidden keyboard that can insert text
        return null
    }
    
    override fun onStartInputView(editorInfo: android.view.inputmethod.EditorInfo, restarting: Boolean) {
        super.onStartInputView(editorInfo, restarting)
        Log.d(TAG, "Keyboard input view started")
    }
    
    /**
     * Core text insertion method
     */
    private fun performTextInsertion(text: String): Boolean {
        return try {
            val inputConnection = currentInputConnection
            if (inputConnection != null) {
                Log.d(TAG, "Inserting text via IME: '$text'")
                
                // Method 1: commitText (most reliable)
                val result1 = inputConnection.commitText(text, 1)
                
                // Method 2: Send key events as fallback
                if (!result1) {
                    Log.w(TAG, "commitText failed, trying key events")
                    sendTextViaKeyEvents(text)
                }
                
                Log.d(TAG, "Text insertion completed")
                true
            } else {
                Log.w(TAG, "No input connection available")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during text insertion", e)
            false
        }
    }
    
    /**
     * Fallback method using key events
     */
    private fun sendTextViaKeyEvents(text: String) {
        val inputConnection = currentInputConnection ?: return
        
        for (char in text) {
            val keyCode = when (char) {
                ' ' -> KeyEvent.KEYCODE_SPACE
                '\n' -> KeyEvent.KEYCODE_ENTER
                in '0'..'9' -> KeyEvent.KEYCODE_0 + (char - '0')
                in 'a'..'z' -> KeyEvent.KEYCODE_A + (char - 'a')
                in 'A'..'Z' -> {
                    // Send SHIFT + letter
                    inputConnection.sendKeyEvent(
                        KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SHIFT_LEFT)
                    )
                    val keyEvent = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_A + (char - 'A'))
                    inputConnection.sendKeyEvent(keyEvent)
                    inputConnection.sendKeyEvent(
                        KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SHIFT_LEFT)
                    )
                    continue
                }
                else -> {
                    // Handle special characters
                    inputConnection.commitText(char.toString(), 1)
                    continue
                }
            }
            
            val downEvent = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
            val upEvent = KeyEvent(KeyEvent.ACTION_UP, keyCode)
            inputConnection.sendKeyEvent(downEvent)
            inputConnection.sendKeyEvent(upEvent)
        }
    }
    
    /**
     * Handle back key to hide keyboard
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            hideKeyboard()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
    
    /**
     * Hide keyboard programmatically
     */
    private fun hideKeyboard() {
        requestHideSelf(0)
        Log.d(TAG, "Keyboard hidden")
    }
}
