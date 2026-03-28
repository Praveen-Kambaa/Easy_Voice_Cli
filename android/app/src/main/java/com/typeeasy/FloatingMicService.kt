package com.typeeasy

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
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.core.app.NotificationCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.File
import java.util.ArrayList
import java.util.Locale
import kotlin.math.roundToInt

class FloatingMicService : Service() {

    // ─── RECORDING STATE MACHINE ────────────────────────────────────────
    enum class RecordingState {
        IDLE,           // [ MIC ]
        RECORDING,      // [ STOP ]
        STOPPED         // Processing...
    }

    private enum class SessionMode {
        MIC,
        TRANSLATOR,
        /** Voice (English) → AI provider → inject assistant reply (no ML Kit on answer) */
        ASK,
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
    private var statusIndicatorContainer: View? = null
    private var soundWaveView: SoundWaveOverlayView? = null
    private var uploadProgress: ProgressBar? = null
    private var actionMenuPanel: View? = null
    private var btnActionMicrophone: ImageView? = null
    private var btnActionTranslator: ImageView? = null
    private var actionMenuDivider: View? = null
    private var actionMenuDividerAsk: View? = null
    private var btnActionAsk: ImageView? = null
    private var actionMenuVisible = false
    private var lastImeInsetBottom = 0

    /** Cloud mode: raw mic capture + OkHttp upload to /voice/transcribe */
    private var mediaRecorder: MediaRecorder? = null
    private var externalAudioFile: File? = null
    private var isExternalUploading = false
    /** AI chat after English STT for Ask mode (no post-translate on the answer) */
    private var isAskProcessing = false
    private val mainHandler = Handler(Looper.getMainLooper())
    /** For Microphone mode only: internal SpeechRecognizer vs cloud transcribe. */
    private var sessionUsesInternalTranscription = true
    private var sessionMode = SessionMode.MIC

    // ─── SMART FLOATING MIC CONTROL ────────────────────────────────────────
    private var micControlReceiver: BroadcastReceiver? = null
    private var isOverlayCreated = false
    private var isMicVisible = false
    private var isServiceReady = false

    companion object {
        const val TAG = "FloatingMicService"
        private const val NOTIFICATION_CHANNEL_ID = "floating_mic_channel"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_STOP_SERVICE = "com.typeeasy.STOP_FLOATING_MIC"
        
        // Smart mic control actions
        const val ACTION_SHOW_MIC = "com.typeeasy.SHOW_MIC"
        const val ACTION_HIDE_MIC = "com.typeeasy.HIDE_MIC"
        
        // Recording control actions
        const val ACTION_START_RECORDING = "com.typeeasy.START_RECORDING"
        const val ACTION_STOP_RECORDING = "com.typeeasy.STOP_RECORDING"
        const val ACTION_CONFIG_UPDATED = "com.typeeasy.FLOATING_MIC_CONFIG_UPDATED"
        
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
            statusIndicatorContainer = floatingView?.findViewById(R.id.status_indicator_container)
            soundWaveView = floatingView?.findViewById(R.id.sound_wave_view)
            uploadProgress = floatingView?.findViewById(R.id.upload_progress)
            actionMenuPanel = floatingView?.findViewById(R.id.action_menu_panel)
            btnActionMicrophone = floatingView?.findViewById(R.id.btn_action_microphone)
            btnActionTranslator = floatingView?.findViewById(R.id.btn_action_translator)
            actionMenuDivider = floatingView?.findViewById(R.id.action_menu_divider)
            actionMenuDividerAsk = floatingView?.findViewById(R.id.action_menu_divider_ask)
            btnActionAsk = floatingView?.findViewById(R.id.btn_action_ask)
            
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
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
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

            floatingView?.let { root ->
                ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
                    lastImeInsetBottom =
                        insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                    insets
                }
                ViewCompat.requestApplyInsets(root)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    root.elevation = 24f * resources.displayMetrics.density
                }
            }

            // IMPORTANT: Start with HIDDEN overlay
            floatingView?.visibility = View.GONE
            isMicVisible = false
            isOverlayCreated = true
            
