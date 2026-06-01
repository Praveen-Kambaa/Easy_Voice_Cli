import Foundation

/// Remote + local keyboard suggestions (Datamuse + on-device lexicon).
enum KeyboardDatamuseClient {
  private static let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 8
    config.timeoutIntervalForResource = 8
    return URLSession(configuration: config)
  }()

  static func fetchSuggestions(query: String) async -> [String] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !q.isEmpty else { return [] }

    let recent = KeyboardRecentWordsStore.suggestions(matching: q, max: 8)
    let local = KeyboardSuggestionLexicon.suggestions(for: q, max: 8)

    async let sugTask = fetchEndpoint(sp: nil, sug: q)
    async let prefixTask = fetchEndpoint(sp: "\(q)*", sug: nil)
    async let spellTask = fetchEndpoint(sp: q, sug: nil)

    let (sugWords, prefixWords, spellWords) = await (sugTask, prefixTask, spellTask)
    let remote = sugWords + prefixWords + spellWords
    return mergeRanked(recent: recent, local: local, remote: remote, query: q, max: 8)
  }

  private static func fetchEndpoint(sp: String?, sug: String?) async -> [String] {
    let url: URL?
    if let sug {
      let encoded = sug.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sug
      url = URL(string: "https://api.datamuse.com/sug?s=\(encoded)&max=8")
    } else if let sp {
      let encoded = sp.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sp
      url = URL(string: "https://api.datamuse.com/words?sp=\(encoded)&max=8")
    } else {
      url = nil
    }
    guard let url else { return [] }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        return []
      }
      return parseWords(from: data)
    } catch {
      return []
    }
  }

  private static func parseWords(from data: Data) -> [String] {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return json.compactMap { item in
      let word = (item["word"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return word.isEmpty ? nil : word
    }
  }

  private static func mergeRanked(
    recent: [String],
    local: [String],
    remote: [String],
    query: String,
    max: Int
  ) -> [String] {
    var seen = Set<String>()
    var out: [String] = []

    func push(_ word: String) {
      let key = word.lowercased()
      guard !key.isEmpty, !seen.contains(key) else { return }
      seen.insert(key)
      out.append(word)
    }

    for word in recent { push(word) }
    for word in local { push(word) }
    for word in remote.sorted(by: { rank($0, query) < rank($1, query) }) {
      push(word)
      if out.count >= max { break }
    }
    return Array(out.prefix(max))
  }

  private static func rank(_ word: String, _ query: String) -> Int {
    let w = word.lowercased()
    if w.hasPrefix(query) { return 0 }
    if w.contains(query) { return 1 }
    return 2
  }
}
