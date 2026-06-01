package com.typeeasy

/** Maps API / network errors to user-friendly copy for the floating voice command UI. */
object VoiceCommandErrorMapper {

    fun toUserMessage(raw: String?): String {
        val msg = raw?.trim().orEmpty()
        if (msg.isEmpty()) {
            return "Something went wrong. Please try again."
        }
        val lower = msg.lowercase()

        val httpCode = Regex("(?:server error|http|status)\\s*(\\d{3})").find(lower)?.groupValues?.getOrNull(1)
            ?: Regex("\\b(5\\d{2}|4\\d{2})\\b").find(msg)?.groupValues?.getOrNull(1)

        when (httpCode) {
            "503", "502", "504" ->
                return "Our voice service is temporarily unavailable. Please try again in a few minutes."
            "500" ->
                return "Something went wrong on our servers. Please try again later."
            "401", "403" ->
                return "Please open Type Easy, sign in, and try again."
            "404" ->
                return "The voice service could not be reached. Check app settings and try again."
            "408", "429" ->
                return "The request took too long. Please wait a moment and try again."
        }

        when {
            lower.contains("503") || lower.contains("service unavailable") ->
                return "Our voice service is temporarily unavailable. Please try again in a few minutes."
            lower.contains("502") || lower.contains("504") || lower.contains("bad gateway") ->
                return "We're having trouble reaching the server. Check your connection and try again."
            lower.contains("500") && lower.contains("server") ->
                return "Something went wrong on our servers. Please try again later."
            lower.contains("401") || lower.contains("403") || lower.contains("unauthorized") ->
                return "Please open Type Easy, sign in, and try again."
            lower.contains("404") || lower.contains("not found") ->
                return "The voice service could not be reached. Check app settings and try again."
            lower.contains("network") || lower.contains("unable to resolve") ||
                lower.contains("connection refused") || lower.contains("failed to connect") ->
                return "No internet connection. Connect to the internet and try again."
            lower.contains("timeout") || lower.contains("timed out") ->
                return "The request took too long. Please try again."
            lower.contains("empty transcript") ->
                return "We couldn't understand the recording. Try speaking again clearly."
            lower.contains("missing voice asset") || lower.contains("re-record") ->
                return "Recording could not be processed. Please record again."
            lower.contains("not configured") || lower.contains("base url") ->
                return "Voice service is not set up. Open Type Easy → Settings and try again."
            lower.contains("server error") ->
                return "We couldn't reach the voice service. Please try again."
            lower.contains("execution failed") ->
                return "Your command could not be run. Please try again."
            lower.contains("transcription failed") || lower.contains("transcribe") ->
                return "We couldn't transcribe your voice. Please record again."
            else -> return "Something went wrong. Please try again."
        }
    }
}
