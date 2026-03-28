package com.typeeasy

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * OpenAI-compatible chat completions for floating "Ask Question".
 * Base URL and model id come from [FloatingMicConfigStore] (synced from JS `aiProvider.js`).
 */
object AiProviderChatClient {
    private const val TAG = "AiProviderChatClient"

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    fun chatCompletion(context: Context, apiKey: String, userQuestion: String): Result<String> {
        val key = apiKey.trim()
        if (key.isEmpty()) {
            return Result.failure(IllegalStateException("AI provider API key is not set"))
        }
        val q = userQuestion.trim()
        if (q.isEmpty()) {
            return Result.failure(IllegalStateException("Empty question"))
        }

        val baseUrl = FloatingMicConfigStore.getAiChatApiBaseUrl(context).trimEnd('/')
        val model = FloatingMicConfigStore.getAiChatModel(context)
        if (baseUrl.isEmpty()) {
            return Result.failure(IllegalStateException("AI chat base URL is not configured"))
        }
        if (model.isEmpty()) {
            return Result.failure(IllegalStateException("AI chat model is not configured"))
        }

        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "Answer clearly and concisely."))
            .put(JSONObject().put("role", "user").put("content", q))

        val bodyJson = JSONObject()
            .put("model", model)
            .put("max_tokens", 200)
            .put("messages", messages)
            .toString()

        return try {
            val body = bodyJson.toRequestBody(jsonMedia)
            val request = Request.Builder()
                .url("$baseUrl/chat/completions")
                .post(body)
                .header("Authorization", "Bearer $key")
                .header("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string().orEmpty()

            if (!response.isSuccessful) {
                val errMsg = parseProviderError(bodyString) ?: "AI HTTP ${response.code}"
                Log.e(TAG, "HTTP ${response.code}: $bodyString")
                return Result.failure(IllegalStateException(errMsg))
            }

            val content = extractAssistantContent(bodyString)
            if (content.isBlank()) {
                Result.failure(IllegalStateException("No answer from the model"))
            } else {
                Result.success(content.trim())
            }
        } catch (e: Exception) {
            Log.e(TAG, "chatCompletion failed", e)
            Result.failure(IllegalStateException(e.message ?: "AI request failed"))
        }
    }

    private fun parseProviderError(json: String): String? {
        return try {
            val obj = JSONObject(json)
            obj.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractAssistantContent(json: String): String {
        return try {
            val root = JSONObject(json)
            val choices = root.optJSONArray("choices") ?: return ""
            if (choices.length() == 0) return ""
            val first = choices.optJSONObject(0) ?: return ""
            val msg = first.optJSONObject("message") ?: return ""
            msg.optString("content", "")
        } catch (_: Exception) {
            ""
        }
    }
}
