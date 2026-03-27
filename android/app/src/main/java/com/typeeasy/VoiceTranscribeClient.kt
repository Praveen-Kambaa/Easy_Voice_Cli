package com.typeeasy

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * POSTs audio to the same /voice/transcribe endpoint used by React Native voiceApi.js
 */
object VoiceTranscribeClient {
    private const val TAG = "VoiceTranscribeClient"

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    fun transcribeFile(
        baseUrl: String,
        audioFile: File,
        language: String = "en-US",
    ): Result<String> {
        val trimmedBase = baseUrl.trimEnd('/')
        if (trimmedBase.isEmpty()) {
            return Result.failure(IllegalStateException("Voice API base URL is not configured"))
        }
        val url = "$trimmedBase/voice/transcribe"
        if (!audioFile.exists() || audioFile.length() == 0L) {
            return Result.failure(IllegalStateException("Recording file is missing or empty"))
        }

        return try {
            val mime = when (audioFile.extension.lowercase()) {
                "m4a", "mp4" -> "audio/mp4"
                "aac" -> "audio/aac"
                "mp3" -> "audio/mpeg"
                "wav" -> "audio/wav"
                else -> "audio/mp4"
            }
            val mediaType = mime.toMediaType()
            val fileBody = audioFile.asRequestBody(mediaType)
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", audioFile.name, fileBody)
                .addFormDataPart("language", language)
                .addFormDataPart("enablePunctuation", "true")
                .addFormDataPart("enableTimestamps", "false")
                .build()

            val request = Request.Builder()
                .url(url)
                .post(multipart)
                .header("Accept", "application/json")
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()

            if (!response.isSuccessful) {
                val msg = parseErrorMessage(bodyString)
                    ?: "Server error ${response.code}"
                Log.e(TAG, "HTTP ${response.code}: $bodyString")
                return Result.failure(IllegalStateException(msg))
            }

            val text = extractTranscript(bodyString)
            return if (text.isBlank()) {
                Result.failure(IllegalStateException("Empty transcript from server"))
            } else {
                Result.success(text.trim())
            }
        } catch (e: Exception) {
            Log.e(TAG, "transcribeFile failed", e)
            return Result.failure(e)
        }
    }

    private fun parseErrorMessage(json: String): String? {
        if (json.isBlank()) return null
        return try {
            val o = JSONObject(json)
            o.optString("message").ifBlank { null }
                ?: o.optString("error").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractTranscript(json: String): String {
        if (json.isBlank()) return ""
        return try {
            val root = JSONObject(json)
            val data = if (root.has("data")) root.optJSONObject("data") else null
            val obj = data ?: root
            firstNonBlank(
                obj.optString("refinedTranscript"),
                obj.optString("rawTranscript"),
                obj.optString("transcript"),
                obj.optString("text"),
            )
        } catch (_: Exception) {
            ""
        }
    }

    private fun firstNonBlank(vararg values: String): String {
        for (v in values) {
            if (v.isNotBlank()) return v
        }
        return ""
    }

    /**
     * Speech → text → translate on server. Default path `/voice/speech-translate` (override via prefs).
     * Form fields: [file], sourceLanguage, targetLanguage — adjust when your API spec is final.
     */
    fun translateSpeechFile(
        baseUrl: String,
        pathSegment: String,
        audioFile: File,
        sourceLanguage: String,
        targetLanguage: String,
    ): Result<String> {
        val trimmedBase = baseUrl.trimEnd('/')
        val path = if (pathSegment.startsWith("/")) pathSegment else "/$pathSegment"
        if (trimmedBase.isEmpty()) {
            return Result.failure(IllegalStateException("Voice API base URL is not configured"))
        }
        val url = trimmedBase + path
        if (!audioFile.exists() || audioFile.length() == 0L) {
            return Result.failure(IllegalStateException("Recording file is missing or empty"))
        }

        return try {
            val mime = when (audioFile.extension.lowercase()) {
                "m4a", "mp4" -> "audio/mp4"
                "aac" -> "audio/aac"
                "mp3" -> "audio/mpeg"
                "wav" -> "audio/wav"
                else -> "audio/mp4"
            }
            val mediaType = mime.toMediaType()
            val fileBody = audioFile.asRequestBody(mediaType)
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", audioFile.name, fileBody)
                .addFormDataPart("sourceLanguage", sourceLanguage)
                .addFormDataPart("targetLanguage", targetLanguage)
                .addFormDataPart("enablePunctuation", "true")
                .build()

            val request = Request.Builder()
                .url(url)
                .post(multipart)
                .header("Accept", "application/json")
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()

            if (!response.isSuccessful) {
                val msg = parseErrorMessage(bodyString)
                    ?: "Server error ${response.code}"
                Log.e(TAG, "translate HTTP ${response.code}: $bodyString")
                return Result.failure(IllegalStateException(msg))
            }

            val text = extractTranslatedText(bodyString)
            return if (text.isBlank()) {
                Result.failure(IllegalStateException("Empty translation from server"))
            } else {
                Result.success(text.trim())
            }
        } catch (e: Exception) {
            Log.e(TAG, "translateSpeechFile failed", e)
            return Result.failure(e)
        }
    }

    private fun extractTranslatedText(json: String): String {
        if (json.isBlank()) return ""
        return try {
            val root = JSONObject(json)
            val data = if (root.has("data")) root.optJSONObject("data") else null
            val obj = data ?: root
            firstNonBlank(
                obj.optString("translatedText"),
                obj.optString("translation"),
                obj.optString("refinedTranscript"),
                obj.optString("rawTranscript"),
                obj.optString("transcript"),
                obj.optString("text"),
            )
        } catch (_: Exception) {
            ""
        }
    }
}
