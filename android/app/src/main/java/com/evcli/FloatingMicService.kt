package com.evcli

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.ArrayList

class FloatingMicService : Service() {

    // ─── RECORDING STATE MACHINE ────────────────────────────────────────
    enum class RecordingState {
        IDLE,           // [ MIC ]
        RECORDING,      // [ STOP ]
        STOPPED         // Processing...
    }

    private var recordingState = RecordingState.IDLE
    private var speechRecognizer: SpeechRecognizer? = null
    private var recognitionIntent: Intent? = null
    private var aliveCheckHandler: android.os.Handler? = null
    private var aliveCheckRunnable: Runnable? = null
    
    // ─── INJECTION LOCK ───────────────────────────────────────────────────
    private var isInjecting = false
    
    // ─── UI COMPONENTS ───────────────────────────────────────────────────
    private lateinit var windowManager: WindowManager
    private var floatingView: View? = null
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    
    // ─── BUTTON REFERENCES ─────────────────────────────────────────────
    private var btnMic: ImageView? = null
    private var btnStop: ImageView? = null
    
    // ─── SMART FLOATING MIC CONTROL ────────────────────────────────────────
    private var micControlReceiver: BroadcastReceiver? = null
    private var isOverlayCreated = false
    private var isMicVisible = false
    private var isServiceReady = false

    companion object {
        const val TAG = "FloatingMicService"
        private const val NOTIFICATION_CHANNEL_ID = "floating_mic_channel"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_STOP_SERVICE = "com.evcli.STOP_FLOATING_MIC"
        
        // Smart mic control actions
        const val ACTION_SHOW_MIC = "com.evcli.SHOW_MIC"
        const val ACTION_HIDE_MIC = "com.evcli.HIDE_MIC"
        
        // Recording control actions
        const val ACTION_START_RECORDING = "com.evcli.START_RECORDING"
        const val ACTION_STOP_RECORDING = "com.evcli.STOP_RECORDING"
        
        fun startService(context: Context) {
            val intent = Intent(context, FloatingMicService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, FloatingMicService::class.java)
            context.stopService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        registerMicControlReceiver()
        
        // CRITICAL: Initialize and show floating view immediately
        initializeFloatingView()
        showFloatingOverlay()
        
        isServiceReady = true
        Log.d(TAG, "✅ FloatingMicService created and ready with mic overlay visible")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_SERVICE) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Floating Microphone",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Floating microphone overlay service"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val stopIntent = Intent(this, FloatingMicService::class.java).apply {
            action = ACTION_STOP_SERVICE
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Floating Microphone")
            .setContentText("Tap microphone to start/stop recording")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setSilent(true)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPendingIntent)
            .build()
    }