            Log.d(TAG, "✅ Floating view created and hidden successfully")
            val root = floatingView!!
            setupTouchListener(root)
            setupMenuListeners()
            
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

    private fun setupMenuListeners() {
        btnActionMicrophone?.setOnClickListener {
            beginMicrophoneCapture()
        }
        btnActionTranslator?.setOnClickListener {
            beginTranslatorCapture()
        }
        btnActionAsk?.setOnClickListener {
            beginAskQuestionCapture()
        }
    }

    private fun useInternalTranscription(): Boolean =
        FloatingMicConfigStore.isInternalTranscribeEnabled(this)

    private fun showActionMenu() {
        actionMenuPanel?.visibility = View.VISIBLE
        actionMenuVisible = true
    }

    private fun hideActionMenu() {
        actionMenuPanel?.visibility = View.GONE
        actionMenuVisible = false
    }

    private fun overlayMicOn(): Boolean =
        FloatingMicConfigStore.isOverlayMicEnabled(this)

    private fun overlayTranslationOn(): Boolean =
        FloatingMicConfigStore.isOverlayTranslationEnabled(this)

    private fun overlayAskOn(): Boolean =
        FloatingMicConfigStore.isOverlayAskQuestionEnabled(this)

    private fun overlayEnabledActionCount(): Int {
        var n = 0
        if (overlayMicOn()) n++
        if (overlayTranslationOn()) n++
        if (overlayAskOn()) n++
        return n
    }

    /**
     * When idle: FAB icon + which rows appear in the pop-up (when more than one action is on).
     */
    private fun applyIdleOverlayAppearance() {
        if (recordingState != RecordingState.IDLE) return
        val micOn = overlayMicOn()
        val transOn = overlayTranslationOn()
        val askOn = overlayAskOn()
        btnActionMicrophone?.visibility = if (micOn) View.VISIBLE else View.GONE
        btnActionTranslator?.visibility = if (transOn) View.VISIBLE else View.GONE
        btnActionAsk?.visibility = if (askOn) View.VISIBLE else View.GONE
        // Dividers between consecutive visible rows
        actionMenuDivider?.visibility = if (micOn && transOn) View.VISIBLE else View.GONE
        val showDividerBeforeAsk = askOn && (micOn || transOn)
        actionMenuDividerAsk?.visibility = if (showDividerBeforeAsk) View.VISIBLE else View.GONE
        when {
            overlayEnabledActionCount() >= 2 -> btnMic?.setImageResource(R.drawable.floating_main_icon)
            micOn -> btnMic?.setImageResource(R.drawable.ic_floating_menu_mic)
            transOn -> btnMic?.setImageResource(R.drawable.ic_floating_menu_translate)
            askOn -> btnMic?.setImageResource(R.drawable.ic_floating_menu_ask)
            else -> btnMic?.setImageResource(R.drawable.ic_floating_menu_mic)
        }
    }

    private fun showOrToggleActionMenu() {
        if (recordingState != RecordingState.IDLE) return
        if (overlayEnabledActionCount() <= 1) {
            hideActionMenu()
            return
        }
        if (actionMenuVisible) hideActionMenu() else showActionMenu()
    }

    /** Microphone row: respects Internal Transcribe (device vs /voice/transcribe). */
    private fun beginMicrophoneCapture() {
        hideActionMenu()
        sessionMode = SessionMode.MIC
        sessionUsesInternalTranscription = useInternalTranscription()
        if (sessionUsesInternalTranscription) {
            startSpeechRecognition()
        } else {
            startExternalRecording()
        }
    }

    /**
     * Translator row: server /speech-translate upload, OR on-device SpeechRecognizer + ML Kit
     * when [FloatingMicConfigStore.isInternalFloatingTranslationEnabled].
     */
    private fun beginTranslatorCapture() {
        hideActionMenu()
        sessionMode = SessionMode.TRANSLATOR
        if (FloatingMicConfigStore.isInternalFloatingTranslationEnabled(this)) {
            sessionUsesInternalTranscription = true
            startSpeechRecognitionForTranslate()
        } else {
            sessionUsesInternalTranscription = false
            startTranslatorRecording()
        }
    }

