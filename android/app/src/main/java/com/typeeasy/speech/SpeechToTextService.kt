package com.typeeasy.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.*

class SpeechToTextService(private val context: Context) {
    
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var onTextRecognized: ((String) -> Unit)? = null
    private var onPartialResult: ((String) -> Unit)? = null
    private var onError: ((String) -> Unit)? = null
    private var onListeningStateChanged: ((Boolean) -> Unit)? = null
    
    companion object {
        private const val TAG = "SpeechToTextService"
    }
    
    init {
        initializeSpeechRecognizer()
    }
    
    private fun initializeSpeechRecognizer() {
        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
            Log.d(TAG, "SpeechRecognizer initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize SpeechRecognizer", e)
            onError?.invoke("Failed to initialize speech recognizer: ${e.message}")
        }
    }
    
    fun setOnTextRecognized(callback: (String) -> Unit) {
        onTextRecognized = callback
    }
    
    fun setOnPartialResult(callback: (String) -> Unit) {
        onPartialResult = callback
    }
    
    fun setOnError(callback: (String) -> Unit) {
        onError = callback
    }
    
    fun setOnListeningStateChanged(callback: (Boolean) -> Unit) {
        onListeningStateChanged = callback
    }
    
    fun startListening() {
        if (isListening) {
            Log.w(TAG, "Already listening, ignoring request")
            return
        }
        
        val recognizer = speechRecognizer ?: run {
            Log.e(TAG, "SpeechRecognizer is null")
            onError?.invoke("Speech recognizer not initialized")
            return
        }
        
        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, java.util.Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            }
            
            recognizer.setRecognitionListener(createRecognitionListener())
            recognizer.startListening(intent)
            
            isListening = true
            onListeningStateChanged?.invoke(true)
            
            Log.d(TAG, "Started speech recognition")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start speech recognition", e)
            onError?.invoke("Failed to start speech recognition: ${e.message}")
        }
    }
    
    fun stopListening() {
        if (!isListening) {
            Log.w(TAG, "Not listening, ignoring stop request")
            return
        }
        
        speechRecognizer?.let { recognizer ->
            try {
                recognizer.stopListening()
                isListening = false
                onListeningStateChanged?.invoke(false)
                Log.d(TAG, "Stopped speech recognition")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop speech recognition", e)
                onError?.invoke("Failed to stop speech recognition: ${e.message}")
            }
        }
    }
    
    fun destroy() {
        try {
            speechRecognizer?.let { recognizer ->
                if (isListening) {
                    recognizer.stopListening()
                }
                recognizer.destroy()
            }
            speechRecognizer = null
            isListening = false
            Log.d(TAG, "SpeechToTextService destroyed")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        }
    }
    
    private fun createRecognitionListener(): RecognitionListener {
        return object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "Ready for speech")
            }
            
            override fun onBeginningOfSpeech() {
                Log.d(TAG, "Speech started")
            }
            
            override fun onRmsChanged(rmsdB: Float) {
                // Audio level monitoring if needed
            }
            
            override fun onBufferReceived(buffer: ByteArray?) {
                // Buffer data if needed
            }
            
            override fun onEndOfSpeech() {
                Log.d(TAG, "Speech ended - but recognition continues for continuous recording")
                // CRITICAL: DO NOT stop recognition here - allow continuous recording
            }
            
            override fun onError(error: Int) {
                val errorMessage = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                    SpeechRecognizer.ERROR_CLIENT -> "Client side error"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                    SpeechRecognizer.ERROR_NETWORK -> "Network error"
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                    SpeechRecognizer.ERROR_NO_MATCH -> "No speech match found"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                    SpeechRecognizer.ERROR_SERVER -> "Server error"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                    else -> "Unknown error ($error)"
                }
                
                Log.e(TAG, "Speech recognition error: $errorMessage")
                
                // CRITICAL: Do NOT stop recognition on most errors - allow continuous recording
                // Only stop on critical errors that prevent any further recognition
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS || 
                    error == SpeechRecognizer.ERROR_AUDIO) {
                    isListening = false
                    onListeningStateChanged?.invoke(false)
                    onError?.invoke(errorMessage)
                } else {
                    // For non-critical errors, just log but continue recognition
                    Log.w(TAG, "Non-critical error - continuing recognition: $errorMessage")
                }
            }
            
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val recognizedText = matches[0].trim()
                    Log.d(TAG, "Live speech recognized: $recognizedText")
                    
                    if (recognizedText.isNotEmpty()) {
                        sendToAccessibilityService(recognizedText)
                        onTextRecognized?.invoke(recognizedText)
                    } else {
                        Log.w(TAG, "No speech recognition results")
                    }
                } else {
                    Log.w(TAG, "No speech recognition results")
                }
                
                // CRITICAL: DO NOT stop recognition here - allow continuous recording
                // Remove: isListening = false
                // Remove: onListeningStateChanged?.invoke(false)
                Log.d(TAG, "Recognition continues - continuous recording active")
            }
            
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val partialText = matches[0].trim()
                    if (partialText.isNotEmpty()) {
                        Log.d(TAG, "Partial speech: $partialText")
                        onPartialResult?.invoke(partialText)
                    }
                }
            }
            
            override fun onEvent(eventType: Int, params: Bundle?) {
                // Handle additional events if needed
            }
        }
    }
    
    private fun sendToAccessibilityService(text: String) {
        try {
            val intent = Intent("com.typeeasy.INSERT_TEXT").apply {
                putExtra("text", text)
                putExtra("timestamp", System.currentTimeMillis())
            }
            context.sendBroadcast(intent)
            Log.d(TAG, "Sent text to accessibility service: $text")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send text to accessibility service", e)
        }
    }
    
    fun isCurrentlyListening(): Boolean = isListening
}
