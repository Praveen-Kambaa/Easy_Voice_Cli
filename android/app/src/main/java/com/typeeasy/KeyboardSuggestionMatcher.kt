package com.typeeasy

object KeyboardSuggestionMatcher {
    fun matchScore(query: String, word: String): Int? {
        if (word.startsWith(query)) {
            return if (query.length == word.length) 0 else 1
        }
        if (query.length < 2 || word.length < query.length) return null
        val head = word.take(minOf(word.length, query.length + 3))
        val dist = levenshtein(query, head.take(query.length))
        if (dist <= 1) return 2 + dist
        if (fuzzySubsequencePrefix(query, head)) return 4
        return null
    }

    fun displayForm(word: String, query: String): String {
        if (query.isEmpty()) return word
        return if (query.first().isUpperCase()) {
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        } else {
            word.lowercase()
        }
    }

    private fun fuzzySubsequencePrefix(query: String, head: String): Boolean {
        if (query.length < 2 || head.length < query.length) return false
        var qi = 0
        for (ch in head) {
            if (qi >= query.length) break
            if (ch == query[qi]) qi++
        }
        return qi == query.length && head.length <= query.length + 6
    }

    private fun levenshtein(a: String, b: String): Int {
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        val prev = IntArray(b.length + 1) { it }
        val curr = IntArray(b.length + 1)
        for (i in a.indices) {
            curr[0] = i + 1
            for (j in b.indices) {
                val cost = if (a[i] == b[j]) 0 else 1
                curr[j + 1] = minOf(prev[j + 1] + 1, curr[j] + 1, prev[j] + cost)
            }
            for (k in prev.indices) prev[k] = curr[k]
        }
        return prev[b.length]
    }
}
