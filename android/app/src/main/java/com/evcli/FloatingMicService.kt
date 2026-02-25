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
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.evcli.speech.SpeechTranscriptionService
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException

class FloatingMicService : Service() {

    // ─── RECORDING STATE MACHINE ────────────────────────────────────────
    enum class RecordingState {
        IDLE,           // [ MIC ]
        RECORDING,      // [ STOP ] [ PAUSE ]
        PAUSED,         // [ STOP ] [ RESUME ]
        STOPPED         // Transcribing...
    }

    private var recordingState = RecordingState.IDLE
    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var aliveCheckHandler: android.os.Handler? = null
    private var aliveCheckRunnable: Runnable? = null
    
    // ─── UI COMPONENTS ───────────────────────────────────────────────────
    private lateinit var windowManager: WindowManager
    private var floatingView: View? = null
    private var speechTranscriptionService: SpeechTranscriptionService? = null
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    
    // ─── BUTTON REFERENCES ─────────────────────────────────────────────
    private var btnMic: ImageView? = null
    private var btnStop: ImageView? = null
    private var btnPause: ImageView? = null
    private var btnResume: ImageView? = null
    
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
        initializeSpeechTranscriptionService()
        isServiceReady = true
        Log.d(TAG, "✅ FloatingMicService created and ready")
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
            btnPause = floatingView?.findViewById(R.id.btn_pause)
            btnResume = floatingView?.findViewById(R.id.btn_resume)
            
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
            Log.d(TAG, "🎤 Mic Pressed → Recording Started")
            startRecording()
        }
        
        btnStop?.setOnClickListener {
            Log.d(TAG, "🛑 Stop Pressed → Recording Stopped")
            stopRecording()
        }
        
        btnPause?.setOnClickListener {
            Log.d(TAG, "⏸️ Pause Pressed → Recording Paused")
            pauseRecording()
        }
        
        btnResume?.setOnClickListener {
            Log.d(TAG, "▶️ Resume Pressed → Recording Resumed")
            resumeRecording()
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

    // ─── RECORDING STATE MACHINE METHODS ───────────────────────────────────

    private fun startRecording() {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start recording: Not in IDLE state")
            return
        }
        
        try {
            // Reset injection flags first
            resetInjectionFlags()
            
            Log.d(TAG, "🎤 MIC Pressed")
            Log.d(TAG, "🔴 Recorder Started")
            
            // Create audio file
            audioFile = File(cacheDir, "recording_${System.currentTimeMillis()}.3gp")
            
            // Initialize MediaRecorder for audio recording
            mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                setOutputFile(audioFile?.absolutePath)
                
                try {
                    prepare()
                    start()
                } catch (e: IOException) {
                    Log.e(TAG, "❌ Failed to start MediaRecorder", e)
                    release()
                    mediaRecorder = null
                    return
                }
            }
            
            // CRITICAL: Start SpeechRecognizer IMMEDIATELY after recorder starts
            Log.d(TAG, "🎤 Speech Recognizer Started")
            startSpeechRecognizer()
            
            recordingState = RecordingState.RECORDING
            updateUIState()
            sendEventToReactNative("onRecordingStarted", null)
            showToast("Recording started")
            
            // Start alive check logging for verification
            startAliveCheck()
            
            Log.d(TAG, "✅ Recording + Speech Recognition Started Together")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start recording", e)
            sendEventToReactNative("onError", "Failed to start recording: ${e.message}")
            showToast("Failed to start recording")
            resetToIdleState()
        }
    }

    private fun startSpeechRecognizer() {
        try {
            val success = speechTranscriptionService?.startTranscription() ?: false
            if (!success) {
                Log.e(TAG, "❌ Failed to start Speech Recognizer")
                sendEventToReactNative("onError", "Failed to start speech recognition")
            } else {
                Log.d(TAG, "✅ Speech Recognizer Started")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error starting Speech Recognizer", e)
            sendEventToReactNative("onError", "Failed to start speech recognition: ${e.message}")
        }
    }

    private fun stopSpeechRecognizer() {
        try {
            speechTranscriptionService?.stopTranscription()
            Log.d(TAG, "✅ Speech Recognizer Stopped")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error stopping Speech Recognizer", e)
        }
    }

    private fun destroySpeechRecognizer() {
        try {
            speechTranscriptionService?.cancelTranscription()
            Log.d(TAG, "✅ Speech Recognizer Destroyed")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error destroying Speech Recognizer", e)
        }
    }

    private fun pauseRecording() {
        if (recordingState != RecordingState.RECORDING) {
            Log.w(TAG, "⚠️ Cannot pause recording: Not in RECORDING state")
            return
        }
        
        try {
            mediaRecorder?.pause()
            
            // CRITICAL: Pause SpeechRecognizer during pause
            stopSpeechRecognizer()
            
            recordingState = RecordingState.PAUSED
            updateUIState()
            sendEventToReactNative("onRecordingPaused", null)
            showToast("Recording paused")
            
            Log.d(TAG, "⏸️ Recording Paused - Speech Recognition Paused")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to pause recording", e)
            sendEventToReactNative("onError", "Failed to pause recording: ${e.message}")
            showToast("Failed to pause recording")
        }
    }

    private fun resumeRecording() {
        if (recordingState != RecordingState.PAUSED) {
            Log.w(TAG, "⚠️ Cannot resume recording: Not in PAUSED state")
            return
        }
        
        try {
            mediaRecorder?.resume()
            
            // CRITICAL: Resume SpeechRecognizer when recording resumes
            startSpeechRecognizer()
            
            recordingState = RecordingState.RECORDING
            updateUIState()
            sendEventToReactNative("onRecordingResumed", null)
            showToast("Recording resumed")
            
            Log.d(TAG, "▶️ Recording Resumed - Speech Recognition Resumed")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to resume recording", e)
            sendEventToReactNative("onError", "Failed to resume recording: ${e.message}")
            showToast("Failed to resume recording")
        }
    }

    private fun stopRecording() {
        if (recordingState != RecordingState.RECORDING && recordingState != RecordingState.PAUSED) {
            Log.w(TAG, "⚠️ Cannot stop recording: Not in RECORDING or PAUSED state")
            return
        }
        
        Log.d(TAG, "🛑 STOP Pressed")
        
        try {
            // Stop alive check
            stopAliveCheck()
            
            // CRITICAL: Stop SpeechRecognizer FIRST
            Log.d(TAG, "🛑 Speech Recognizer Stopped")
            stopSpeechRecognizer()
            
            // CRITICAL: Destroy SpeechRecognizer
            Log.d(TAG, "🗑️ Speech Recognizer Destroyed")
            destroySpeechRecognizer()
            
            // Stop and release MediaRecorder
            mediaRecorder?.let { recorder ->
                try {
                    recorder.stop()
                    Log.d(TAG, "🛑 Recorder Stopped")
                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping recorder", e)
                }
                
                try {
                    recorder.release()
                    Log.d(TAG, "🗑️ Recorder Released")
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing recorder", e)
                }
            }
            
            // CRITICAL: Set to null to ensure complete termination
            mediaRecorder = null
            Log.d(TAG, "🗑️ Recorder Nullified - Microphone Released")
            
            // CRITICAL: Finalize audio file
            finalizeAudioFile()
            
            recordingState = RecordingState.STOPPED
            updateUIState()
            sendEventToReactNative("onRecordingStopped", null)
            showToast("Recording stopped")
            
            Log.d(TAG, "🔄 Transcription Started")
            
            // CRITICAL: Transcribe recorded audio file AFTER both are stopped
            transcribeRecordedFile()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to stop recording", e)
            sendEventToReactNative("onError", "Failed to stop recording: ${e.message}")
            showToast("Failed to stop recording")
            resetToIdleState()
        }
    }

    private fun startAliveCheck() {
        aliveCheckHandler = android.os.Handler(android.os.Looper.getMainLooper())
        aliveCheckRunnable = object : Runnable {
            override fun run() {
                if (recordingState == RecordingState.RECORDING) {
                    Log.d(TAG, "🔊 Recording Active - Speech Recognition Active")
                    aliveCheckHandler?.postDelayed(this, 10000) // Log every 10 seconds
                } else if (recordingState == RecordingState.PAUSED) {
                    Log.d(TAG, "⏸️ Recording Paused - Speech Recognition Paused")
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

    private fun finalizeAudioFile() {
        audioFile?.let { file ->
            try {
                // Verify file exists and has content
                if (file.exists()) {
                    val fileSize = file.length()
                    Log.d(TAG, "📁 Audio File Finalized: ${file.name}")
                    Log.d(TAG, "📊 File Size: $fileSize bytes")
                    
                    if (fileSize > 0) {
                        Log.d(TAG, "✅ Audio File Ready for Transcription")
                    } else {
                        Log.e(TAG, "❌ Audio File is Empty")
                    }
                } else {
                    Log.e(TAG, "❌ Audio File Not Found After Recording")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error Finalizing Audio File", e)
            }
        } ?: run {
            Log.e(TAG, "❌ Audio File Reference is Null")
        }
    }

    private fun transcribeRecordedFile() {
        Log.d(TAG, "🔄 Transcribing Recorded File...")
        
        audioFile?.let { file ->
            val audioPath = file.absolutePath
            Log.d(TAG, "📁 Audio Path = $audioPath")
            
            // Verify file exists
            if (!file.exists()) {
                Log.e(TAG, "❌ Audio file missing: $audioPath")
                sendEventToReactNative("onError", "Audio file not found")
                resetToIdleState()
                return
            }
            
            // Verify audio size
            val fileSize = file.length()
            Log.d(TAG, "📊 Audio file size = $fileSize bytes")
            
            if (fileSize == 0L) {
                Log.e(TAG, "❌ Audio file is empty: 0 bytes")
                sendEventToReactNative("onError", "Audio file is empty")
                resetToIdleState()
                return
            }
            
            Log.d(TAG, "✅ Audio File Ready")
            
            // CRITICAL: Start SpeechRecognizer AFTER recording is complete
            startFileTranscription(file)
            
        } ?: run {
            Log.e(TAG, "❌ Audio file is null")
            sendEventToReactNative("onError", "Audio file reference is null")
            resetToIdleState()
        }
    }
    
    private fun startFileTranscription(audioFile: File) {
        Log.d(TAG, "🔄 Starting File Transcription...")
        
        try {
            // CRITICAL: Create NEW SpeechRecognizer instance for file transcription
            // This ensures clean separation from live recognition
            val fileTranscriptionService = SpeechTranscriptionService(this)
            
            fileTranscriptionService.setOnTextTranscribed { text ->
                Log.d(TAG, "📝 Transcription Result = $text")
                sendEventToReactNative("onTranscriptionResult", text)
                
                // Inject text
                Log.d(TAG, "💉 Injection Started")
                injectText(text)
                
                // Clean up file transcription service
                fileTranscriptionService.destroy()
                
                // Reset to IDLE state after transcription
                resetToIdleState()
            }
            
            fileTranscriptionService.setOnError { error ->
                Log.e(TAG, "❌ Transcription error: $error")
                sendEventToReactNative("onError", "Transcription failed: $error")
                
                // Clean up file transcription service
                fileTranscriptionService.destroy()
                
                resetToIdleState()
            }
            
            fileTranscriptionService.setOnStateChanged { isTranscribing ->
                Log.d(TAG, "File Transcription state: $isTranscribing")
            }
            
            // Start transcription for the recorded file
            val success = fileTranscriptionService.startTranscription()
            
            if (!success) {
                Log.e(TAG, "❌ Failed to start file transcription service")
                sendEventToReactNative("onError", "Failed to start transcription service")
                fileTranscriptionService.destroy()
                resetToIdleState()
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start file transcription", e)
            sendEventToReactNative("onError", "Failed to start transcription: ${e.message}")
            resetToIdleState()
        }
    }

    private fun injectText(text: String) {
        try {
            val intent = Intent("com.evcli.VOICE_RESULT").apply {
                putExtra("transcribed_text", text)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "✅ Text injected: $text")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to inject text", e)
        }
    }

    private fun resetToIdleState() {
        // Clean up audio file
        audioFile?.let { file ->
            if (file.exists()) {
                file.delete()
            }
        }
        audioFile = null
        
        // Stop alive check
        stopAliveCheck()
        
        // CRITICAL: Ensure SpeechRecognizer is completely stopped
        stopSpeechRecognizer()
        destroySpeechRecognizer()
        
        // Reset state
        recordingState = RecordingState.IDLE
        updateUIState()
        
        Log.d(TAG, "🔄 Reset to IDLE state - Speech Recognition Destroyed")
    }
    
    /**
     * Reset injection flags in AccessibilityService for new recording
     */
    private fun resetInjectionFlags() {
        try {
            val intent = Intent("com.evcli.RESET_INJECTION")
            sendBroadcast(intent)
            Log.d(TAG, "🔄 Sent injection reset broadcast")
        } catch (e: Exception) {
            Log.e(TAG, "Error sending reset broadcast", e)
        }
    }

    // ─── UI STATE MANAGEMENT ───────────────────────────────────────────────

    private fun updateUIState() {
        when (recordingState) {
            RecordingState.IDLE -> {
                btnMic?.visibility = View.VISIBLE
                btnStop?.visibility = View.GONE
                btnPause?.visibility = View.GONE
                btnResume?.visibility = View.GONE
            }
            RecordingState.RECORDING -> {
                btnMic?.visibility = View.GONE
                btnStop?.visibility = View.VISIBLE
                btnPause?.visibility = View.VISIBLE
                btnResume?.visibility = View.GONE
            }
            RecordingState.PAUSED -> {
                btnMic?.visibility = View.GONE
                btnStop?.visibility = View.VISIBLE
                btnPause?.visibility = View.GONE
                btnResume?.visibility = View.VISIBLE
            }
            RecordingState.STOPPED -> {
                btnMic?.visibility = View.GONE
                btnStop?.visibility = View.GONE
                btnPause?.visibility = View.GONE
                btnResume?.visibility = View.GONE
            }
        }
    }

    private fun initializeSpeechTranscriptionService() {
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "❌ RECORD_AUDIO permission not granted")
            sendEventToReactNative("onError", "RECORD_AUDIO permission not granted")
            return
        }

        speechTranscriptionService = SpeechTranscriptionService(this)
        Log.d(TAG, "✅ Speech transcription service initialized")
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
     * Register broadcast receiver for show/hide mic commands
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
                }
            }
        }
        
        val filter = IntentFilter().apply {
            addAction(ACTION_SHOW_MIC)
            addAction(ACTION_HIDE_MIC)
        }
        registerReceiver(micControlReceiver, filter)
        Log.d(TAG, "✅ Mic control receiver registered")
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
        
        // Stop recording if active - CRITICAL: Proper release
        if (recordingState == RecordingState.RECORDING || recordingState == RecordingState.PAUSED) {
            mediaRecorder?.let { recorder ->
                try {
                    recorder.stop()
                    Log.d(TAG, "✅ Recorder Stopped (onDestroy)")
                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping recorder (onDestroy)", e)
                }
                
                try {
                    recorder.release()
                    Log.d(TAG, "✅ Recorder Released (onDestroy)")
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing recorder (onDestroy)", e)
                }
            }
            mediaRecorder = null
            Log.d(TAG, "✅ Recorder Nullified (onDestroy)")
        }
        
        // Clean up broadcast receiver
        micControlReceiver?.let { unregisterReceiver(it) }
        
        speechTranscriptionService?.destroy()
        speechTranscriptionService = null
        
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
        stopSelf()
    }
}
