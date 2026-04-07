package com.typeeasy

import android.content.Context
import android.os.Environment
import java.io.File

/**
 * Store call recordings where users can open them in the system Files app:
 * Android/data (app package) / files / Download / CallRecordings
 * No extra storage permission is required (app-specific external storage).
 */
object CallRecordingsStorage {
    private const val FOLDER_NAME = "CallRecordings"

    fun getCallRecordingsDir(context: Context): File {
        val base = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: context.getExternalFilesDir(Environment.DIRECTORY_MUSIC)
            ?: context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
        val root = base ?: context.filesDir
        val dir = File(root, FOLDER_NAME)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /** Older builds wrote here only. */
    fun legacyInternalDir(context: Context): File = File(context.filesDir, "call_recordings")

    fun listAudioFiles(context: Context): List<File> {
        val filter: (File) -> Boolean = { f ->
            f.isFile && (f.name.endsWith(".wav", ignoreCase = true) || f.name.endsWith(".m4a", ignoreCase = true))
        }
        val out = mutableListOf<File>()
        val legacy = legacyInternalDir(context)
        if (legacy.isDirectory) {
            legacy.listFiles()?.filter(filter)?.let { out.addAll(it) }
        }
        val pub = getCallRecordingsDir(context)
        if (pub.isDirectory) {
            pub.listFiles()?.filter(filter)?.let { out.addAll(it) }
        }
        return out.distinctBy { it.absolutePath }.sortedByDescending { it.lastModified() }
    }
}
