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

    fun typeEasyUrl(endpoint: String)  = "${Servers.TYPE_EASY}$endpoint"
    fun easyVoiceUrl(endpoint: String) = "${Servers.EASY_VOICE}$endpoint"
}