    private fun initializeFloatingView() {
        if (!hasOverlayPermission()) {
            sendEventToReactNative("onError", "Overlay permission not granted")
            stopSelf()
            return
        }

        try {
            Log.d(TAG, "🔧 Initializing floating view (hidden by default)")
            
            floatingView = LayoutInflater.from(this).inflate(R.layout.floating_mic, null)
            
            // Get button references
            btnMic = floatingView?.findViewById(R.id.btn_mic)
            btnStop = floatingView?.findViewById(R.id.btn_stop)
            
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                },
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = 100
                y = 100
                
                // Additional flags for Android 10+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            }

            windowManager.addView(floatingView, params)
            
            // IMPORTANT: Start with HIDDEN overlay
            floatingView?.visibility = View.GONE
            isMicVisible = false
            isOverlayCreated = true
            
            Log.d(TAG, "✅ Floating view created and hidden successfully")
            setupTouchListener(floatingView!!)
            setupButtonListeners()
            
            // Initialize UI state
            updateUIState()
            
            // Send success event
            sendEventToReactNative("onOverlayCreated", "Floating overlay created successfully (hidden)")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to create floating view", e)
            sendEventToReactNative("onError", "Failed to create floating view: ${e.message}")
            stopSelf()
        }
    }

    private fun setupButtonListeners() {
        btnMic?.setOnClickListener {
            Log.d(TAG, "🎤 Mic Pressed → Starting Speech Recognition")
            startSpeechRecognition()
        }
        
        btnStop?.setOnClickListener {
            Log.d(TAG, "🛑 Stop Pressed → Stopping Speech Recognition")
            stopSpeechRecognition()
        }
    }

    private fun setupTouchListener(view: View) {
        view.setOnTouchListener(object : View.OnTouchListener {
            override fun onTouch(v: View?, event: MotionEvent?): Boolean {
                when (event?.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = (view.layoutParams as WindowManager.LayoutParams).x
                        initialY = (view.layoutParams as WindowManager.LayoutParams).y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        return true
                    }
                    
                    MotionEvent.ACTION_MOVE -> {
                        val params = view.layoutParams as WindowManager.LayoutParams
                        val deltaX = event.rawX - initialTouchX
                        val deltaY = event.rawY - initialTouchY
                        
                        params.x = initialX + deltaX.toInt()
                        params.y = initialY + deltaY.toInt()
                        
                        windowManager.updateViewLayout(view, params)
                        return true
                    }
                    
                    MotionEvent.ACTION_UP -> {
                        val params = view.layoutParams as WindowManager.LayoutParams
                        val screenWidth = resources.displayMetrics.widthPixels
                        val screenHeight = resources.displayMetrics.heightPixels
                        
                        // Snap to edges
                        if (params.x < screenWidth / 2) {
                            params.x = 0
                        } else {
                            params.x = screenWidth - view.width
                        }
                        
                        // Keep within vertical bounds
                        params.y = params.y.coerceIn(0, screenHeight - view.height)
                        
                        windowManager.updateViewLayout(view, params)
                        return true
                    }
                }
                return false
            }
        })
    }

    // ─── SPEECH RECOGNITION METHODS ───────────────────────────────────────

    private fun startSpeechRecognition() {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start speech recognition: Not in IDLE state")
            return
        }
        
        try {
            Log.d(TAG, "🎤 Starting Speech Recognition")
            
            // Reset injection gate for new recording session
            resetInjectionGate()
            
            // Initialize SpeechRecognizer
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            
            // Create recognition intent
            recognitionIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            }
            
            // Set recognition listener
            speechRecognizer?.setRecognitionListener(createRecognitionListener())
            
            // Start listening
            speechRecognizer?.startListening(recognitionIntent)
            
            recordingState = RecordingState.RECORDING
            updateUIState()
            sendEventToReactNative("onRecordingStarted", null)
            showToast("Listening...")
            
            // Start alive check
            startAliveCheck()
            
            Log.d(TAG, "✅ Speech recognition started")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start speech recognition", e)
            sendEventToReactNative("onError", "Failed to start speech recognition: ${e.message}")
            showToast("Failed to start speech recognition")
            resetToIdleState()
        }
    }

    private fun stopSpeechRecognition() {
        if (recordingState != RecordingState.RECORDING) {
            Log.w(TAG, "⚠️ Cannot stop speech recognition: Not in RECORDING state")
            return
        }
        
        Log.d(TAG, "🛑 Stopping Speech Recognition")
        
        try {
            // Stop alive check
            stopAliveCheck()
            
            // Stop speech recognizer
            speechRecognizer?.stopListening()
            
            recordingState = RecordingState.STOPPED
            updateUIState()
            sendEventToReactNative("onRecordingStopped", null)
            showToast("Processing...")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to stop speech recognition", e)
            sendEventToReactNative("onError", "Failed to stop speech recognition: ${e.message}")
            resetToIdleState()
        }
    }

    private fun createRecognitionListener(): RecognitionListener {
        return object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "🎤 Ready for speech")
            }

            override fun onBeginningOfSpeech() {
                Log.d(TAG, "🗣️ Beginning of speech")
            }

            override fun onRmsChanged(rmsdB: Float) {
                // Audio level changed
            }

            override fun onBufferReceived(buffer: ByteArray?) {
                // Audio buffer received
            }

            override fun onEndOfSpeech() {
                Log.d(TAG, "🔚 End of speech")
                // ⚠️ NO INJECTION HERE - only in onResults()
            }

            override fun onError(error: Int) {
                val errorMessage = getErrorMessage(error)
                Log.e(TAG, "❌ Speech recognition error: $errorMessage")
                sendEventToReactNative("onError", errorMessage)
                showToast("Error: $errorMessage")
                // ⚠️ NO INJECTION HERE - only in onResults()
                resetToIdleState()
            }

            override fun onResults(results: Bundle?) {
                // Prevent duplicate injection
                if (isInjecting) return
                isInjecting = true
                
                try {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val spokenText = matches?.getOrNull(0)?.trim() ?: ""
    
                    if (spokenText.isNotEmpty()) {
                        Log.d(TAG, "✅ Speech recognition result: $spokenText")
                        injectText(spokenText)
                        sendEventToReactNative("onTranscriptionComplete", spokenText)
                        showToast("Text injected")
                    } else {
                        Log.w(TAG, "⚠️ No speech recognition results")
                    }
                } finally {
                    isInjecting = false
                    // Reset to IDLE after processing
                    resetToIdleState()
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (matches != null && matches.isNotEmpty()) {
                    val partialText = matches[0]
                    Log.d(TAG, "🔄 Partial result: $partialText")
                    sendEventToReactNative("onPartialResult", partialText)
                }
                // ⚠️ NO INJECTION HERE - only in onResults()
            }

            override fun onEvent(eventType: Int, params: Bundle?) {
                // Handle events if needed
            }
        }
    }

    private fun getErrorMessage(error: Int): String {
        return when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
            SpeechRecognizer.ERROR_NETWORK -> "Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer is busy"
            SpeechRecognizer.ERROR_SERVER -> "Server error"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
            else -> "Unknown recognition error"
        }
    }

    /**
     * Send text to AccessibilityService for injection
     * This is the ONLY place where injection is triggered
     */
    private fun injectText(newText: String) {
        try {
            val intent = Intent("com.evcli.VOICE_RESULT").apply {
                putExtra("transcribed_text", newText)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "💉 Text sent to accessibility service: $newText")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to inject text", e)
        }
    }

    /**
     * Reset injection gate in accessibility service for new recording session
     */
    private fun resetInjectionGate() {
        try {
            val intent = Intent("com.evcli.RESET_INJECTION")
            sendBroadcast(intent)
            Log.d(TAG, "🔄 Injection gate reset for new recording session")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to reset injection gate", e)
        }
    }

    private fun startAliveCheck() {
        aliveCheckHandler = android.os.Handler(android.os.Looper.getMainLooper())
        aliveCheckRunnable = object : Runnable {
            override fun run() {
                if (recordingState == RecordingState.RECORDING) {
                    Log.d(TAG, "🔊 Speech Recognition Active")
                    aliveCheckHandler?.postDelayed(this, 10000) // Log every 10 seconds
                }
            }
        }
        aliveCheckHandler?.post(aliveCheckRunnable!!)
    }

    private fun stopAliveCheck() {
        aliveCheckHandler?.removeCallbacks(aliveCheckRunnable!!)
        aliveCheckRunnable = null
        aliveCheckHandler = null
    }
    
    private fun resetToIdleState() {
        // Stop alive check
        stopAliveCheck()
        
        // Reset injection lock
        isInjecting = false
        
        // Destroy speech recognizer properly
        speechRecognizer?.let { recognizer ->
            try {
                recognizer.stopListening()
                recognizer.cancel()
                recognizer.destroy()
                Log.d(TAG, "✅ SpeechRecognizer destroyed properly")
            } catch (e: Exception) {
                Log.e(TAG, "Error destroying SpeechRecognizer", e)
            }
        }
        speechRecognizer = null
        recognitionIntent = null
        
        // Reset state
        recordingState = RecordingState.IDLE
        updateUIState()
        
        Log.d(TAG, "🔄 Reset to IDLE state - SpeechRecognizer destroyed")
    }
    
    
    // ─── UI STATE MANAGEMENT ───────────────────────────────────────────────

    private fun updateUIState() {
        when (recordingState) {
            RecordingState.IDLE -> {
                btnMic?.visibility = View.VISIBLE
                btnStop?.visibility = View.GONE
            }
            RecordingState.RECORDING -> {
                btnMic?.visibility = View.GONE
                btnStop?.visibility = View.VISIBLE
            }
            RecordingState.STOPPED -> {
                btnMic?.visibility = View.VISIBLE
                btnStop?.visibility = View.GONE
            }
        }
    }

        
    private fun showToast(message: String) {
        try {
            android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "Error showing toast", e)
        }
    }

    private fun hasOverlayPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.provider.Settings.canDrawOverlays(this)
        } else {
            true
        }
    }

    private fun hasRecordAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    private fun sendEventToReactNative(eventName: String, data: String?) {
        try {
            val reactApplication = application as ReactApplication
            val reactContext = reactApplication.reactNativeHost.reactInstanceManager.currentReactContext
            reactContext?.let { context ->
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("FloatingMicService_$eventName", data)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending event to React Native", e)
        }
    }
    
    // ─── SMART FLOATING MIC CONTROL ───────────────────────────────────────────
    
    /**
     * Register broadcast receiver for show/hide mic and recording commands
     */
    private fun registerMicControlReceiver() {
        micControlReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    ACTION_SHOW_MIC -> {
                        Log.d(TAG, "🎤 Received show mic command")
                        showFloatingOverlay()
                    }
                    ACTION_HIDE_MIC -> {
                        Log.d(TAG, "🔇 Received hide mic command")
                        hideFloatingOverlay()
                    }
                    ACTION_START_RECORDING -> {
                        Log.d(TAG, "🎤 Received start recording command")
                        startSpeechRecognition()
                    }
                    ACTION_STOP_RECORDING -> {
                        Log.d(TAG, "🛑 Received stop recording command")
                        stopSpeechRecognition()
                    }
                }
            }
        }
        
        val filter = IntentFilter().apply {
            addAction(ACTION_SHOW_MIC)
            addAction(ACTION_HIDE_MIC)
            addAction(ACTION_START_RECORDING)
            addAction(ACTION_STOP_RECORDING)
        }
        registerReceiver(micControlReceiver, filter)
        Log.d(TAG, "✅ Mic and recording control receiver registered")
    }
    
    /**
     * Show the floating overlay
     */
    private fun showFloatingOverlay() {
        if (!isOverlayCreated) {
            initializeFloatingView()
        }
        
        floatingView?.let { view ->
            if (view.visibility != View.VISIBLE) {
                view.visibility = View.VISIBLE
                isMicVisible = true
                Log.d(TAG, "🎤 Floating mic overlay shown")
            }
        }
    }
    
    /**
     * Hide the floating overlay
     */
    private fun hideFloatingOverlay() {
        floatingView?.let { view ->
            if (view.visibility == View.VISIBLE) {
                view.visibility = View.GONE
                isMicVisible = false
                Log.d(TAG, "🔇 Floating mic overlay hidden")
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        isServiceReady = false
        
        // Stop alive check
        stopAliveCheck()
        
        // Stop speech recognition if active
        if (recordingState == RecordingState.RECORDING) {
            speechRecognizer?.let { recognizer ->
                try {
                    recognizer.destroy()
                    Log.d(TAG, "✅ SpeechRecognizer destroyed (onDestroy)")
                } catch (e: Exception) {
                    Log.e(TAG, "Error destroying SpeechRecognizer (onDestroy)", e)
                }
            }
            speechRecognizer = null
            Log.d(TAG, "✅ SpeechRecognizer nullified (onDestroy)")
        }
        
        // Clean up broadcast receiver
        micControlReceiver?.let { unregisterReceiver(it) }
        
        floatingView?.let { view ->
            try {
                windowManager.removeView(view)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        floatingView = null
        Log.d(TAG, "FloatingMicService destroyed")
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
    }
}
