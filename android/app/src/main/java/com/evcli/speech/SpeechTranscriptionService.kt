package com.evcli.speech

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.*
import java.util.*

class SpeechTranscriptionService(private val context: Context) {
    
    private var speechRecognizer: SpeechRecognizer? = null
    private var isTranscribing = false
    private var onTextTranscribed: ((String) -> Unit)? = null
    private var onError: ((String) -> Unit)? = null
    private var onStateChanged: ((Boolean) -> Unit)? = null
    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    companion object {
        private const val TAG = "SpeechTranscription"
        const val ACTION_VOICE_RESULT = "com.evcli.VOICE_RESULT"
        const val EXTRA_TRANSCRIBED_TEXT = "transcribed_text"
        const val EXTRA_TIMESTAMP = "timestamp"
    }
    
    init {
        initializeSpeechRecognizer()
    }
    
    private fun initializeSpeechRecognizer() {
        try {
            if (SpeechRecognizer.isRecognitionAvailable(context)) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
                Log.d(TAG, "SpeechRecognizer initialized successfully")
            } else {
                Log.e(TAG, "Speech recognition not available on this device")
                onError?.invoke("Speech recognition not available")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize SpeechRecognizer", e)
            onError?.invoke("Failed to initialize speech recognizer")
        }
    }
    
    fun setOnTextTranscribed(callback: (String) -> Unit) {
        onTextTranscribed = callback
    }
    
    fun setOnError(callback: (String) -> Unit) {
        onError = callback
    }
    
    fun setOnStateChanged(callback: (Boolean) -> Unit) {
        onStateChanged = callback
    }
    
    fun startTranscription(): Boolean {
        if (isTranscribing) {
            Log.w(TAG, "Already transcribing")
            return false
        }
        
        val recognizer = speechRecognizer ?: run {
            Log.e(TAG, "SpeechRecognizer not initialized")
            onError?.invoke("Speech recognizer not available")
            return false
        }
        
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.e(TAG, "Speech recognition not available")
            onError?.invoke("Speech recognition not available")
            return false
        }
        
        try {
            recognizer.setRecognitionListener(createRecognitionListener())
            
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                
                // Android 10+ specific optimizations
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    putExtra(RecognizerIntent.EXTRA_SECURE, false)
                }
            }
            
            recognizer.startListening(intent)
            isTranscribing = true
            onStateChanged?.invoke(true)
            
            Log.d(TAG, "Speech transcription started")
            return true
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied for speech recognition", e)
            onError?.invoke("Permission denied for speech recognition")
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start transcription", e)
            onError?.invoke("Failed to start transcription: ${e.message}")
            return false
        }
    }
    
    fun stopTranscription() {
        if (!isTranscribing) {
            return
        }
        
        try {
            speechRecognizer?.stopListening()
            isTranscribing = false
            onStateChanged?.invoke(false)
            Log.d(TAG, "Speech transcription stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping transcription", e)
        }
    }
    
    fun cancelTranscription() {
        if (!isTranscribing) {
            return
        }
        
        try {
            speechRecognizer?.cancel()
            isTranscribing = false
            onStateChanged?.invoke(false)
            Log.d(TAG, "Speech transcription cancelled")
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling transcription", e)
        }
    }
    
    private fun createRecognitionListener(): RecognitionListener {
        return object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "Ready for speech")
            }
            
            override fun onBeginningOfSpeech() {
                Log.d(TAG, "Speech began")
            }
            
            override fun onRmsChanged(rmsdB: Float) {
                // Audio level monitoring - can be used for UI feedback
            }
            
            override fun onBufferReceived(buffer: ByteArray?) {
                // Buffer data - not needed for this implementation
            }
            
            override fun onEndOfSpeech() {
                Log.d(TAG, "Speech ended - but recognition continues for continuous recording")
                // CRITICAL: DO NOT stop recognition here - allow continuous recording
                // This is just for logging purposes
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
                    isTranscribing = false
                    onStateChanged?.invoke(false)
                    onError?.invoke(errorMessage)
                } else {
                    // For non-critical errors, just log but continue recognition
                    Log.w(TAG, "Non-critical error - continuing recognition: $errorMessage")
                }
            }
            
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val transcribedText = matches[0].trim()
                    Log.d(TAG, "Live speech transcribed: $transcribedText")
                    
                    if (transcribedText.isNotEmpty()) {
                        // Send live transcription for immediate feedback
                        sendTranscribedTextToAccessibilityService(transcribedText)
                        
                        // Notify callback for live updates
                        onTextTranscribed?.invoke(transcribedText)
                    } else {
                        Log.w(TAG, "Empty transcription result")
                    }
                } else {
                    Log.w(TAG, "No transcription results")
                }
                
                // CRITICAL: DO NOT stop recognition here - allow continuous recording
                // Remove: isTranscribing = false
                // Remove: onStateChanged?.invoke(false)
                Log.d(TAG, "Recognition continues - continuous recording active")
            }
            
            override fun onPartialResults(partialResults: Bundle?) {
                // Handle partial results for live feedback during continuous recording
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val partialText = matches[0].trim()
                    if (partialText.isNotEmpty()) {
                        Log.d(TAG, "Partial speech: $partialText")
                        // Optionally send partial results for real-time feedback
                    }
                }
            }
            
            override fun onEvent(eventType: Int, params: Bundle?) {
                // Additional events if needed
            }
        }
    }
    
    private fun sendTranscribedTextToAccessibilityService(text: String) {
        try {
            val intent = Intent(ACTION_VOICE_RESULT).apply {
                putExtra(EXTRA_TRANSCRIBED_TEXT, text)
                putExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())
                `package` = context.packageName
            }
            
            context.sendBroadcast(intent)
            Log.d(TAG, "Transcribed text sent to accessibility service: $text")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send transcribed text to accessibility service", e)
        }
    }
    
    fun isCurrentlyTranscribing(): Boolean = isTranscribing
    
    fun isRecognitionAvailable(): Boolean {
        return try {
            SpeechRecognizer.isRecognitionAvailable(context) && speechRecognizer != null
        } catch (e: Exception) {
            false
        }
    }
    
    fun destroy() {
        try {
            serviceScope.cancel()
            cancelTranscription()
            speechRecognizer?.destroy()
            speechRecognizer = null
            Log.d(TAG, "SpeechTranscriptionService destroyed")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        }
    }
}
