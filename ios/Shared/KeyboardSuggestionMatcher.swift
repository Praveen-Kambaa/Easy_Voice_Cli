import Foundation

/// Shared fuzzy prefix matching for keyboard suggestion sources.
enum KeyboardSuggestionMatcher {
  /// Lower score = better match. `nil` = no match.
  static func matchScore(query: String, word: String) -> Int? {
    if word.hasPrefix(query) {
      return query.count == word.count ? 0 : 1
    }
    guard query.count >= 2, word.count >= query.count else { return nil }

    let head = String(word.prefix(min(word.count, query.count + 3)))
    let dist = levenshtein(query, String(head.prefix(query.count)))
    if dist <= 1 { return 2 + dist }

    if fuzzySubsequencePrefix(query, in: head) {
      return 4
    }
    return nil
  }

  static func displayForm(_ word: String, query: String) -> String {
    guard let first = query.first else { return word }
    if query.allSatisfy({ $0.isUppercase }) {
      return word.uppercased()
    }
    if first.isUppercase {
      return word.prefix(1).uppercased() + word.dropFirst()
    }
    return word
  }

  private static func fuzzySubsequencePrefix(_ query: String, in head: String) -> Bool {
    guard query.count >= 2, head.count >= query.count else { return false }
    var qi = query.startIndex
    for ch in head {
      if qi == query.endIndex { break }
      if ch == query[qi] {
        qi = query.index(after: qi)
      }
    }
    return qi == query.endIndex && head.count <= query.count + 6
  }

  private static func levenshtein(_ a: String, _ b: String) -> Int {
    let aChars = Array(a)
    let bChars = Array(b)
    if aChars.isEmpty { return bChars.count }
    if bChars.isEmpty { return aChars.count }
    var prev = Array(0...bChars.count)
    var curr = [Int](repeating: 0, count: bChars.count + 1)
    for i in 1...aChars.count {
      curr[0] = i
      for j in 1...bChars.count {
        let cost = aChars[i - 1] == bChars[j - 1] ? 0 : 1
        curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      }
      swap(&prev, &curr)
    }
    return prev[bChars.count]
  }
}
