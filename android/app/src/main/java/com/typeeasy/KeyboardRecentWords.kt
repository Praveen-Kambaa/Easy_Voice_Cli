package com.typeeasy

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recently typed words (shared keyboard prefs). Shown first when they match the partial query.
 */
object KeyboardRecentWords {
    private const val STORAGE_KEY = "keyboard_recent_words"
    private const val MAX_STORED = 200

    fun record(context: Context, raw: String) {
        val word = normalize(raw) ?: return
        val prefs = prefs(context)
        val entries = loadEntries(prefs).toMutableList()
        val key = word.lowercase()
        entries.removeAll { it.word.lowercase() == key }
        entries.add(0, Entry(word, System.currentTimeMillis()))
        while (entries.size > MAX_STORED) {
            entries.removeAt(entries.lastIndex)
        }
        saveEntries(prefs, entries)
    }

    fun suggestions(context: Context, query: String, max: Int = 8): List<String> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        val scored = loadEntries(prefs(context)).mapNotNull { entry ->
            val w = entry.word.lowercase()
            KeyboardSuggestionMatcher.matchScore(q, w)?.let { match ->
                Triple(entry.word, match, entry.lastUsed)
            }
        }.sortedWith(
            compareBy<Triple<String, Int, Long>> { it.second }
                .thenByDescending { it.third },
        )

        val seen = LinkedHashSet<String>()
        val out = ArrayList<String>(max)
        for ((word, _, _) in scored) {
            val key = word.lowercase()
            if (!seen.add(key)) continue
            out.add(KeyboardSuggestionMatcher.displayForm(word, q))
            if (out.size >= max) break
        }
        return out
    }

    private data class Entry(val word: String, val lastUsed: Long)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(KeyboardModule.PREFS, Context.MODE_PRIVATE)

    private fun normalize(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        if (!trimmed.matches(Regex("^[A-Za-z']+$"))) return null
        return trimmed.lowercase()
    }

    private fun loadEntries(prefs: SharedPreferences): List<Entry> {
        val raw = prefs.getString(STORAGE_KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val word = o.optString("word", "").trim()
                    if (word.isEmpty()) continue
                    add(Entry(word, o.optLong("lastUsed", 0L)))
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveEntries(prefs: SharedPreferences, entries: List<Entry>) {
        val arr = JSONArray()
        entries.forEach { e ->
            arr.put(JSONObject().put("word", e.word).put("lastUsed", e.lastUsed))
        }
        prefs.edit().putString(STORAGE_KEY, arr.toString()).apply()
    }
}
