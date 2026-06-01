import Foundation

/// On-device word list + fuzzy prefix match (Datamuse alone misses e.g. `taml` → tamil).
enum KeyboardSuggestionLexicon {
  private static let words: [String] = {
    var set = Set<String>()
    func add(_ w: String) { set.insert(w.lowercased()) }

    for lang in KeyboardLanguages.all {
      add(lang.name)
      add(lang.code)
    }

    let extra = [
      "tamil", "tamilnadu", "tamil nadu", "chennai", "madurai", "coimbatore",
      "english", "hindi", "telugu", "malayalam", "kannada", "marathi", "bengali",
      "translate", "translation", "grammar", "voice", "keyboard", "settings",
      "hello", "thanks", "please", "sorry", "welcome", "good", "morning", "evening",
      "india", "america", "london", "paris", "tokyo", "beijing",
      "message", "email", "phone", "call", "meeting", "today", "tomorrow", "yesterday",
    ]
    extra.forEach { add($0) }
    return Array(set).sorted()
  }()

  static func suggestions(for query: String, max: Int = 8) -> [String] {
    let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 1 else { return [] }

    var scored: [(word: String, score: Int)] = []
    for word in words {
      let w = word.lowercased()
      if let score = KeyboardSuggestionMatcher.matchScore(query: q, word: w) {
        scored.append((word, score))
      }
    }

    scored.sort { a, b in
      if a.score != b.score { return a.score < b.score }
      if a.word.count != b.word.count { return a.word.count < b.word.count }
      return a.word < b.word
    }

    var seen = Set<String>()
    var out: [String] = []
    for item in scored {
      if seen.contains(item.word) { continue }
      seen.insert(item.word)
      out.append(KeyboardSuggestionMatcher.displayForm(item.word, query: q))
      if out.count >= max { break }
    }
    return out
  }
}
