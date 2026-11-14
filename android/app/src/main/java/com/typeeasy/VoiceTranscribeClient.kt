package com.typeeasy

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * POSTs audio to the same /voice/transcribe endpoint used by React Native voiceApi.js
 */
object VoiceTranscribeClient {
    private const val TAG = "VoiceTranscribeClient"

    data class TranscribeResult(
        val transcript: String,
        val rawTranscript: String,
        val voiceAssetId: String?,
    )

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    fun transcribeFile(
        baseUrl: String,
        audioFile: File,
        language: String = "en-US",
    ): Result<String> =
        transcribeFileFull(baseUrl, audioFile, language).map { it.transcript }

    fun transcribeFileFull(
        baseUrl: String,
        audioFile: File,
        language: String = "en-US",
    ): Result<TranscribeResult> {
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
            val voiceAssetId = extractVoiceAssetId(bodyString)
            val raw = extractRawTranscript(bodyString).ifBlank { text }
            return if (text.isBlank()) {
                Result.failure(IllegalStateException("Empty transcript from server"))
            } else {
                Result.success(
                    TranscribeResult(
                        transcript = text.trim(),
                        rawTranscript = raw.trim(),
                        voiceAssetId = voiceAssetId,
                    ),
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "transcribeFile failed", e)
            return Result.failure(e)
        }
    }

