package com.typeeasy

import android.content.Context

/**
 * SharedPreferences for floating overlay: transcription mode, voice base URL, speech-translate API.
 * Updated from React Native via [FloatingMicModule.syncFloatingMicSettings].
 */
object FloatingMicConfigStore {
    private const val PREFS = "floating_mic_config"
    private const val KEY_INTERNAL = "internal_transcribe"
    private const val KEY_VOICE_BASE_URL = "voice_transcribe_base_url"
    private const val KEY_SPEECH_TRANSLATE_PATH = "speech_translate_path"
    private const val KEY_SOURCE_LANG = "translate_source_lang"
    private const val KEY_TARGET_LANG = "translate_target_lang"
    private const val KEY_ELEVENLABS_API_KEY = "elevenlabs_api_key"
    /** Show microphone capture in the floating overlay (at least one of mic/translation must be on). */
    private const val KEY_OVERLAY_MIC = "overlay_mic_enabled"
    /** Show speech-to-translate in the floating overlay. */
    private const val KEY_OVERLAY_TRANSLATION = "overlay_translation_enabled"
    /** When true, floating translation uses on-device ML Kit (no /speech-translate upload). */
    private const val KEY_INTERNAL_TRANSLATION = "internal_floating_translation"
    /** Show Ask Question (AI provider + ML Kit) in the floating overlay. */
    private const val KEY_OVERLAY_ASK = "overlay_ask_question_enabled"
    /** AI provider API key for Ask Question (synced from JS). */
    private const val KEY_AI_PROVIDER_API_KEY = "ai_provider_api_key"
    /** Legacy pref key; migrated on read. */
    private const val KEY_LEGACY_OPENROUTER_API_KEY = "openrouter_api_key"
    /** OpenAI-compatible chat API base (no trailing slash), synced from JS [aiProvider.js]. */
    private const val KEY_AI_CHAT_BASE_URL = "ai_chat_api_base_url"
    /** Chat model id for Ask Question, synced from JS. */
    private const val KEY_AI_CHAT_MODEL = "ai_chat_model"

    /** Default ON: use on-device SpeechRecognizer for Microphone mode. */
    private const val DEFAULT_INTERNAL = true

    private const val DEFAULT_OVERLAY_MIC = true
    private const val DEFAULT_OVERLAY_TRANSLATION = true
    private const val DEFAULT_INTERNAL_TRANSLATION = false
    private const val DEFAULT_OVERLAY_ASK = false

    /**
     * Placeholder synced from JS until the user sets a real key in Settings.
     * When the stored key equals this (trimmed), native falls back to the voice server for MIC mode.
     */
    const val ELEVENLABS_API_KEY_PLACEHOLDER = "YOUR_ELEVENLABS_API_KEY"

    /** Default REST path (change from JS when your backend is ready). */
    const val DEFAULT_SPEECH_TRANSLATE_PATH = "/voice/speech-translate"

    /** Fallback if prefs not yet synced from React Native. Keep in sync with `aiProvider.js`. */
    private const val DEFAULT_AI_CHAT_BASE_URL = "https://openrouter.ai/api/v1"
    private const val DEFAULT_AI_CHAT_MODEL = "liquid/lfm-2.5-1.2b-instruct:free"

