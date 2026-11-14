package com.typeeasy.generated

/**
 * AUTO-GENERATED — do not edit manually.
 * Generated from src/config/api.js by the generateApiConfig Gradle task.
 * Re-runs automatically on every build whenever api.js changes.
 */
object ApiConfig {

    object Servers {
        const val TYPE_EASY  = "https://easyvoice.kambaaincorporation.in/apiv2"
        const val EASY_VOICE = "https://easy-voice-api.kambaaincorporation.in/api"
    }

    object Endpoints {
        const val TRANSLATE     = "/translate"
        const val GRAMMAR_CHECK = "/grammar-check"
    }

    const val GROQ_BASE_URL       = "https://api.groq.com/openai/v1"
    const val GROQ_API_KEY        = "PASTE_YOUR_GROQ_API_KEY_HERE"
    const val GROQ_STT_MODEL      = "whisper-large-v3-turbo"
    const val GROQ_FAST_LLM_MODEL = "openai/gpt-oss-20b"

    object Groq {
        const val BASE_URL       = "https://api.groq.com/openai/v1"
        const val API_KEY        = "PASTE_YOUR_GROQ_API_KEY_HERE"
        const val STT_MODEL      = "whisper-large-v3-turbo"
        const val FAST_LLM_MODEL = "openai/gpt-oss-20b"
    }

    fun typeEasyUrl(endpoint: String)  = "${Servers.TYPE_EASY}$endpoint"
    fun easyVoiceUrl(endpoint: String) = "${Servers.EASY_VOICE}$endpoint"
}
