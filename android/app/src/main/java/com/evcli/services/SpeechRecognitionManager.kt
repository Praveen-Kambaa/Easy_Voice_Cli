package com.evcli.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.speech.RecognizerIntent
import java.util.*
import kotlinx.coroutines.*

/**
 * Speech Recognition Manager
 * Handles Android SpeechRecognizer API for offline speech-to-text
 * Provides safe lifecycle management and silence detection
 */
class VoiceSpeechRecognitionManager(private val context: Context) {
    
    private var speechRecognizer: SpeechRecognizer? = null
    private var isRecording = false
    private var onResultCallback: ((String) -> Unit)? = null
    private var errorHandler: ((String) -> Unit)? = null
    
    // Main thread handler and coroutine scope
    private val mainHandler = Handler(Looper.getMainLooper())
    private val mainScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // Silence detection
    private val handler = Handler(Looper.getMainLooper())
    private var silenceTimeoutRunnable: Runnable? = null
    private val SILENCE_TIMEOUT_MS = 3000L // 3 seconds
    
    companion object {
        private const val TAG = "VoiceSpeechRecognitionManager"
        
        // Check if speech recognition is available
        fun isAvailable(context: Context): Boolean {
            return SpeechRecognizer.isRecognitionAvailable(context)
        }
    }
    
    init {
        // Initialize on main thread
        mainHandler.post {
            initializeSpeechRecognizer()
        }
    }
    
    /**
     * Initialize SpeechRecognizer with proper configuration
     */
    private fun initializeSpeechRecognizer() {
        if (isAvailable(context)) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
            speechRecognizer?.setRecognitionListener(createRecognitionListener())
        }
    }
    
    /**
     * Ensure SpeechRecognizer is initialized on main thread
     */
    private fun ensureInitialized() {
        if (speechRecognizer == null) {
            initializeSpeechRecognizer()
        }
    }
    
    /**
     * Create recognition listener for handling speech events
     */
    private fun createRecognitionListener(): RecognitionListener {
        return object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                // Speech recognition is ready to start
                resetSilenceTimeout()
            }
            
            override fun onBeginningOfSpeech() {
                // User started speaking
                resetSilenceTimeout()
            }
            
            override fun onRmsChanged(rmsdB: Float) {
                // Audio level changed - user is speaking
                resetSilenceTimeout()
            }
            
            override fun onBufferReceived(buffer: ByteArray?) {
                // Audio buffer received
            }
            
            override fun onEndOfSpeech() {
                // User stopped speaking
                startSilenceTimeout()
            }
            
            override fun onError(error: Int) {
                // Handle recognition errors
                val errorMessage = getErrorMessage(error)
                errorHandler?.invoke(errorMessage)
                stopRecording()
            }
            
            override fun onResults(results: Bundle?) {
                // Handle recognition results
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val bestMatch = matches[0]
                    onResultCallback?.invoke(bestMatch ?: "")
                }
                stopRecording()
            }
            
            override fun onPartialResults(partialResults: Bundle?) {
                // Handle partial results (optional)
                resetSilenceTimeout()
            }
            
            override fun onEvent(eventType: Int, params: Bundle?) {
                // Handle other events
            }
        }
    }
    
    /**
     * Start speech recognition
     */
    fun startRecording(onResult: (String) -> Unit, onError: (String) -> Unit = {}) {
        mainScope.launch {
            if (!isAvailable(context)) {
                onError("Speech recognition not available on this device")
                return@launch
            }
            
            if (isRecording) {
                return@launch // Already recording
            }
            
            onResultCallback = onResult
            errorHandler = onError
            
            try {
                // Ensure recognizer is initialized on main thread
                ensureInitialized()
                
                // Create recognition intent with offline preferences
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true) // Prefer offline recognition
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                }
                
                speechRecognizer?.startListening(intent)
                isRecording = true
                
            } catch (e: Exception) {
                onError("Failed to start speech recognition: ${e.message}")
            }
        }
    }
    
    /**
     * Stop speech recognition
     */
    fun stopRecording() {
        mainScope.launch {
            if (!isRecording) {
                return@launch
            }
            
            try {
                speechRecognizer?.stopListening()
                cancelSilenceTimeout()
                isRecording = false
            } catch (e: Exception) {
                // Handle stop error
            }
        }
    }
    
    /**
     * Check if currently recording
     */
    fun isRecording(): Boolean = isRecording
    
    /**
     * Destroy speech recognizer and clean up resources
     */
    fun destroy() {
        mainScope.launch {
            try {
                stopRecording()
                speechRecognizer?.destroy()
                speechRecognizer = null
                cancelSilenceTimeout()
                mainScope.cancel()
            } catch (e: Exception) {
                // Handle destroy error
            }
        }
    }
    
    /**
     * Reset silence timeout when user speaks
     */
    private fun resetSilenceTimeout() {
        cancelSilenceTimeout()
        startSilenceTimeout()
    }
    
    /**
     * Start silence timeout detection
     */
    private fun startSilenceTimeout() {
        silenceTimeoutRunnable = Runnable {
            // Auto-stop recording after silence
            if (isRecording) {
                stopRecording()
            }
        }
        handler.postDelayed(silenceTimeoutRunnable!!, SILENCE_TIMEOUT_MS)
    }
    
    /**
     * Cancel silence timeout
     */
    private fun cancelSilenceTimeout() {
        silenceTimeoutRunnable?.let { runnable ->
            handler.removeCallbacks(runnable)
            silenceTimeoutRunnable = null
        }
    }
    
    /**
     * Get human-readable error message
     */
    private fun getErrorMessage(errorCode: Int): String {
        return when (errorCode) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
            SpeechRecognizer.ERROR_NETWORK -> "Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer is busy"
            SpeechRecognizer.ERROR_SERVER -> "Server error"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
            else -> "Unknown recognition error: $errorCode"
        }
    }
}
