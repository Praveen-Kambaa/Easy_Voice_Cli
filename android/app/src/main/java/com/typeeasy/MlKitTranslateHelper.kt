package com.typeeasy

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions

/**
 * On-device translation for the floating overlay (same ML Kit stack as the Translator screen).
 */
object MlKitTranslateHelper {
    private const val TAG = "MlKitTranslateHelper"

    fun translate(
        context: Context,
        text: String,
        sourceAppCode: String,
        targetAppCode: String,
    ): Result<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            return Result.failure(IllegalStateException("No speech detected"))
        }
        val srcTag = sourceAppCode.trim().lowercase()
        val tgtTag = targetAppCode.trim().lowercase()
        val src = TranslateLanguage.fromLanguageTag(srcTag)
        val tgt = TranslateLanguage.fromLanguageTag(tgtTag)
        if (src == null) {
            return Result.failure(IllegalStateException("Unsupported source language for on-device translation"))
        }
        if (tgt == null) {
            return Result.failure(IllegalStateException("Unsupported target language for on-device translation"))
        }
        if (src == tgt) {
            return Result.success(trimmed)
        }

        return try {
            val options = TranslatorOptions.Builder()
                .setSourceLanguage(src)
                .setTargetLanguage(tgt)
                .build()
            val translator = Translation.getClient(options)
            val conditions = DownloadConditions.Builder().build()
            Log.d(TAG, "downloadModelIfNeeded + translate ($srcTag → $tgtTag)")
            Tasks.await(translator.downloadModelIfNeeded(conditions))
            val out = Tasks.await(translator.translate(trimmed))
            translator.close()
            if (out.isNullOrBlank()) {
                Result.failure(IllegalStateException("Empty translation result"))
            } else {
                Result.success(out.trim())
            }
        } catch (e: Exception) {
            Log.e(TAG, "translate failed", e)
            Result.failure(
                IllegalStateException(
                    e.message ?: "On-device translation failed. Check network once to download language models.",
                ),
            )
        }
    }
}
