import Foundation

/// Voice transcribe / transcript / execute for the keyboard extension (mirrors Android `VoiceTranscribeClient` + `VoiceCommandClient`).
enum KeyboardVoiceApiClient {
  private static let easyVoiceBase = "https://easy-voice-api.kambaaincorporation.in/api"
  struct TranscribeResult {
    let transcript: String
    let voiceAssetId: String?
  }

  struct ExecuteResult {
    let status: String?
    let result: String?
  }

  static func transcribeFile(at fileURL: URL, language: String = "en-US") async -> Result<TranscribeResult, Error> {
    let base = easyVoiceBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/voice/transcribe") else {
      return .failure(NSError(domain: "KeyboardVoice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid voice API URL"]))
    }
    guard FileManager.default.fileExists(atPath: fileURL.path),
          let data = try? Data(contentsOf: fileURL),
          !data.isEmpty else {
      return .failure(NSError(domain: "KeyboardVoice", code: -2, userInfo: [NSLocalizedDescriptionKey: "Recording file is missing or empty"]))
    }

    let boundary = "TypeEasyVoice\(Int(Date().timeIntervalSince1970))"
    var body = Data()
    func append(_ string: String) {
      if let d = string.data(using: .utf8) { body.append(d) }
    }
    let fileName = fileURL.lastPathComponent
    let mime = fileName.hasSuffix(".m4a") ? "audio/mp4" : "audio/mp4"
    append("--\(boundary)\r\n")
    append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n")
    append("Content-Type: \(mime)\r\n\r\n")
    body.append(data)
    append("\r\n")
    for (key, value) in [
      ("language", language),
      ("enablePunctuation", "true"),
      ("enableTimestamps", "false"),
    ] {
      append("--\(boundary)\r\n")
      append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
      append("\(value)\r\n")
    }
    append("--\(boundary)--\r\n")

    var request = URLRequest(url: url, timeoutInterval: 180)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.httpBody = body

    do {
      let (responseData, response) = try await URLSession.shared.data(for: request)
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = String(data: responseData, encoding: .utf8) ?? ""
      guard code >= 200, code < 300 else {
        return .failure(NSError(domain: "KeyboardVoice", code: code, userInfo: [NSLocalizedDescriptionKey: parseErrorMessage(text) ?? "Server error \(code)"]))
      }
      guard let json = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any] else {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
          return .failure(NSError(domain: "KeyboardVoice", code: -3, userInfo: [NSLocalizedDescriptionKey: "Empty transcript from server"]))
        }
        return .success(TranscribeResult(transcript: trimmed, voiceAssetId: nil))
      }
      let transcript = extractTranscript(from: json)
      let assetId = extractString(json, keys: ["voiceAssetId", "easyVoiceAssetId", "id"])
      if transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .failure(NSError(domain: "KeyboardVoice", code: -3, userInfo: [NSLocalizedDescriptionKey: "Empty transcript from server"]))
      }
      return .success(TranscribeResult(transcript: transcript.trimmingCharacters(in: .whitespacesAndNewlines), voiceAssetId: assetId))
    } catch {
      return .failure(error)
    }
  }

  static func updateTranscript(voiceAssetId: String, finalTranscript: String) async -> Result<String, Error> {
    let base = easyVoiceBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/voice/transcript") else {
      return .failure(NSError(domain: "KeyboardVoice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid voice API URL"]))
    }
    let trimmed = finalTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return .failure(NSError(domain: "KeyboardVoice", code: -2, userInfo: [NSLocalizedDescriptionKey: "Transcript text cannot be empty"]))
    }
    let payload: [String: Any] = ["finalTranscript": trimmed, "voiceAssetId": voiceAssetId]
    return await putJSON(url: url, payload: payload, fallbackId: voiceAssetId)
  }

  static func executeVoiceCommand(voiceAssetId: String) async -> Result<ExecuteResult, Error> {
    let base = easyVoiceBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/voice/execute") else {
      return .failure(NSError(domain: "KeyboardVoice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid voice API URL"]))
    }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let payload: [String: Any] = [
      "easyVoiceAssetId": voiceAssetId,
      "executeAt": formatter.string(from: Date()),
    ]
    do {
      let json = try await postJSON(url: url, payload: payload)
      let status = extractString(json, keys: ["status"]) ?? "executed"
      let result = extractString(json, keys: ["result", "message", "text"])
      return .success(ExecuteResult(status: status, result: result))
    } catch {
      return .failure(error)
    }
  }

  private static func putJSON(url: URL, payload: [String: Any], fallbackId: String) async -> Result<String, Error> {
    do {
      var request = URLRequest(url: url, timeoutInterval: 60)
      request.httpMethod = "PUT"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.httpBody = try JSONSerialization.data(withJSONObject: payload)
      let (data, response) = try await URLSession.shared.data(for: request)
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = String(data: data, encoding: .utf8) ?? ""
      guard code >= 200, code < 300 else {
        return .failure(NSError(domain: "KeyboardVoice", code: code, userInfo: [NSLocalizedDescriptionKey: parseErrorMessage(text) ?? "Server error \(code)"]))
      }
      if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         let newId = extractString(json, keys: ["voiceAssetId", "easyVoiceAssetId", "id"]) {
        return .success(newId)
      }
      return .success(fallbackId)
    } catch {
      return .failure(error)
    }
  }

  private static func postJSON(url: URL, payload: [String: Any]) async throws -> [String: Any] {
    var request = URLRequest(url: url, timeoutInterval: 60)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.httpBody = try JSONSerialization.data(withJSONObject: payload)
    let (data, response) = try await URLSession.shared.data(for: request)
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    let text = String(data: data, encoding: .utf8) ?? ""
    guard code >= 200, code < 300 else {
      throw NSError(domain: "KeyboardVoice", code: code, userInfo: [NSLocalizedDescriptionKey: parseErrorMessage(text) ?? "Server error \(code)"])
    }
    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return json
    }
    return [:]
  }

  /// Mirrors `normalizeTranscribeServerPayload` in `voiceApi.js` / Android `VoiceTranscribeClient`.
  private static func extractTranscript(from json: [String: Any]) -> String {
    let keys = ["refinedTranscript", "rawTranscript", "transcript", "text", "result", "message"]
    if let direct = extractString(json, keys: keys) { return direct }
    return ""
  }

  private static func extractString(_ json: [String: Any], keys: [String]) -> String? {
    for key in keys {
      if let value = json[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, trimmed.lowercased() != "null" { return trimmed }
      }
    }
    if let data = json["data"] as? [String: Any] {
      return extractString(data, keys: keys)
    }
    return nil
  }

  private static func parseErrorMessage(_ text: String) -> String? {
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return text.isEmpty ? nil : text
    }
    return extractString(json, keys: ["message", "error"])
  }
}
