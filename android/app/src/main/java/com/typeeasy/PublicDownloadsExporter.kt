package com.typeeasy

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Exports a recording file into a user-visible location:
 * - API 29+: MediaStore Downloads collection (shows in Downloads / Files apps)
 * - API <29: /storage/emulated/0/Download/CallRecordings (requires WRITE_EXTERNAL_STORAGE)
 *
 * Returns a Uri string (content://...) on API 29+, or absolute file path on older devices.
 */
object PublicDownloadsExporter {
    private const val TAG = "PublicDownloadsExporter"
    private const val SUBDIR = "CallRecordings"

    fun export(context: Context, source: File, mime: String, displayName: String? = null): String? {
        if (!source.exists() || source.length() <= 0L) return null
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                exportViaMediaStore(context, source, mime, displayName)?.toString()
            } else {
                exportViaLegacyPublicDir(context, source, mime, displayName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "export failed: ${e.message}", e)
            null
        }
    }

    private fun exportViaMediaStore(context: Context, source: File, mime: String, displayName: String?): Uri? {
        val resolver = context.contentResolver
        val name = (displayName?.trim()?.takeIf { it.isNotEmpty() } ?: source.name)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + File.separator + SUBDIR)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val uri = resolver.insert(collection, values) ?: return null

        resolver.openOutputStream(uri)?.use { out ->
            FileInputStream(source).use { input ->
                input.copyTo(out)
            }
        } ?: run {
            // Cleanup the row if we couldn't write.
            resolver.delete(uri, null, null)
            return null
        }

        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    }

    private fun exportViaLegacyPublicDir(context: Context, source: File, mime: String, displayName: String?): String? {
        @Suppress("DEPRECATION")
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val dir = File(downloads, SUBDIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        val name = (displayName?.trim()?.takeIf { it.isNotEmpty() } ?: source.name)
        val dest = File(dir, name)
        FileInputStream(source).use { input ->
            FileOutputStream(dest).use { out ->
                input.copyTo(out)
            }
        }
        try {
            MediaScannerConnection.scanFile(
                context,
                arrayOf(dest.absolutePath),
                arrayOf(mime),
                null,
            )
        } catch (_: Exception) {
        }
        return dest.absolutePath
    }
}