    private fun extractVoiceAssetId(json: String): String? {
        if (json.isBlank()) return null
        return try {
            val root = JSONObject(json)
            val data = if (root.has("data")) root.optJSONObject("data") else null
            val obj = data ?: root
            firstNonBlank(
                obj.optString("voiceAssetId"),
                obj.optString("easyVoiceAssetId"),
                obj.optString("id"),
            ).ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractRawTranscript(json: String): String {
        if (json.isBlank()) return ""
        return try {
            val root = JSONObject(json)
            val data = if (root.has("data")) root.optJSONObject("data") else null
            val obj = data ?: root
            firstNonBlank(
                obj.optString("rawTranscript"),
                obj.optString("transcript"),
                obj.optString("text"),
            )
        } catch (_: Exception) {
            ""
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

    // ─────────────── Groq-Aware Entry Points ───────────────

    private fun getAiEngine(context: Context): String =
        context.getSharedPreferences("TypeEasyPrefs", Context.MODE_PRIVATE)
            .getString("ai_engine_provider", "default") ?: "default"

    private fun getGroqMimeType(file: File): String = when (file.extension.lowercase()) {
        "m4a", "mp4" -> "audio/mp4"
        "aac" -> "audio/aac"
        "mp3" -> "audio/mpeg"
        "wav" -> "audio/wav"
        else -> "audio/mp4"
    }

    /**
     * Groq Whisper transcription: POST to /audio/transcriptions
     */
    private fun transcribeWithGroq(audioFile: File): Result<String> {
        val apiKey = com.typeeasy.generated.ApiConfig.GROQ_API_KEY
        val baseUrl = com.typeeasy.generated.ApiConfig.GROQ_BASE_URL.trimEnd('/')
        val model = com.typeeasy.generated.ApiConfig.GROQ_STT_MODEL
        return try {
            val mediaType = getGroqMimeType(audioFile).toMediaType()
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", audioFile.name, audioFile.asRequestBody(mediaType))
                .addFormDataPart("model", model)
                .addFormDataPart("response_format", "json")
                .build()
            val request = Request.Builder()
                .url("$baseUrl/audio/transcriptions")
                .post(multipart)
                .header("Authorization", "Bearer $apiKey")
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                return Result.failure(IllegalStateException("Groq STT error ${response.code}: $body"))
            }
            val text = JSONObject(body).optString("text").trim()
            if (text.isBlank()) Result.failure(IllegalStateException("Groq returned empty transcript"))
            else Result.success(text)
        } catch (e: Exception) {
            Log.e(TAG, "transcribeWithGroq failed", e)
            Result.failure(e)
        }
    }

    /**
     * Groq translation pipeline: POST /audio/translations (always English), then optionally chain
     * a chat completion if targetLanguage != "en".
     */
    private fun translateSpeechWithGroq(audioFile: File, targetLanguage: String): Result<String> {
        val apiKey = com.typeeasy.generated.ApiConfig.GROQ_API_KEY
        val baseUrl = com.typeeasy.generated.ApiConfig.GROQ_BASE_URL.trimEnd('/')
        val fastModel = com.typeeasy.generated.ApiConfig.GROQ_FAST_LLM_MODEL
        return try {
            val mediaType = getGroqMimeType(audioFile).toMediaType()
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", audioFile.name, audioFile.asRequestBody(mediaType))
                .addFormDataPart("model", "whisper-large-v3")
                .addFormDataPart("response_format", "json")
                .build()
            val request = Request.Builder()
                .url("$baseUrl/audio/translations")
                .post(multipart)
                .header("Authorization", "Bearer $apiKey")
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                return Result.failure(IllegalStateException("Groq translate error ${response.code}: $body"))
            }
            val englishText = JSONObject(body).optString("text").trim()
            val normTarget = targetLanguage.split("-", "_")[0].lowercase()
            if (normTarget == "en" || englishText.isBlank()) return Result.success(englishText)

            // Chain chat completion for non-English target
            val chatBody = JSONObject().apply {
                put("model", fastModel)
                put("temperature", 0.2)
                if (fastModel.contains("gpt-oss")) {
                    put("reasoning_effort", "low")
                }
                put("messages", JSONArray().apply {
                    put(JSONObject().apply {
                        put("role", "system")
                        put("content", "Translate the user text to $targetLanguage. Return ONLY the translated text.")
                    })
                    put(JSONObject().apply {
                        put("role", "user")
                        put("content", englishText)
                    })
                })
            }.toString()
            val chatReq = Request.Builder()
                .url("$baseUrl/chat/completions")
                .post(chatBody.toRequestBody("application/json".toMediaType()))
                .header("Authorization", "Bearer $apiKey")
                .header("Content-Type", "application/json")
                .build()
            val chatResp = client.newCall(chatReq).execute()
            val chatRespBody = chatResp.body?.string().orEmpty()
            val translated = JSONObject(chatRespBody)
                .optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                ?.trim() ?: englishText
            Result.success(translated)
        } catch (e: Exception) {
            Log.e(TAG, "translateSpeechWithGroq failed", e)
            Result.failure(e)
        }
    }

    /**
     * Context-aware transcription: routes to Groq if engine == "groq".
     */
    fun transcribeFileContextAware(
        context: Context,
        defaultBaseUrl: String,
        audioFile: File,
        language: String = "en-US",
    ): Result<String> {
        return if (getAiEngine(context) == "groq") {
            transcribeWithGroq(audioFile)
        } else {
            transcribeFile(defaultBaseUrl, audioFile, language)
        }
    }

    /**
     * Context-aware full transcription (with TranscribeResult): routes to Groq if engine == "groq".
     */
    fun transcribeFileFullContextAware(
        context: Context,
        defaultBaseUrl: String,
        audioFile: File,
        language: String = "en-US",
    ): Result<TranscribeResult> {
        return if (getAiEngine(context) == "groq") {
            transcribeWithGroq(audioFile).map { text ->
                TranscribeResult(
                    transcript = text,
                    rawTranscript = text,
                    voiceAssetId = "groq-" + System.currentTimeMillis(),
                )
            }
        } else {
            transcribeFileFull(defaultBaseUrl, audioFile, language)
        }
    }

    /**
     * Context-aware speech translate: routes to Groq if engine == "groq".
     */
    fun translateSpeechFileContextAware(
        context: Context,
        defaultBaseUrl: String,
        defaultPath: String,
        audioFile: File,
        sourceLanguage: String,
        targetLanguage: String,
    ): Result<String> {
        return if (getAiEngine(context) == "groq") {
            translateSpeechWithGroq(audioFile, targetLanguage)
        } else {
            translateSpeechFile(defaultBaseUrl, defaultPath, audioFile, sourceLanguage, targetLanguage)
        }
    }
}
