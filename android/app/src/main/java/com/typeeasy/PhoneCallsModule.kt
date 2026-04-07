package com.typeeasy

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.File

class PhoneCallsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext),
    LifecycleEventListener {

    companion object {
        private const val TAG = "PhoneCallsModule"
        const val CALL_RECORDING_PREFS = "TypeEasyCallRecording"
        const val CALL_RECORDING_PREF_KEY = "call_recording_service_wanted"
    }

    private var receiverRegistered = false

    private fun persistCallRecordingWanted(enabled: Boolean) {
        reactApplicationContext
            .getSharedPreferences(CALL_RECORDING_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(CALL_RECORDING_PREF_KEY, enabled)
            .apply()
    }

    private val recordingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != CallRecordingForegroundService.ACTION_RECORDING_DONE) return
            val map = Arguments.createMap().apply {
                putString("audioPath", intent.getStringExtra("audioPath"))
                putString("publicLocation", intent.getStringExtra("publicLocation"))
                putInt("peakAmplitudeMax", intent.getIntExtra("peakAmplitudeMax", 0))
                putBoolean("likelySilentCapture", intent.getBooleanExtra("likelySilentCapture", false))
                putString("phoneNumber", intent.getStringExtra("phoneNumber"))
                putString("contactName", intent.getStringExtra("contactName"))
                putString("direction", intent.getStringExtra("direction"))
                putDouble("durationMs", intent.getLongExtra("durationMs", 0L).toDouble())
            }
            sendJsEvent("onCallRecordingComplete", map)
        }
    }

    init {
        reactContext.addLifecycleEventListener(this)
        registerRecordingReceiver()
    }

    override fun getName(): String = "PhoneCallsModule"

    override fun onHostResume() {}
    override fun onHostPause() {}
    override fun onHostDestroy() {
        unregisterRecordingReceiver()
    }

    private fun registerRecordingReceiver() {
        if (receiverRegistered) return
        val filter = IntentFilter(CallRecordingForegroundService.ACTION_RECORDING_DONE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(
                recordingReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED,
            )
        } else {
            @Suppress("DEPRECATION")
            reactApplicationContext.registerReceiver(recordingReceiver, filter)
        }
        receiverRegistered = true
    }

    private fun unregisterRecordingReceiver() {
        if (!receiverRegistered) return
        try {
            reactApplicationContext.unregisterReceiver(recordingReceiver)
        } catch (_: Exception) {
        }
        receiverRegistered = false
    }

    private fun sendJsEvent(name: String, body: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("PhoneCalls_$name", body)
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    fun getCallLogs(limit: Double, promise: Promise) {
        Thread {
            try {
                val resolver = reactApplicationContext.contentResolver
                val cursor = resolver.query(
                    CallLog.Calls.CONTENT_URI,
                    arrayOf(
                        CallLog.Calls._ID,
                        CallLog.Calls.NUMBER,
                        CallLog.Calls.CACHED_NAME,
                        CallLog.Calls.TYPE,
                        CallLog.Calls.DATE,
                        CallLog.Calls.DURATION,
                    ),
                    null,
                    null,
                    "${CallLog.Calls.DATE} DESC",
                )
                val result = Arguments.createArray()
                val max = limit.toInt().coerceIn(1, 500)
                var count = 0
                cursor?.use {
                    while (it.moveToNext() && count < max) {
                        val map = Arguments.createMap()
                        map.putDouble("id", it.getLong(0).toDouble())
                        map.putString("phoneNumber", it.getString(1) ?: "")
                        map.putString("contactName", it.getString(2) ?: "")
                        val type = it.getInt(3)
                        map.putString("callType", callTypeString(type))
                        map.putDouble("timestamp", it.getLong(4).toDouble())
                        map.putInt("durationSec", it.getLong(5).toInt())
                        result.pushMap(map)
                        count++
                    }
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("E_CALL_LOG", e.message, e)
            }
        }.start()
    }

    private fun callTypeString(type: Int): String = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "incoming"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        CallLog.Calls.BLOCKED_TYPE -> "blocked"
        else -> "unknown"
    }

    @ReactMethod
    fun startCallRecordingService(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val micOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            val phoneOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            if (!micOk) {
                promise.reject("E_PERM", "Microphone permission (RECORD_AUDIO) is not granted.")
                return
            }
            if (!phoneOk) {
                promise.reject("E_PERM", "Phone permission (READ_PHONE_STATE) is not granted.")
                return
            }
            val intent = Intent(ctx, CallRecordingForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
            persistCallRecordingWanted(true)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SERVICE", e.message, e)
        }
    }

    @ReactMethod
    fun stopCallRecordingService(promise: Promise) {
        try {
            reactApplicationContext.stopService(
                Intent(reactApplicationContext, CallRecordingForegroundService::class.java),
            )
            persistCallRecordingWanted(false)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SERVICE", e.message, e)
        }
    }

    @ReactMethod
    fun getPendingRecordings(promise: Promise) {
        Thread {
            try {
                val list = CallRecordingsStorage.listAudioFiles(reactApplicationContext)
                val arr = Arguments.createArray()
                for (audio in list) {
                    val parent = audio.parentFile ?: continue
                    val base = audio.name.substringBeforeLast('.')
                    val metaFile = File(parent, "$base.json")
                    val map = Arguments.createMap()
                    map.putString("audioPath", audio.absolutePath)
                    map.putString("fileName", audio.name)
                    map.putDouble("fileSize", audio.length().toDouble())
                    map.putDouble("modifiedAt", audio.lastModified().toDouble())
                    map.putString("publicLocation", "")
                    map.putInt("peakAmplitudeMax", 0)
                    map.putBoolean("likelySilentCapture", false)
                    if (metaFile.exists()) {
                        try {
                            val json = JSONObject(metaFile.readText())
                            map.putString("publicLocation", json.optString("publicLocation", ""))
                            map.putInt("peakAmplitudeMax", json.optInt("peakAmplitudeMax", 0))
                            map.putBoolean("likelySilentCapture", json.optBoolean("likelySilentCapture", false))
                            map.putString("phoneNumber", json.optString("phoneNumber", ""))
                            map.putString("contactName", json.optString("contactName", ""))
                            map.putString("direction", json.optString("direction", ""))
                            map.putDouble("durationMs", json.optLong("durationMs").toDouble())
                            map.putDouble("recordedAt", json.optLong("recordedAt").toDouble())
                        } catch (_: Exception) {
                        }
                    }
                    arr.pushMap(map)
                }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("E_PENDING", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun deleteRecording(audioPath: String, promise: Promise) {
        Thread {
            try {
                val f = File(audioPath)
                val parent = f.parentFile
                val base = f.name.substringBeforeLast('.')
                val metaFile = if (parent != null) File(parent, "$base.json") else null
                if (metaFile?.exists() == true) {
                    try {
                        val json = JSONObject(metaFile.readText())
                        val pub = json.optString("publicLocation", "").trim()
                        if (pub.isNotEmpty()) {
                            if (pub.startsWith("content://")) {
                                try {
                                    reactApplicationContext.contentResolver.delete(Uri.parse(pub), null, null)
                                } catch (e: Exception) {
                                    Log.w(TAG, "delete public content URI: ${e.message}")
                                }
                            } else {
                                try {
                                    File(pub).delete()
                                } catch (_: Exception) {
                                }
                            }
                        }
                    } catch (_: Exception) {
                    }
                }
                if (f.exists()) f.delete()
                if (metaFile?.exists() == true) metaFile.delete()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("E_DELETE", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun addListener(eventName: String) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }
}
