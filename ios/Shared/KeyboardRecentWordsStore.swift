import Foundation

/// Recently typed words in the app group (keyboard extension + main app).
enum KeyboardRecentWordsStore {
  private static let storageKey = "keyboard_recent_words"
  private static let maxStored = 200

  private struct Entry: Codable {
    var word: String
    var lastUsed: TimeInterval
  }

  static func record(_ raw: String) {
    let word = normalize(raw)
    guard let word, word.count >= 2 else { return }

    var entries = loadEntries()
    let key = word.lowercased()
    entries.removeAll { $0.word.lowercased() == key }
    entries.insert(Entry(word: word, lastUsed: Date().timeIntervalSince1970), at: 0)
    if entries.count > maxStored {
      entries = Array(entries.prefix(maxStored))
    }
    saveEntries(entries)
  }

  /// Words the user typed before that match the current partial query (most recent first).
  static func suggestions(matching query: String, max: Int = 8) -> [String] {
    let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 1 else { return [] }

    var scored: [(word: String, match: Int, lastUsed: TimeInterval)] = []
    for entry in loadEntries() {
      let w = entry.word.lowercased()
      guard let match = KeyboardSuggestionMatcher.matchScore(query: q, word: w) else { continue }
      scored.append((entry.word, match, entry.lastUsed))
    }

    scored.sort { a, b in
      if a.match != b.match { return a.match < b.match }
      return a.lastUsed > b.lastUsed
    }

    var seen = Set<String>()
    var out: [String] = []
    for item in scored {
      let key = item.word.lowercased()
      if seen.contains(key) { continue }
      seen.insert(key)
      out.append(KeyboardSuggestionMatcher.displayForm(item.word, query: q))
      if out.count >= max { break }
    }
    return out
  }

  private static func normalize(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    guard trimmed.range(of: #"^[A-Za-z']+$"#, options: .regularExpression) != nil else { return nil }
    return trimmed.lowercased()
  }

  private static func loadEntries() -> [Entry] {
    guard let data = KeyboardSharedConfig.defaults().data(forKey: storageKey) else {
      return []
    }
    return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
  }

  private static func saveEntries(_ entries: [Entry]) {
    let d = KeyboardSharedConfig.defaults()
    if let data = try? JSONEncoder().encode(entries) {
      d.set(data, forKey: storageKey)
      d.synchronize()
    }
  }
}
