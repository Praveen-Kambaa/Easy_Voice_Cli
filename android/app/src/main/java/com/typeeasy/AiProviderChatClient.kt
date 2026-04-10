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
import kotlin.math.min

/**
 * OpenAI-compatible chat completions for floating "Ask Question".
 * Base URL and model id come from [FloatingMicConfigStore] (synced from JS `aiProvider.js`).
 */
object AiProviderChatClient {
    fun chatCompletionWithSystem(context: Context, apiKey: String, systemPrompt: String, userQuestion: String): Result<String> {
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
            .put(JSONObject().put("role", "system").put("content", systemPrompt))
            .put(JSONObject().put("role", "user").put("content", q))

        val bodyJson = JSONObject()
            .put("model", model)
            .put("max_tokens", 200)
            .put("messages", messages)
            .toString()

        return try {
            val body = bodyJson.toRequestBody(jsonMedia)
            val reqBuilder = Request.Builder()
                .url("$baseUrl/chat/completions")
                .post(body)
                .header("Authorization", "Bearer $key")
                .header("Content-Type", "application/json")
            if (baseUrl.contains("openrouter.ai", ignoreCase = true)) {
                reqBuilder
                    .header("HTTP-Referer", "https://typeeasy.app")
                    .header("X-OpenRouter-Title", "TypeEasy")
            }
            val request = reqBuilder.build()

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
    private const val TAG = "AiProviderChatClient"

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val liveClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(2, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .writeTimeout(3, TimeUnit.SECONDS)
        .build()

    private var tavilyDisabledUntilMs: Long = 0L

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
            val reqBuilder = Request.Builder()
                .url("$baseUrl/chat/completions")
                .post(body)
                .header("Authorization", "Bearer $key")
                .header("Content-Type", "application/json")
            // Match JS aiService.js: OpenRouter often returns "User not found" without attribution headers.
            if (baseUrl.contains("openrouter.ai", ignoreCase = true)) {
                reqBuilder
                    .header("HTTP-Referer", "https://typeeasy.app")
                    .header("X-OpenRouter-Title", "TypeEasy")
            }
            val request = reqBuilder.build()

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

    /**
     * Best-effort Tavily search summary (2–3s timeouts). Returns '' on failure.
     */
    fun fetchLiveContext(context: Context, query: String): String {
        val now = System.currentTimeMillis()
        if (now < tavilyDisabledUntilMs) return ""
        val tavilyKey = FloatingMicConfigStore.getTavilyApiKey(context).trim()
        if (tavilyKey.isEmpty()) return ""
        val q = query.trim()
        if (q.isEmpty()) return ""

        val bodyJson = JSONObject()
            .put("api_key", tavilyKey)
            .put("query", q)
            .put("max_results", 5)
            .put("include_answer", false)
            .put("include_raw_content", false)
            .toString()

        val req = Request.Builder()
            .url("https://api.tavily.com/search")
            .post(bodyJson.toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .build()

        val resp = liveClient.newCall(req).execute()
        val raw = resp.body?.string().orEmpty()
        if (!resp.isSuccessful) {
            if (resp.code == 402 || raw.contains("credit", ignoreCase = true) || raw.contains("quota", ignoreCase = true)) {
                tavilyDisabledUntilMs = System.currentTimeMillis() + 24L * 60L * 60L * 1000L
            }
            return ""
        }

        val maxChars = 650
        return try {
            val root = JSONObject(raw)
            val arr = root.optJSONArray("results") ?: return ""
            val n = min(arr.length(), 5)
            if (n <= 0) return ""
            val blocks = ArrayList<String>(n)
            for (i in 0 until n) {
                val o = arr.optJSONObject(i) ?: continue
                val titleRaw = o.optString("title", "").trim().replace(Regex("\\s+"), " ")
                val title = if (titleRaw.length > 80) titleRaw.substring(0, 79) + "…" else titleRaw
                val summaryRaw = o.optString("content", "").trim().replace(Regex("\\s+"), " ")
                val summary = if (summaryRaw.length > 160) summaryRaw.substring(0, 159) + "…" else summaryRaw
                if (title.isEmpty() && summary.isEmpty()) continue
                blocks.add(
                    "${i + 1}. Title: ${if (title.isNotEmpty()) title else "(untitled)"}\n" +
                        "   Summary: ${if (summary.isNotEmpty()) summary else "(no summary)"}",
                )
            }
            if (blocks.isEmpty()) return ""
            val text = "Latest information:\n\n" + blocks.joinToString("\n\n") + "\n"
            if (text.length <= maxChars) text else text.substring(0, maxChars - 1) + "…"
        } catch (_: Exception) {
            ""
        }
    }
}
