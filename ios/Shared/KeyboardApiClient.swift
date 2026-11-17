import Foundation

/// API URLs for the keyboard extension (mirrors `src/config/api.js`).
enum KeyboardApiConfig {
  static let typeEasyBase = "https://easyvoice.kambaaincorporation.in/apiv2"
  /// Easy Voice API — voice transcribe / execute (mirrors `buildEasyVoiceUrl` in JS).
  static let easyVoiceBase = "https://easy-voice-api.kambaaincorporation.in/api"
  static let translate = "/translate"
  static let grammarCheck = "/grammar-check"
}

/// API client for translation, grammar check, and AI Q&A from the keyboard extension.
enum KeyboardApiClient {

  static func postMultipart(url: URL, fields: [String: String]) async -> [String: Any] {
    let boundary = "TypeEasyBoundary\(Int(Date().timeIntervalSince1970))\(Int.random(in: 0..<100_000))"
    var body = Data()
    for (key, value) in fields {
      body.append("--\(boundary)\r\n".data(using: .utf8)!)
      body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
      body.append("\(value)\r\n".data(using: .utf8)!)
    }
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)

    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("\(body.count)", forHTTPHeaderField: "Content-Length")
    request.httpBody = body

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = String(data: data, encoding: .utf8) ?? "{}"
      guard let json = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
        return ["error": text.isEmpty ? "Invalid server response" : text]
      }
      if code < 200 || code >= 300, json["error"] == nil {
        var out = json
        out["error"] = extractText(json, keys: ["error", "message", "detail"]) ?? "Request failed (\(code))"
        return out
      }
      return json
    } catch {
      return ["error": error.localizedDescription]
    }
  }

  static func extractText(_ json: [String: Any], keys: [String]) -> String? {
    for key in keys {
      if let value = json[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, trimmed.lowercased() != "null" { return trimmed }
      }
    }
    if let data = json["data"] as? [String: Any] {
      return extractText(data, keys: keys)
    }
    return nil
  }

  /// Translates text using TypeEasy REST API with automatic Groq AI fallback.
  static func translate(text: String, userId: String, targetLanguage: String) async -> (result: String?, error: String?) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return (nil, "Nothing to translate") }

    let targetLang = targetLanguage.isEmpty ? "ta" : targetLanguage

    // 1. If valid numeric userId, attempt primary TypeEasy REST API
    let numericUserId = Int(userId)
    if let uid = numericUserId, uid > 0,
       let url = URL(string: KeyboardApiConfig.typeEasyBase + KeyboardApiConfig.translate) {
      let json = await postMultipart(url: url, fields: [
        "user_id": String(uid),
        "text": trimmed,
        "target_language": targetLang,
      ])
      let out = extractText(json, keys: ["translated_text", "translation", "result", "data"])
      if let out, !out.isEmpty {
        return (out, nil)
      }
    }

    // 2. High-performance Groq AI fallback (eliminates validation errors)
    let langName = KeyboardLanguages.displayName(for: targetLang)
    let systemPrompt = "Translate the user text to \(langName) (\(targetLang)). Return ONLY the translated text with zero notes, zero quotes, and zero explanation."
    let groqRes = await KeyboardGroqClient.chat(
      systemPrompt: systemPrompt,
      userPrompt: trimmed,
      model: KeyboardGroqClient.smartModel,
      temperature: 0.2
    )
    if let result = groqRes.result, !result.isEmpty {
      return (result, nil)
    }

    return (nil, groqRes.error ?? "Translation failed")
  }

  /// Checks and fixes grammar using TypeEasy REST API with automatic Groq AI fallback.
  static func grammarCheck(text: String, userId: String) async -> (result: String?, error: String?) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return (nil, "Nothing to check") }

    // 1. If valid numeric userId, attempt primary TypeEasy REST API
    let numericUserId = Int(userId)
    if let uid = numericUserId, uid > 0,
       let url = URL(string: KeyboardApiConfig.typeEasyBase + KeyboardApiConfig.grammarCheck) {
      let json = await postMultipart(url: url, fields: [
        "user_id": String(uid),
        "text": trimmed,
        "fast": "false",
      ])
      let out = extractText(json, keys: ["corrected_text", "corrected", "result", "data"])
      if let out, !out.isEmpty {
        return (out, nil)
      }
    }

    // 2. High-performance Groq AI fallback (fast grammar, spelling, punctuation fix)
    let systemPrompt = "Fix grammar, spelling, and punctuation only. Preserve original meaning and tone. Return ONLY the corrected text with zero commentary."
    let groqRes = await KeyboardGroqClient.chat(
      systemPrompt: systemPrompt,
      userPrompt: trimmed,
      model: KeyboardGroqClient.fastModel,
      temperature: 0.1
    )
    if let result = groqRes.result, !result.isEmpty {
      return (result, nil)
    }

    return (nil, groqRes.error ?? "Grammar check failed")
  }

  /// Answers a question or prompt directly from the keyboard using Groq AI.
  static func askAI(question: String) async -> (result: String?, error: String?) {
    let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return (nil, "Question is empty") }

    let systemPrompt = "You are a helpful, concise AI assistant for the Type Easy keyboard. Answer the user's question clearly, concisely, and accurately in 1 to 3 short paragraphs."
    let groqRes = await KeyboardGroqClient.chat(
      systemPrompt: systemPrompt,
      userPrompt: trimmed,
      model: KeyboardGroqClient.smartModel,
      temperature: 0.3
    )
    if let result = groqRes.result, !result.isEmpty {
      return (result, nil)
    }

    return (nil, groqRes.error ?? "AI response failed")
  }
}
