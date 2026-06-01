package com.typeeasy

/**
 * On-device suggestions when Datamuse misses fuzzy prefixes (e.g. `taml` → tamil).
 */
object KeyboardSuggestionLexicon {
    private val words: List<String> = buildSet {
        add("tamil")
        add("tamilnadu")
        add("tamil nadu")
        add("chennai")
        add("madurai")
        add("coimbatore")
        add("translate")
        add("translation")
        add("grammar")
        add("voice")
        add("keyboard")
        add("settings")
        add("hello")
        add("thanks")
        add("please")
        add("india")
        add("english")
        add("hindi")
        add("telugu")
        add("malayalam")
        add("kannada")
        add("marathi")
        add("bengali")
        listOf(
            "en" to "English", "ta" to "Tamil", "hi" to "Hindi", "fr" to "French",
            "de" to "German", "es" to "Spanish", "ar" to "Arabic", "zh" to "Chinese",
            "ja" to "Japanese", "ko" to "Korean", "ru" to "Russian", "pt" to "Portuguese",
            "it" to "Italian", "bn" to "Bengali", "te" to "Telugu", "ml" to "Malayalam",
            "kn" to "Kannada", "mr" to "Marathi",
        ).forEach { (code, name) ->
            add(code)
            add(name)
            add(name.lowercase())
        }
    }.toList().sorted()

    fun suggestions(query: String, max: Int = 8): List<String> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        val scored = words.mapNotNull { word ->
            val w = word.lowercase()
            matchScore(q, w)?.let { score -> word to score }
        }.sortedWith(compareBy<Pair<String, Int>> { it.second }.thenBy { it.first.length }.thenBy { it.first })

        val seen = mutableSetOf<String>()
        val out = ArrayList<String>(max)
        for ((word, _) in scored) {
            val key = word.lowercase()
            if (!seen.add(key)) continue
            out.add(displayForm(word, q))
            if (out.size >= max) break
        }
        return out
    }

    private fun matchScore(query: String, word: String): Int? =
        KeyboardSuggestionMatcher.matchScore(query, word)

    private fun displayForm(word: String, query: String): String =
        KeyboardSuggestionMatcher.displayForm(word, query)
}
