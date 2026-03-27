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

    /** Default ON: use on-device SpeechRecognizer for Microphone mode. */
    private const val DEFAULT_INTERNAL = true

    /**
     * Placeholder synced from JS until the user sets a real key in Settings.
     * When the stored key equals this (trimmed), native falls back to the voice server for MIC mode.
     */
    const val ELEVENLABS_API_KEY_PLACEHOLDER = "YOUR_ELEVENLABS_API_KEY"

    /** Default REST path (change from JS when your backend is ready). */
    const val DEFAULT_SPEECH_TRANSLATE_PATH = "/voice/speech-translate"

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

    fun applySettings(
        context: Context,
        internalTranscribe: Boolean,
        voiceBaseUrl: String,
        speechTranslatePath: String,
        sourceLang: String,
        targetLang: String,
        elevenLabsApiKey: String,
    ) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            putBoolean(KEY_INTERNAL, internalTranscribe)
            putString(KEY_VOICE_BASE_URL, voiceBaseUrl.trim())
            val path = speechTranslatePath.trim().ifEmpty { DEFAULT_SPEECH_TRANSLATE_PATH }
            putString(KEY_SPEECH_TRANSLATE_PATH, path)
            putString(KEY_SOURCE_LANG, sourceLang.trim().ifEmpty { "en" })
            putString(KEY_TARGET_LANG, targetLang.trim().ifEmpty { "es" })
            putString(KEY_ELEVENLABS_API_KEY, elevenLabsApiKey.trim())
            apply()
        }
    }
}
