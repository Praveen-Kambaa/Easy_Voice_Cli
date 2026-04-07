package com.typeeasy

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Restarts call recording after reboot if the user had left it enabled.
 * Without this, the OS can kill the foreground service; new calls then have a log row but no file.
 */
class CallRecordingBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) {
            return
        }
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PhoneCallsModule.CALL_RECORDING_PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(PhoneCallsModule.CALL_RECORDING_PREF_KEY, false)) {
            return
        }
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Boot: RECORD_AUDIO not granted, skip starting call recording service")
            return
        }
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Boot: READ_PHONE_STATE not granted, skip starting call recording service")
            return
        }
        try {
            val svc = Intent(app, CallRecordingForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                app.startForegroundService(svc)
            } else {
                app.startService(svc)
            }
            Log.i(TAG, "CallRecordingForegroundService started after boot")
        } catch (e: Exception) {
            Log.e(TAG, "Boot: failed to start call recording service", e)
        }
    }

    companion object {
        private const val TAG = "CallRecBoot"
    }
}