    /** Ask: English STT → AI provider → inject assistant text as-is. */
    private fun beginAskQuestionCapture() {
        hideActionMenu()
        sessionMode = SessionMode.ASK
        sessionUsesInternalTranscription = true
        startSpeechRecognitionForAsk()
    }

    private fun stopVoiceCapture() {
        when {
            recordingState != RecordingState.RECORDING -> return
            sessionUsesInternalTranscription -> stopSpeechRecognition()
            mediaRecorder != null -> stopMediaAndUpload()
            else -> Log.w(TAG, "stopVoiceCapture: no active media session")
        }
    }

    /**
     * Long-press (~1s) then drag to move the overlay. Short tap on mic/stop opens menu or stops.
     * Listener is attached to the overlay root (padding), [btnMic], and [btnStop] so touches on the
     * FAB are not lost (root FrameLayout does not receive events that children consume).
     */
    private fun setupTouchListener(overlayRoot: View) {
        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        val longPressTimeoutMs = 1000L
        // Require a deliberate move to cancel the long-press timer (finger jitter was killing drag).
        val cancelLongPressDistSq = (touchSlop * 5) * (touchSlop * 5)

        val dragListener = object : View.OnTouchListener {
            private var isLongPressActive = false
            private var dragStarted = false

            private val longPressRunnable = Runnable {
                isLongPressActive = true
                overlayRoot.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                Log.d(TAG, "Floating overlay: move mode (long-press ${longPressTimeoutMs}ms)")
            }

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                val params = overlayRoot.layoutParams as WindowManager.LayoutParams

                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        isLongPressActive = false
                        dragStarted = false
                        mainHandler.removeCallbacks(longPressRunnable)
                        mainHandler.postDelayed(longPressRunnable, longPressTimeoutMs)
                        return true
                    }

                    MotionEvent.ACTION_MOVE -> {
                        val deltaX = event.rawX - initialTouchX
                        val deltaY = event.rawY - initialTouchY
                        val distSq = deltaX * deltaX + deltaY * deltaY

                        if (!isLongPressActive && distSq > cancelLongPressDistSq) {
                            mainHandler.removeCallbacks(longPressRunnable)
                        }

                        if (isLongPressActive) {
                            dragStarted = true
                            params.x = initialX + deltaX.roundToInt()
                            params.y = initialY + deltaY.roundToInt()
                            clampOverlayPosition(overlayRoot, params)
                            windowManager.updateViewLayout(overlayRoot, params)
                        }
                        return true
                    }

                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        mainHandler.removeCallbacks(longPressRunnable)

                        when {
                            dragStarted -> snapToEdges(params, overlayRoot)
                            !isLongPressActive -> handleFabTap()
                            else -> { /* long-press only, no drag */ }
                        }

                        isLongPressActive = false
                        dragStarted = false
                        return true
                    }
                }
                return false
            }
        }

        overlayRoot.setOnTouchListener(dragListener)
        btnMic?.setOnTouchListener(dragListener)
        btnStop?.setOnTouchListener(dragListener)
    }

    private fun handleFabTap() {
        when (recordingState) {
            RecordingState.IDLE -> {
                when {
                    overlayEnabledActionCount() > 1 -> showOrToggleActionMenu()
                    overlayMicOn() -> beginMicrophoneCapture()
                    overlayTranslationOn() -> beginTranslatorCapture()
                    overlayAskOn() -> beginAskQuestionCapture()
                    else -> beginMicrophoneCapture()
                }
            }
            RecordingState.RECORDING -> stopVoiceCapture()
            else -> { }
        }
    }

    private fun snapToEdges(params: WindowManager.LayoutParams, view: View) {
        val screenWidth = resources.displayMetrics.widthPixels
        val vw = view.width.coerceAtLeast(1)
        params.x = if (params.x + vw / 2 < screenWidth / 2) 0 else screenWidth - vw
        clampOverlayPosition(view, params)
        windowManager.updateViewLayout(view, params)
    }
    private fun clampOverlayPosition(overlay: View, params: WindowManager.LayoutParams) {
        val dm = resources.displayMetrics
        val vw = overlay.width.coerceAtLeast(overlay.measuredWidth).coerceAtLeast(120)
        val vh = overlay.height.coerceAtLeast(overlay.measuredHeight).coerceAtLeast(56)
        val screenWidth = dm.widthPixels
        val screenHeight = dm.heightPixels
        val maxY = (screenHeight - vh - lastImeInsetBottom).coerceAtLeast(0)
        params.x = params.x.coerceIn(0, (screenWidth - vw).coerceAtLeast(0))
        params.y = params.y.coerceIn(0, maxY)
    }

    // ─── SPEECH RECOGNITION METHODS ───────────────────────────────────────

    private fun startSpeechRecognition() {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start speech recognition: Not in IDLE state")
            return
        }
        
        try {
            Log.d(TAG, "🎤 Starting Speech Recognition")

            hideActionMenu()
            sessionMode = SessionMode.MIC

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

    /** Ask Question: same as mic STT but [SessionMode.ASK] for downstream AI chat completion. */
    private fun startSpeechRecognitionForAsk() {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start Ask speech recognition: Not in IDLE state")
            return
        }
        try {
            Log.d(TAG, "🎤 Starting Speech Recognition (Ask / English)")
            hideActionMenu()
            sessionMode = SessionMode.ASK
            resetInjectionGate()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            recognitionIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            }
            speechRecognizer?.setRecognitionListener(createRecognitionListener())
            speechRecognizer?.startListening(recognitionIntent)
            recordingState = RecordingState.RECORDING
            updateUIState()
            sendEventToReactNative("onRecordingStarted", null)
            startAliveCheck()
            Log.d(TAG, "✅ Ask speech recognition started")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start Ask speech recognition", e)
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
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to stop speech recognition", e)
            sendEventToReactNative("onError", "Failed to stop speech recognition: ${e.message}")
            resetToIdleState()
        }
    }

    /** Floating translation + internal translation: STT in source language from Settings, then ML Kit. */
    private fun startSpeechRecognitionForTranslate() {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start translate speech recognition: Not in IDLE state")
            return
        }
        try {
            Log.d(TAG, "🎤 Starting speech recognition for on-device translation")
            hideActionMenu()
            // Same as [startSpeechRecognition] / [startMediaRecording]: unlock accessibility gate
            // so the translated [VOICE_RESULT] is not dropped after a prior injection.
            resetInjectionGate()
            val sourceLang = FloatingMicConfigStore.getTranslateSourceLang(this)
            val localeTag = Locale.forLanguageTag(sourceLang).toLanguageTag().ifBlank { "en-US" }

            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            recognitionIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            }
            speechRecognizer?.setRecognitionListener(createRecognitionListener())
            speechRecognizer?.startListening(recognitionIntent)

            recordingState = RecordingState.RECORDING
            updateUIState()
            sendEventToReactNative("onRecordingStarted", null)
            startAliveCheck()
            Log.d(TAG, "✅ Translate speech recognition started (locale=$localeTag)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start translate speech recognition", e)
            sendEventToReactNative("onError", "Failed to start speech recognition: ${e.message}")
            showToast("Failed to start speech recognition")
            resetToIdleState()
        }
    }

    private fun startExternalRecording() {
        startMediaRecording(SessionMode.MIC, "floating_mic_")
    }

    private fun startTranslatorRecording() {
        startMediaRecording(SessionMode.TRANSLATOR, "floating_translate_")
    }

    private fun startMediaRecording(
        mode: SessionMode,
        filePrefix: String,
    ) {
        if (recordingState != RecordingState.IDLE) {
            Log.w(TAG, "⚠️ Cannot start media recording: not IDLE")
            return
        }
        if (!hasRecordAudioPermission()) {
            sendEventToReactNative("onError", "Microphone permission not granted")
            showToast("Microphone permission required")
            return
        }
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        val elevenLabsMic = mode == SessionMode.MIC &&
            FloatingMicConfigStore.shouldUseElevenLabsForMicTranscribe(this)
        val canMicCloud = baseUrl.isNotBlank() || elevenLabsMic
        if (mode == SessionMode.MIC && !canMicCloud) {
            sendEventToReactNative(
                "onError",
                "Configure ElevenLabs API key or voice server URL in the app → Settings.",
            )
            showToast("Configure ElevenLabs key or voice server")
            return
        }
        if (mode == SessionMode.TRANSLATOR && baseUrl.isBlank() &&
            !FloatingMicConfigStore.isInternalFloatingTranslationEnabled(this)
        ) {
            sendEventToReactNative("onError", "Voice API URL not configured. Open the app → Settings.")
            showToast("Configure voice server in Settings")
            return
        }

        try {
            hideActionMenu()
            sessionMode = mode
            sessionUsesInternalTranscription = false
            resetInjectionGate()
            externalAudioFile = File(cacheDir, "${filePrefix}${System.currentTimeMillis()}.m4a")
            val outPath = externalAudioFile!!.absolutePath

            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(outPath)
            recorder.prepare()
            recorder.start()
            mediaRecorder = recorder

            recordingState = RecordingState.RECORDING
            isExternalUploading = false
            updateUIState()
            sendEventToReactNative("onRecordingStarted", null)
            startAliveCheck()
            Log.d(TAG, "✅ Media recording started ($mode) → $outPath")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Media recording failed", e)
            try {
                mediaRecorder?.release()
            } catch (_: Exception) {
            }
            mediaRecorder = null
            externalAudioFile?.delete()
            externalAudioFile = null
            sendEventToReactNative("onError", e.message ?: "Recording failed")
            showToast("Recording failed")
            resetToIdleState()
        }
    }

    private fun stopMediaAndUpload() {
        if (recordingState != RecordingState.RECORDING || mediaRecorder == null) {
            Log.w(TAG, "⚠️ Cannot stop media recording")
            return
        }

        stopAliveCheck()
        val file = externalAudioFile
        val mode = sessionMode

        try {
            mediaRecorder?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "MediaRecorder.stop", e)
        }
        try {
            mediaRecorder?.reset()
            mediaRecorder?.release()
        } catch (_: Exception) {
        }
        mediaRecorder = null

        recordingState = RecordingState.STOPPED
        isExternalUploading = true
        updateUIState()
        sendEventToReactNative("onRecordingStopped", null)

        if (file == null || !file.exists() || file.length() == 0L) {
            isExternalUploading = false
            sendEventToReactNative("onError", "Recording file empty")
            sendEventToReactNative("onTranscriptionError", "Recording file empty")
            file?.delete()
            externalAudioFile = null
            resetToIdleState()
            return
        }

        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        Thread {
            val result = when (mode) {
                SessionMode.TRANSLATOR -> VoiceTranscribeClient.translateSpeechFile(
                    baseUrl,
                    FloatingMicConfigStore.getSpeechTranslatePath(this@FloatingMicService),
                    file,
                    FloatingMicConfigStore.getTranslateSourceLang(this@FloatingMicService),
                    FloatingMicConfigStore.getTranslateTargetLang(this@FloatingMicService),
                )
                else -> {
                    if (FloatingMicConfigStore.shouldUseElevenLabsForMicTranscribe(this@FloatingMicService)) {
                        ElevenLabsTranscribeClient.transcribeFile(
                            FloatingMicConfigStore.getElevenLabsApiKey(this@FloatingMicService),
                            file,
                            FloatingMicConfigStore.getTranslateSourceLang(this@FloatingMicService),
                        )
                    } else {
                        VoiceTranscribeClient.transcribeFile(baseUrl, file)
                    }
                }
            }
            mainHandler.post {
                isExternalUploading = false
                val text = result.getOrNull()
                if (text != null) {
                    Log.d(TAG, "✅ Server text injected: $text")
                    injectText(text)
                    sendEventToReactNative("onTranscriptionComplete", text)
                    showToast(getString(R.string.voice_injected))
                } else {
                    val err = result.exceptionOrNull()
                    val msg = err?.message ?: if (mode == SessionMode.TRANSLATOR) {
                        "Translation failed"
                    } else {
                        "Transcription failed"
                    }
                    Log.e(TAG, "Upload failed: $msg", err)
                    sendEventToReactNative("onError", msg)
                    sendEventToReactNative("onTranscriptionError", msg)
                    showToast(msg)
                }
                runCatching { file.delete() }
                externalAudioFile = null
                resetToIdleState()
            }
        }.start()
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
                if (isInjecting) return
                isInjecting = true

                val useOnDeviceTranslate =
                    sessionMode == SessionMode.TRANSLATOR &&
                        FloatingMicConfigStore.isInternalFloatingTranslationEnabled(this@FloatingMicService)
                var deferredTranslation = false
                var deferredAsk = false

                try {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val spokenText = matches?.getOrNull(0)?.trim().orEmpty()

                    if (spokenText.isEmpty()) {
                        Log.w(TAG, "⚠️ No speech recognition results")
                        return
                    }

                    if (sessionMode == SessionMode.ASK) {
                        val apiKey = FloatingMicConfigStore.getAiProviderApiKey(this@FloatingMicService)
                        if (apiKey.isEmpty()) {
                            Log.e(TAG, "AI provider API key missing")
                            sendEventToReactNative("onError", "Set AI_PROVIDER_API_KEY in aiProvider.js (app config).")
                            showToast("AI API key missing in app config")
                            return
                        }
                        deferredAsk = true
                        stopAliveCheck()
                        recordingState = RecordingState.STOPPED
                        isAskProcessing = true
                        updateUIState()
                        sendEventToReactNative("onRecordingStopped", null)
                        val appCtx = applicationContext
                        Thread {
                            val ai = AiProviderChatClient.chatCompletion(appCtx, apiKey, spokenText)
                            mainHandler.post {
                                isAskProcessing = false
                                isInjecting = false
                                when {
                                    ai.isSuccess -> {
                                        val t = ai.getOrNull().orEmpty()
                                        injectText(t)
                                        val qaPayload = JSONObject().apply {
                                            put("question", spokenText)
                                            put("answer", t)
                                        }.toString()
                                        sendEventToReactNative("onAskQuestionComplete", qaPayload)
                                        showToast(getString(R.string.voice_injected))
                                    }
                                    else -> {
                                        val msg = ai.exceptionOrNull()?.message ?: "AI request failed"
                                        sendEventToReactNative("onError", msg)
                                        sendEventToReactNative("onTranscriptionError", msg)
                                        showToast(msg)
                                    }
                                }
                                resetToIdleState()
                            }
                        }.start()
                        return
                    }

                    if (useOnDeviceTranslate) {
                        deferredTranslation = true
                        val appCtx = applicationContext
                        val src = FloatingMicConfigStore.getTranslateSourceLang(appCtx)
                        val tgt = FloatingMicConfigStore.getTranslateTargetLang(appCtx)
                        Log.d(TAG, "✅ STT for translate: $spokenText → ML Kit ($src → $tgt)")
                        mainHandler.post { resetToIdleState() }
                        Thread {
                            val tr = MlKitTranslateHelper.translate(appCtx, spokenText, src, tgt)
                            mainHandler.post {
                                deliverOnDeviceTranslationResult(tr)
                            }
                        }.start()
                        return
                    }

                    Log.d(TAG, "✅ Speech recognition result: $spokenText")
                    injectText(spokenText)
                    sendEventToReactNative("onTranscriptionComplete", spokenText)
                    showToast("Text injected")
                } finally {
                    if (!deferredTranslation && !deferredAsk) {
                        isInjecting = false
                        resetToIdleState()
                    }
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
            val intent = Intent("com.typeeasy.VOICE_RESULT").apply {
                putExtra("transcribed_text", newText)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "💉 Text sent to accessibility service: $newText")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to inject text", e)
        }
    }

    private fun deliverOnDeviceTranslationResult(result: Result<String>) {
        isInjecting = false
        if (result.isSuccess) {
            val t = result.getOrNull().orEmpty()
            injectText(t)
            sendEventToReactNative("onTranscriptionComplete", t)
            showToast(getString(R.string.voice_injected))
        } else {
            val msg = result.exceptionOrNull()?.message ?: "Translation failed"
            Log.e(TAG, "On-device translation failed: $msg")
            sendEventToReactNative("onError", msg)
            sendEventToReactNative("onTranscriptionError", msg)
            showToast(msg)
        }
    }

    /**
     * Reset injection gate in accessibility service for new recording session
     */
    private fun resetInjectionGate() {
        try {
            val intent = Intent("com.typeeasy.RESET_INJECTION")
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
        isExternalUploading = false
        isAskProcessing = false
        stopAliveCheck()

        isInjecting = false

        try {
            mediaRecorder?.stop()
        } catch (_: Exception) {
        }
        try {
            mediaRecorder?.reset()
            mediaRecorder?.release()
        } catch (_: Exception) {
        }
        mediaRecorder = null

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
        hideActionMenu()
        updateUIState()

        Log.d(TAG, "🔄 Reset to IDLE state - SpeechRecognizer destroyed")
    }
    
    
    // ─── UI STATE MANAGEMENT ───────────────────────────────────────────────

    private fun updateUIState() {
        when (recordingState) {
            RecordingState.IDLE -> {
                btnMic?.visibility = View.VISIBLE
                btnStop?.visibility = View.GONE
                soundWaveView?.stopWave()
                soundWaveView?.visibility = View.GONE
                uploadProgress?.visibility = View.GONE
                statusIndicatorContainer?.visibility = View.GONE
                applyIdleOverlayAppearance()
            }
            RecordingState.RECORDING -> {
                btnMic?.visibility = View.GONE
                btnStop?.visibility = View.VISIBLE
                statusIndicatorContainer?.visibility = View.VISIBLE
                soundWaveView?.visibility = View.VISIBLE
                uploadProgress?.visibility = View.GONE
                soundWaveView?.startWave()
            }
            RecordingState.STOPPED -> {
                if (isExternalUploading || isAskProcessing) {
                    btnMic?.visibility = View.GONE
                    btnStop?.visibility = View.GONE
                    statusIndicatorContainer?.visibility = View.VISIBLE
                    soundWaveView?.stopWave()
                    soundWaveView?.visibility = View.GONE
                    uploadProgress?.visibility = View.VISIBLE
                } else {
                    btnMic?.visibility = View.VISIBLE
                    btnStop?.visibility = View.GONE
                    soundWaveView?.stopWave()
                    soundWaveView?.visibility = View.GONE
                    uploadProgress?.visibility = View.GONE
                    statusIndicatorContainer?.visibility = View.GONE
                }
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
                        beginMicrophoneCapture()
                    }
                    ACTION_STOP_RECORDING -> {
                        Log.d(TAG, "🛑 Received stop recording command")
                        stopVoiceCapture()
                    }
                    ACTION_CONFIG_UPDATED -> {
                        Log.d(TAG, "⚙️ Floating mic config updated from app")
                        mainHandler.post {
                            hideActionMenu()
                            applyIdleOverlayAppearance()
                        }
                    }
                }
            }
        }
        
        val filter = IntentFilter().apply {
            addAction(ACTION_SHOW_MIC)
            addAction(ACTION_HIDE_MIC)
            addAction(ACTION_START_RECORDING)
            addAction(ACTION_STOP_RECORDING)
            addAction(ACTION_CONFIG_UPDATED)
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
        
        if (recordingState == RecordingState.RECORDING || isExternalUploading || isAskProcessing) {
            try {
                mediaRecorder?.stop()
            } catch (_: Exception) {
            }
            try {
                mediaRecorder?.release()
            } catch (_: Exception) {
            }
            mediaRecorder = null
            runCatching { externalAudioFile?.delete() }
            externalAudioFile = null
            isExternalUploading = false
        }

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
