import Foundation

/// API URLs for the keyboard extension (mirrors `src/config/api.js`).
enum KeyboardApiConfig {
  static let typeEasyBase = "https://easyvoice.kambaaincorporation.in/apiv2"
  static let translate = "/translate"
  static let grammarCheck = "/grammar-check"
}

/// Multipart POST helper for translate / grammar from the keyboard extension.
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

    var request = URLRequest(url: url, timeoutInterval: 30)
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

  static func translate(text: String, userId: String, targetLanguage: String) async -> (result: String?, error: String?) {
    guard let url = URL(string: KeyboardApiConfig.typeEasyBase + KeyboardApiConfig.translate) else {
      return (nil, "Invalid API URL")
    }
    let json = await postMultipart(url: url, fields: [
      "user_id": userId,
      "text": text,
      "target_language": targetLanguage,
    ])
    let out = extractText(json, keys: ["translated_text", "translation", "result", "data"])
    if let out, !out.isEmpty { return (out, nil) }
    return (nil, extractText(json, keys: ["error", "message", "detail"]) ?? "Translation failed")
  }

  static func grammarCheck(text: String, userId: String) async -> (result: String?, error: String?) {
    guard let url = URL(string: KeyboardApiConfig.typeEasyBase + KeyboardApiConfig.grammarCheck) else {
      return (nil, "Invalid API URL")
    }
    let json = await postMultipart(url: url, fields: [
      "user_id": userId,
      "text": text,
      "fast": "false",
    ])
    let out = extractText(json, keys: ["corrected_text", "corrected", "result", "data"])
    if let out, !out.isEmpty { return (out, nil) }
    return (nil, extractText(json, keys: ["error", "message", "detail"]) ?? "Grammar check failed")
  }
}
