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
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.MediaRecorder
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.CallLog
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.File
import org.json.JSONObject

/**
 * Listens for active calls and records audio to app storage while a call is off-hook.
 * Uses [CallWavRecorder] (PCM/WAV via [android.media.AudioRecord]) — more reliable than
 * [android.media.MediaRecorder] for audible capture during calls on many OEMs.
 *
 * ## How this relates to “other call recording apps”
 * - **Built-in Phone / OEM dialer recorders** are usually **system or privileged** apps. They can use
 *   manufacturer-only audio paths. A normal store-distributed app **cannot** call the same native stack.
 * - **Third-party recorders that still work** on some devices use the **same public APIs** as here:
 *   [android.media.AudioRecord] / [MediaRecorder] with sources such as `VOICE_CALL`, `VOICE_DOWNLINK`,
 *   `VOICE_UPLINK`, `VOICE_COMMUNICATION`, `MIC`, etc. There is no separate “secret” Play Store API.
 * - On **Android 10+**, many devices return **valid recordings that are silent** for those sources
 *   (policy / HAL). The portable workaround is **speakerphone + microphone** (see user toggle).
 */
class CallRecordingForegroundService : Service() {

    private val tag = "CallRecService"
    private var telephonyManager: TelephonyManager? = null
    private var audioManager: AudioManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingStartRecording: Runnable? = null

    private var wavRecorder: CallWavRecorder? = null
    private var mediaRecorder: MediaRecorder? = null
    private var recordingPath: String? = null
    private var callStartElapsed: Long = 0L
    private var wasRinging = false
    private var isOutgoing = false

    private var legacyPhoneStateListener: PhoneStateListener? = null
    private var telephonyCallback: TelephonyCallback? = null

