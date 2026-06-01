package com.typeeasy

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/** POST /voice/execute and PUT /voice/transcript — mirrors src/api/voiceApi.js */
object VoiceCommandClient {
    private const val TAG = "VoiceCommandClient"

    data class ExecuteResult(
        val executionId: String?,
        val status: String?,
        val result: String?,
        val executedAt: String?,
    )

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun updateTranscript(
        baseUrl: String,
        voiceAssetId: String,
        finalTranscript: String,
    ): Result<String> {
        val trimmedBase = baseUrl.trimEnd('/')
        if (trimmedBase.isEmpty()) {
            return Result.failure(IllegalStateException("Voice API base URL is not configured"))
        }
        if (voiceAssetId.isBlank()) {
            return Result.failure(IllegalStateException("Voice asset ID is required"))
        }
        val text = finalTranscript.trim()
        if (text.isEmpty()) {
            return Result.failure(IllegalStateException("Transcript text cannot be empty"))
        }

        return try {
            val body = JSONObject()
                .put("finalTranscript", text)
                .put("voiceAssetId", voiceAssetId)
                .toString()
                .toRequestBody(jsonMedia)

            val request = Request.Builder()
                .url("$trimmedBase/voice/transcript")
                .put(body)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val msg = parseErrorMessage(bodyString) ?: "Server error ${response.code}"
                return Result.failure(IllegalStateException(msg))
            }

            if (bodyString.isBlank()) {
                return Result.success(voiceAssetId)
            }

            val json = try {
                JSONObject(bodyString)
            } catch (e: Exception) {
                Log.w(TAG, "updateTranscript non-JSON success body", e)
                return Result.success(voiceAssetId)
            }
            val newId = parseVoiceAssetId(json, voiceAssetId)
            Result.success(newId)
        } catch (e: Exception) {
            Log.e(TAG, "updateTranscript failed", e)
            Result.failure(e)
        }
    }

    fun executeVoiceCommand(
        baseUrl: String,
        voiceAssetId: String,
    ): Result<ExecuteResult> {
        val trimmedBase = baseUrl.trimEnd('/')
        if (trimmedBase.isEmpty()) {
            return Result.failure(IllegalStateException("Voice API base URL is not configured"))
        }
        if (voiceAssetId.isBlank()) {
            return Result.failure(IllegalStateException("Voice asset ID is required"))
        }

        return try {
            val body = JSONObject()
                .put("easyVoiceAssetId", voiceAssetId)
                .put("executeAt", isoTimestampNow())
                .toString()
                .toRequestBody(jsonMedia)

            val request = Request.Builder()
                .url("$trimmedBase/voice/execute")
                .post(body)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val msg = parseErrorMessage(bodyString) ?: "Server error ${response.code}"
                return Result.failure(IllegalStateException(msg))
            }

            if (bodyString.isBlank()) {
                return Result.success(
                    ExecuteResult(
                        executionId = null,
                        status = "executed",
                        result = null,
                        executedAt = null,
                    ),
                )
            }

            val json = try {
                JSONObject(bodyString)
            } catch (e: Exception) {
                Log.w(TAG, "executeVoiceCommand non-JSON success body", e)
                return Result.success(
                    ExecuteResult(
                        executionId = null,
                        status = "executed",
                        result = bodyString.take(200).ifBlank { null },
                        executedAt = null,
                    ),
                )
            }
            val resultText = extractExecuteResultText(json)
            Result.success(
                ExecuteResult(
                    executionId = parseNestedString(json, "executionId"),
                    status = parseNestedString(json, "status") ?: "executed",
                    result = resultText.ifBlank { null },
                    executedAt = parseNestedString(json, "executedAt"),
                ),
            )
        } catch (e: Exception) {
            Log.e(TAG, "executeVoiceCommand failed", e)
            Result.failure(e)
        }
    }

    private fun parseVoiceAssetId(json: JSONObject, fallback: String): String {
        val direct = json.optString("voiceAssetId").ifBlank { null }
        if (direct != null) return direct
        val data = json.optJSONObject("data") ?: return fallback
        return data.optString("voiceAssetId").ifBlank { fallback }
    }

    private fun parseNestedString(json: JSONObject, key: String): String? {
        val direct = json.optString(key).ifBlank { null }
        if (direct != null) return direct
        val data = json.optJSONObject("data") ?: return null
        return data.optString(key).ifBlank { null }
    }

    private fun extractExecuteResultText(json: JSONObject): String {
        val direct = json.optString("result").ifBlank { null }
        if (direct != null) return direct
        val message = json.optString("message").ifBlank { null }
        if (message != null) return message
        val data = json.optJSONObject("data")
        if (data != null) {
            val inner = data.optString("result").ifBlank { null }
                ?: data.optString("message").ifBlank { null }
                ?: data.optString("text").ifBlank { null }
            if (inner != null) return inner
        }
        return json.toString()
    }

    private fun isoTimestampNow(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
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
}