    fun isInternalTranscribeEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_INTERNAL, DEFAULT_INTERNAL)
    }

    fun getVoiceTranscribeBaseUrl(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_VOICE_BASE_URL, "")?.trim().orEmpty()
    }

    fun getSpeechTranslatePath(context: Context): String {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SPEECH_TRANSLATE_PATH, "")?.trim().orEmpty()
        return if (p.isEmpty()) DEFAULT_SPEECH_TRANSLATE_PATH else p
    }

    fun getTranslateSourceLang(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SOURCE_LANG, "en")?.trim().orEmpty().ifEmpty { "en" }
    }

    fun getTranslateTargetLang(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_TARGET_LANG, "es")?.trim().orEmpty().ifEmpty { "es" }
    }

    fun getElevenLabsApiKey(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_ELEVENLABS_API_KEY, "")?.trim().orEmpty()
    }

    /** True when MIC cloud path should call ElevenLabs instead of /voice/transcribe. */
    fun shouldUseElevenLabsForMicTranscribe(context: Context): Boolean {
        val key = getElevenLabsApiKey(context)
        return key.isNotEmpty() && key != ELEVENLABS_API_KEY_PLACEHOLDER
    }

    fun isOverlayMicEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_OVERLAY_MIC, DEFAULT_OVERLAY_MIC)
    }

    fun isOverlayTranslationEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_OVERLAY_TRANSLATION, DEFAULT_OVERLAY_TRANSLATION)
    }

    fun isInternalFloatingTranslationEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_INTERNAL_TRANSLATION, DEFAULT_INTERNAL_TRANSLATION)
    }

    fun isOverlayAskQuestionEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_OVERLAY_ASK, DEFAULT_OVERLAY_ASK)
    }

    fun getAiProviderApiKey(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        var v = prefs.getString(KEY_AI_PROVIDER_API_KEY, null)?.trim().orEmpty()
        if (v.isNotEmpty()) return v
        val legacy = prefs.getString(KEY_LEGACY_OPENROUTER_API_KEY, null)?.trim().orEmpty()
        if (legacy.isNotEmpty()) {
            prefs.edit()
                .putString(KEY_AI_PROVIDER_API_KEY, legacy)
                .remove(KEY_LEGACY_OPENROUTER_API_KEY)
                .apply()
            return legacy
        }
        return ""
    }

    fun getAiChatApiBaseUrl(context: Context): String {
        val v = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_AI_CHAT_BASE_URL, null)?.trim().orEmpty()
        return v.ifEmpty { DEFAULT_AI_CHAT_BASE_URL }
    }

    fun getAiChatModel(context: Context): String {
        val v = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_AI_CHAT_MODEL, null)?.trim().orEmpty()
        return v.ifEmpty { DEFAULT_AI_CHAT_MODEL }
    }

    fun applySettings(
        context: Context,
        internalTranscribe: Boolean,
        voiceBaseUrl: String,
        speechTranslatePath: String,
        sourceLang: String,
        targetLang: String,
        elevenLabsApiKey: String,
        overlayMicEnabled: Boolean,
        overlayTranslationEnabled: Boolean,
        internalFloatingTranslation: Boolean,
        overlayAskQuestionEnabled: Boolean,
        aiProviderApiKey: String,
        aiChatApiBaseUrl: String,
        aiChatModel: String,
    ) {
        var mic = overlayMicEnabled
        var trans = overlayTranslationEnabled
        var ask = overlayAskQuestionEnabled
        if (!mic && !trans && !ask) {
            mic = true
            trans = false
            ask = false
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            putBoolean(KEY_INTERNAL, internalTranscribe)
            putString(KEY_VOICE_BASE_URL, voiceBaseUrl.trim())
            val path = speechTranslatePath.trim().ifEmpty { DEFAULT_SPEECH_TRANSLATE_PATH }
            putString(KEY_SPEECH_TRANSLATE_PATH, path)
            putString(KEY_SOURCE_LANG, sourceLang.trim().ifEmpty { "en" })
            putString(KEY_TARGET_LANG, targetLang.trim().ifEmpty { "es" })
            putString(KEY_ELEVENLABS_API_KEY, elevenLabsApiKey.trim())
            putBoolean(KEY_OVERLAY_MIC, mic)
            putBoolean(KEY_OVERLAY_TRANSLATION, trans)
            putBoolean(KEY_INTERNAL_TRANSLATION, internalFloatingTranslation)
            putBoolean(KEY_OVERLAY_ASK, ask)
            putString(KEY_AI_PROVIDER_API_KEY, aiProviderApiKey.trim())
            putString(
                KEY_AI_CHAT_BASE_URL,
                aiChatApiBaseUrl.trim().ifEmpty { DEFAULT_AI_CHAT_BASE_URL },
            )
            putString(
                KEY_AI_CHAT_MODEL,
                aiChatModel.trim().ifEmpty { DEFAULT_AI_CHAT_MODEL },
            )
            remove(KEY_LEGACY_OPENROUTER_API_KEY)
            apply()
        }
    }
}
