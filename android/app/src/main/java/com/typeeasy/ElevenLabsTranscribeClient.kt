package com.typeeasy

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * ElevenLabs Speech-to-Text (POST /v1/speech-to-text).
 * @see https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */
object ElevenLabsTranscribeClient {
    private const val TAG = "ElevenLabsSTT"
    private const val URL = "https://api.elevenlabs.io/v1/speech-to-text"
    private const val DEFAULT_MODEL_ID = "scribe_v2"

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    fun transcribeFile(
        apiKey: String,
        audioFile: File,
        languageCode: String? = null,
        modelId: String = DEFAULT_MODEL_ID,
    ): Result<String> {
        val key = apiKey.trim()
        if (key.isEmpty()) {
            return Result.failure(IllegalStateException("ElevenLabs API key is missing"))
        }
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
                .addFormDataPart("model_id", modelId)
                .apply {
                    val lang = languageCode?.trim()?.takeIf { it.isNotEmpty() }
                    if (lang != null) {
                        addFormDataPart("language_code", lang)
                    }
                }
                .build()

            val request = Request.Builder()
                .url(URL)
                .header("xi-api-key", key)
                .header("Accept", "application/json")
                .post(multipart)
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()

            if (!response.isSuccessful) {
                val msg = parseErrorMessage(bodyString)
                    ?: "ElevenLabs error ${response.code}"
                Log.e(TAG, "HTTP ${response.code}: $bodyString")
                return Result.failure(IllegalStateException(msg))
            }

            val text = extractTranscript(bodyString)
            return if (text.isBlank()) {
                Result.failure(IllegalStateException("Empty transcript from ElevenLabs"))
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
                ?: parseValidationDetail(o.optJSONArray("detail"))
        } catch (_: Exception) {
            null
        }
    }

    private fun parseValidationDetail(detail: JSONArray?): String? {
        if (detail == null || detail.length() == 0) return null
        return try {
            val parts = mutableListOf<String>()
            for (i in 0 until detail.length()) {
                val item = detail.optJSONObject(i) ?: continue
                val msg = item.optString("msg").trim()
                if (msg.isNotEmpty()) parts.add(msg)
            }
            parts.joinToString("; ").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractTranscript(json: String): String {
        if (json.isBlank()) return ""
        return try {
            val root = JSONObject(json)
            if (root.has("transcripts")) {
                val arr = root.optJSONArray("transcripts")
                if (arr != null && arr.length() > 0) {
                    val first = arr.optJSONObject(0)
                    first?.optString("text").orEmpty()
                } else {
                    ""
                }
            } else {
                root.optString("text")
            }
        } catch (_: Exception) {
            ""
        }
    }
}