    /** Many OEMs deliver [TelephonyManager.ACTION_PHONE_STATE_CHANGED] more reliably than [TelephonyCallback]. */
    private var phoneStateReceiverRegistered = false
    private val phoneStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
            val extra = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
            val state = when (extra) {
                TelephonyManager.EXTRA_STATE_IDLE -> TelephonyManager.CALL_STATE_IDLE
                TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
                TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
                else -> return
            }
            val num = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
            Log.d(tag, "broadcast PHONE_STATE extra=$extra -> intState=$state num=$num")
            handleCallState(state, num)
        }
    }

    /** Dedupe when both [TelephonyCallback] and broadcast fire for the same transition. */
    private var lastDedupeState: Int = Int.MIN_VALUE
    private var lastDedupeAt: Long = 0L

    /** True if this service turned speakerphone on (must reset on IDLE / destroy). */
    private var speakerBoostApplied: Boolean = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(tag, "onCreate")
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        registerCallStateListener()
        registerPhoneStateBroadcast()
        mainHandler.post { ensureRecordingIfAlreadyInCall(reason = "onCreate") }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(tag, "onStartCommand")
        createChannel()
        val notification = buildNotification(getString(R.string.call_recording_notification_text_listening))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
        mainHandler.post { ensureRecordingIfAlreadyInCall(reason = "onStartCommand") }
        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(tag, "onDestroy")
        cancelPendingStartRecording()
        unregisterPhoneStateBroadcast()
        unregisterCallStateListener()
        stopRecordingInternal(sendBroadcast = false)
        resetAudioRouting()
        super.onDestroy()
    }

    private fun cancelPendingStartRecording() {
        pendingStartRecording?.let { mainHandler.removeCallbacks(it) }
        pendingStartRecording = null
    }

    /** Route audio for telephony so MIC / voice sources can pick up call audio (OEM-dependent). */
    private fun applyInCallAudioRouting() {
        try {
            audioManager?.mode = AudioManager.MODE_IN_CALL
        } catch (_: Exception) {
        }
    }

    private fun resetAudioRouting() {
        resetSpeakerphoneBoost()
        try {
            audioManager?.mode = AudioManager.MODE_NORMAL
        } catch (_: Exception) {
        }
    }

    private fun isSpeakerphoneBoostWanted(): Boolean {
        return getSharedPreferences(PhoneCallsModule.CALL_RECORDING_PREFS, Context.MODE_PRIVATE)
            .getBoolean(PhoneCallsModule.CALL_RECORDING_SPEAKERPHONE_BOOST_KEY, false)
    }

    /**
     * Many OEMs block [VOICE_CALL] for third-party apps (file has size but silence).
     * Android 10+ requires routing audio to the loudspeaker so the MIC can pick it up.
     */
    private fun applySpeakerphoneIfPreferred() {
        if (!isSpeakerphoneBoostWanted()) {
            return
        }
        try {
            val am = audioManager ?: return
            // Prefer the property setter when available; keep deprecated call for OEM compatibility.
            try {
                am.isSpeakerphoneOn = true
            } catch (_: Exception) {
                @Suppress("DEPRECATION")
                am.setSpeakerphoneOn(true)
            }
            // "High-gain" strategy: turn call/media streams up so the MIC can physically pick up the remote voice.
            // This is intentionally aggressive; users can toggle speaker boost off in the UI.
            try {
                val callMax = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
                if (callMax > 0) {
                    am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, callMax, 0)
                }
            } catch (_: Exception) {
            }
            try {
                val musicMax = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                if (musicMax > 0) {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, musicMax, 0)
                }
            } catch (_: Exception) {
            }
            speakerBoostApplied = true
            Log.i(tag, "Speakerphone forced ON for call capture (Android 10+ workaround)")
        } catch (e: Exception) {
            Log.w(tag, "applySpeakerphoneIfPreferred: ${e.message}")
        }
    }

    private fun resetSpeakerphoneBoost() {
        if (!speakerBoostApplied) return
        try {
            try {
                audioManager?.isSpeakerphoneOn = false
            } catch (_: Exception) {
                @Suppress("DEPRECATION")
                audioManager?.setSpeakerphoneOn(false)
            }
            Log.d(tag, "Speakerphone OFF after call capture")
        } catch (_: Exception) {
        }
        speakerBoostApplied = false
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.call_recording_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.call_recording_channel_description)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pending = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.call_recording_notification_title))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pending)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val nm = ContextCompat.getSystemService(this, NotificationManager::class.java)
        nm?.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun registerPhoneStateBroadcast() {
        if (phoneStateReceiverRegistered) return
        val filter = IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(phoneStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(phoneStateReceiver, filter)
            }
            phoneStateReceiverRegistered = true
            Log.d(tag, "PHONE_STATE broadcast registered")
        } catch (e: Exception) {
            Log.e(tag, "register PHONE_STATE receiver failed", e)
        }
    }

    private fun unregisterPhoneStateBroadcast() {
        if (!phoneStateReceiverRegistered) return
        try {
            unregisterReceiver(phoneStateReceiver)
        } catch (_: Exception) {
        }
        phoneStateReceiverRegistered = false
    }

    private fun registerCallStateListener() {
        val tm = telephonyManager ?: return
        if (telephonyCallback != null || legacyPhoneStateListener != null) {
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val executor = ContextCompat.getMainExecutor(this)
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallState(state, null)
                }
            }
            telephonyCallback = cb
            tm.registerTelephonyCallback(executor, cb)
        } else {
            @Suppress("DEPRECATION")
            val listener = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleCallState(state, phoneNumber)
                }
            }
            legacyPhoneStateListener = listener
            @Suppress("DEPRECATION")
            tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        }
    }

    private fun unregisterCallStateListener() {
        val tm = telephonyManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { tm.unregisterTelephonyCallback(it) }
            telephonyCallback = null
        } else {
            legacyPhoneStateListener?.let {
                @Suppress("DEPRECATION")
                tm.listen(it, PhoneStateListener.LISTEN_NONE)
            }
            legacyPhoneStateListener = null
        }
    }

    /**
     * [TelephonyCallback] / [PhoneStateListener] often do not replay the current state when registered.
     * If the user enables recording mid-call or the service restarts during a call, we would otherwise
     * never see OFFHOOK and never create a file.
     */
    private fun ensureRecordingIfAlreadyInCall(reason: String) {
        val tm = telephonyManager ?: return
        val state = tm.callState
        Log.i(tag, "ensureRecordingIfAlreadyInCall ($reason) callState=$state")
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (wavRecorder != null || mediaRecorder != null) {
                    return
                }
                if (pendingStartRecording != null) {
                    return
                }
                updateNotification(getString(R.string.call_recording_notification_text_recording))
                scheduleStartRecording()
            }
            TelephonyManager.CALL_STATE_RINGING -> {
                wasRinging = true
                isOutgoing = false
                updateNotification(getString(R.string.call_recording_notification_text_incoming))
            }
            else -> { /* idle or unknown */ }
        }
    }

    private fun handleCallState(state: Int, phoneNumber: String?) {
        val now = SystemClock.elapsedRealtime()
        if (state == lastDedupeState && now - lastDedupeAt < 500L) {
            Log.d(tag, "dedupe call state=$state (${now - lastDedupeAt}ms)")
            return
        }
        lastDedupeState = state
        lastDedupeAt = now

        Log.d(tag, "handleCallState state=$state phone=$phoneNumber")
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                wasRinging = true
                isOutgoing = false
                updateNotification(getString(R.string.call_recording_notification_text_incoming))
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (!wasRinging) {
                    isOutgoing = true
                }
                updateNotification(getString(R.string.call_recording_notification_text_recording))
                scheduleStartRecording()
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                cancelPendingStartRecording()
                wasRinging = false
                stopRecordingInternal(sendBroadcast = true)
                resetAudioRouting()
                isOutgoing = false
                updateNotification(getString(R.string.call_recording_notification_text_listening))
            }
        }
    }

    /**
     * Wait briefly after OFFHOOK so the modem / audio patch is ready. Without this, captures are often silent.
     */
    private fun scheduleStartRecording() {
        cancelPendingStartRecording()
        val run = Runnable {
            pendingStartRecording = null
            startRecordingWithRouting()
        }
        pendingStartRecording = run
        mainHandler.postDelayed(run, START_DELAY_MS)
    }

    private fun startRecordingWithRouting() {
        if (wavRecorder != null || mediaRecorder != null) return
        applyInCallAudioRouting()
        applySpeakerphoneIfPreferred()
        startRecording()
        if (wavRecorder != null || mediaRecorder != null) {
            if (speakerBoostApplied) {
                updateNotification(getString(R.string.call_recording_notification_text_recording_speaker))
            }
        }
    }

    private fun newMediaRecorder(): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
    }

    /**
     * If [CallWavRecorder] cannot open any AudioRecord path, fall back to MediaRecorder (AAC .m4a).
     * Some devices only expose one pipeline reliably during calls.
     */
    private fun tryStartMediaRecorder(path: String): Boolean {
        applyInCallAudioRouting()
        @Suppress("DEPRECATION")
        val sources = buildList {
            add(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            add(MediaRecorder.AudioSource.MIC)
            add(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            add(MediaRecorder.AudioSource.VOICE_DOWNLINK)
            add(MediaRecorder.AudioSource.VOICE_UPLINK)
            add(MediaRecorder.AudioSource.VOICE_CALL)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                add(MediaRecorder.AudioSource.VOICE_PERFORMANCE)
            }
        }.toIntArray()
        for (source in sources) {
            val recorder = newMediaRecorder()
            val ok = try {
                recorder.setAudioSource(source)
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    recorder.setAudioEncodingBitRate(128_000)
                    recorder.setAudioSamplingRate(44_100)
                }
                recorder.setOutputFile(path)
                recorder.prepare()
                recorder.start()
                mediaRecorder = recorder
                true
            } catch (e: Exception) {
                Log.w(tag, "MediaRecorder failed source=$source: ${e.message}")
                try {
                    recorder.release()
                } catch (_: Exception) {
                }
                false
            }
            if (ok) {
                Log.i(tag, "MediaRecorder started: $path source=$source")
                return true
            }
        }
        return false
    }

    private fun startRecording() {
        if (wavRecorder != null || mediaRecorder != null) return
        val dir = CallRecordingsStorage.getCallRecordingsDir(this)
        Log.i(
            tag,
            "startRecording dir=${dir.absolutePath} exists=${dir.exists()} writable=${dir.canWrite()}",
        )
        val ts = System.currentTimeMillis()
        val wavFile = File(dir, "call_${ts}.wav")
        val wavRec = CallWavRecorder()
        if (wavRec.start(wavFile)) {
            wavRecorder = wavRec
            recordingPath = wavFile.absolutePath
            callStartElapsed = System.currentTimeMillis()
            Log.d(tag, "startRecording WAV ok path=${wavFile.absolutePath}")
            return
        }
        val m4aFile = File(dir, "call_${ts}.m4a")
        val m4aPath = m4aFile.absolutePath
        if (tryStartMediaRecorder(m4aPath)) {
            recordingPath = m4aPath
            callStartElapsed = System.currentTimeMillis()
            Log.d(tag, "startRecording M4A fallback path=$m4aPath")
            return
        }
        Log.e(tag, "startRecording failed: neither WAV nor MediaRecorder could start")
        resetSpeakerphoneBoost()
    }

    private fun stopRecordingInternal(sendBroadcast: Boolean) {
        val path = recordingPath
        val rec = wavRecorder
        val mr = mediaRecorder
        wavRecorder = null
        mediaRecorder = null
        recordingPath = null
        val durationMs = if (callStartElapsed > 0L) {
            (System.currentTimeMillis() - callStartElapsed).coerceAtLeast(0L)
        } else {
            0L
        }
        callStartElapsed = 0L

        var usablePath: String? = null
        var capturePeakAbs = 0
        var likelySilentCapture = false
        if (path != null && rec != null) {
            val pcmLen = rec.stopAndFinalize(File(path))
            capturePeakAbs = rec.lastCapturedPeakAbs
            likelySilentCapture = capturePeakAbs < CallWavRecorder.SILENCE_PEAK_THRESHOLD
            Log.d(
                tag,
                "stopRecording WAV path=$path pcmLen=$pcmLen peakAbs=$capturePeakAbs " +
                    "likelySilent=$likelySilentCapture sendBroadcast=$sendBroadcast",
            )
            if (pcmLen >= 0L) {
                usablePath = path
            }
        } else if (path != null && mr != null) {
            try {
                mr.stop()
            } catch (e: Exception) {
                Log.w(tag, "MediaRecorder stop: ${e.message}")
            }
            try {
                mr.release()
            } catch (_: Exception) {
            }
            val f = File(path)
            Log.d(tag, "stopRecording M4A path=$path len=${f.length()} sendBroadcast=$sendBroadcast")
            if (f.exists() && f.length() >= MIN_M4A_BYTES) {
                usablePath = path
            } else {
                try {
                    f.delete()
                } catch (_: Exception) {
                }
            }
        }

        if (usablePath == null) {
            return
        }

        if (!sendBroadcast) return
        val file = File(usablePath)
        if (!file.exists() || file.length() < 512L) {
            try {
                file.delete()
            } catch (_: Exception) {
            }
            return
        }

        val mime = if (file.name.endsWith(".wav", ignoreCase = true)) "audio/wav" else "audio/mp4"
        try {
            MediaScannerConnection.scanFile(
                this,
                arrayOf(file.absolutePath),
                arrayOf(mime),
                null,
            )
        } catch (_: Exception) {
        }

        // Export a user-visible copy (public Downloads/CallRecordings) so the Files app can find it.
        val publicLocation = PublicDownloadsExporter.export(this, file, mime)
        if (publicLocation != null) {
            Log.i(tag, "Exported to public downloads: $publicLocation")
        } else {
            Log.w(tag, "Export to public downloads failed (device may restrict or storage unavailable)")
        }

        val meta = readLatestCallMeta()
        val phone = meta.first ?: ""
        val name = meta.second ?: ""
        val direction = if (isOutgoing) "outgoing" else "incoming"

        val json = JSONObject().apply {
            put("audioFileName", file.name)
            put("audioPath", usablePath)
            put("publicLocation", publicLocation ?: "")
            put("peakAmplitudeMax", capturePeakAbs)
            put("likelySilentCapture", likelySilentCapture)
            put("phoneNumber", phone)
            put("contactName", name)
            put("direction", direction)
            put("durationMs", durationMs)
            put("recordedAt", System.currentTimeMillis())
        }
        try {
            val base = file.name.substringBeforeLast('.')
            File(file.parent, "$base.json").writeText(json.toString())
        } catch (_: Exception) {
        }

        val broadcast = Intent(ACTION_RECORDING_DONE).setPackage(packageName)
        broadcast.putExtra("audioPath", usablePath)
        // API 29+ will be a content:// Uri string; older devices will be an absolute path string.
        broadcast.putExtra("publicLocation", publicLocation)
        broadcast.putExtra("peakAmplitudeMax", capturePeakAbs)
        broadcast.putExtra("likelySilentCapture", likelySilentCapture)
        broadcast.putExtra("phoneNumber", phone)
        broadcast.putExtra("contactName", name)
        broadcast.putExtra("direction", direction)
        broadcast.putExtra("durationMs", durationMs)
        sendBroadcast(broadcast)
    }

    /** Best-effort: read most recent call log row (may match current call). */
    private fun readLatestCallMeta(): Pair<String?, String?> {
        var number: String? = null
        var name: String? = null
        try {
            contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.CACHED_NAME,
                ),
                null,
                null,
                "${CallLog.Calls.DATE} DESC",
            )?.use { c ->
                if (c.moveToFirst()) {
                    number = c.getString(0)
                    name = c.getString(1)
                }
            }
        } catch (_: Exception) {
        }
        return Pair(number, name)
    }

    companion object {
        const val CHANNEL_ID = "call_recording_channel"
        const val NOTIFICATION_ID = 7102
        const val ACTION_RECORDING_DONE = "com.typeeasy.CALL_RECORDING_DONE"
        /** Wait after OFFHOOK before opening the mic (ms). Too long misses very short calls. */
        private const val START_DELAY_MS = 2000L
        /** Minimum size for AAC container to count as a real recording. */
        private const val MIN_M4A_BYTES = 2048L
    }
}
