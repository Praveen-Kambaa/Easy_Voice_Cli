package com.typeeasy

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

class AudioPickerModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx), ActivityEventListener {

    companion object {
        private const val REQ_PICK_AUDIO = 9104
    }

    private var pendingPromise: Promise? = null

    override fun getName(): String = "AudioPickerModule"

    init {
        reactCtx.addActivityEventListener(this)
    }

    @ReactMethod
    fun pickAudio(promise: Promise) {
        val activity = reactCtx.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity to open picker")
            return
        }
        if (pendingPromise != null) {
            promise.reject("IN_PROGRESS", "Another picker operation is in progress")
            return
        }
        pendingPromise = promise

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
        }

        try {
            activity.startActivityForResult(intent, REQ_PICK_AUDIO)
        } catch (e: Exception) {
            pendingPromise = null
            promise.reject("PICK_FAILED", e.message, e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQ_PICK_AUDIO) return
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK) {
            promise.reject("CANCELLED", "cancelled")
            return
        }

        val uri = data?.data
        if (uri == null) {
            promise.reject("NO_URI", "No file selected")
            return
        }

        try {
            // Copy SAF content:// uri into app cache so JS can upload it via FileSystem.
            val (baseName, ext) = guessNameAndExt(uri)
            val outName = "import_${System.currentTimeMillis()}_${baseName}.${ext}"
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
            val outFile = File(reactCtx.cacheDir, outName)

            reactCtx.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(outFile).use { output ->
                    input.copyTo(output)
                }
            } ?: run {
                promise.reject("OPEN_FAILED", "Cannot open selected file")
                return
            }

            promise.resolve("file://${outFile.absolutePath}")
        } catch (e: Exception) {
            promise.reject("COPY_FAILED", e.message, e)
        }
    }

    override fun onNewIntent(intent: Intent) {
        // no-op
    }

    private fun guessNameAndExt(uri: Uri): Pair<String, String> {
        var name: String? = null
        try {
            val c: Cursor? = reactCtx.contentResolver.query(uri, null, null, null, null)
            c?.use {
                val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && it.moveToFirst()) {
                    name = it.getString(idx)
                }
            }
        } catch (_: Exception) {
        }
        val raw = (name ?: "audio").trim()
        val base = raw.substringBeforeLast('.').ifEmpty { "audio" }
        val ext = raw.substringAfterLast('.', "").lowercase()
        val finalExt = if (ext.isNotEmpty()) ext else "m4a"
        return Pair(base.take(24), finalExt.take(8))
    }
}

