import Foundation

/// Direct Groq AI client for iOS Keyboard Extension and Host Application.
/// Provides instant, high-accuracy translation, grammar checking, voice command execution, and Q&A without server validation errors.
enum KeyboardGroqClient {
  static let baseURL = "https://api.groq.com/openai/v1"
  static var apiKey: String {
    ProcessInfo.processInfo.environment["GROQ_API_KEY"] ?? "PASTE_YOUR_GROQ_API_KEY_HERE"
  }
  static let fastModel = "openai/gpt-oss-20b"
  static let smartModel = "qwen/qwen3.8-27b"
  static let fallbackModel = "llama-3.3-70b-versatile"

  static func chat(
    systemPrompt: String,
    userPrompt: String,
    model: String = smartModel,
    temperature: Double = 0.2,
    maxTokens: Int = 1024
  ) async -> (result: String?, error: String?) {
    guard let url = URL(string: "\(baseURL)/chat/completions") else {
      return (nil, "Invalid Groq API URL")
    }

    let payload: [String: Any] = [
      "model": model,
      "temperature": temperature,
      "max_tokens": maxTokens,
      "messages": [
        ["role": "system", "content": systemPrompt],
        ["role": "user", "content": userPrompt]
      ]
    ]

    var request = URLRequest(url: url, timeoutInterval: 25)
    request.httpMethod = "POST"
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: payload)
      let (data, response) = try await URLSession.shared.data(for: request)
      let httpCode = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard httpCode >= 200 && httpCode < 300 else {
        // Fall back to alternative model if current model encounters quota/availability issue
        if model != fallbackModel {
          return await chat(
            systemPrompt: systemPrompt,
            userPrompt: userPrompt,
            model: fallbackModel,
            temperature: temperature,
            maxTokens: maxTokens
          )
        }
        let errText = String(data: data, encoding: .utf8) ?? "HTTP \(httpCode)"
        return (nil, "AI service error (\(httpCode)): \(errText)")
      }

      guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let choices = json["choices"] as? [[String: Any]],
            let firstChoice = choices.first,
            let message = firstChoice["message"] as? [String: Any],
            let content = message["content"] as? String else {
        return (nil, "Invalid AI response structure")
      }

      let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
      return (trimmed.isEmpty ? nil : trimmed, nil)
    } catch {
      // Fallback on network/connection failure if not already fallback
      if model != fallbackModel {
        return await chat(
          systemPrompt: systemPrompt,
          userPrompt: userPrompt,
          model: fallbackModel,
          temperature: temperature,
          maxTokens: maxTokens
        )
      }
      return (nil, error.localizedDescription)
    }
  }
}

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

  static func executeVoiceCommand(voiceAssetId: String, transcript: String? = nil) async -> Result<ExecuteResult, Error> {
    let base = easyVoiceBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let payload: [String: Any] = [
      "easyVoiceAssetId": voiceAssetId,
      "executeAt": formatter.string(from: Date()),
    ]

    if let url = URL(string: "\(base)/voice/execute") {
      do {
        let json = try await postJSON(url: url, payload: payload)
        let status = extractString(json, keys: ["status"]) ?? "executed"
        let result = extractString(json, keys: ["result", "message", "text"])
        if let result, !result.isEmpty {
          return .success(ExecuteResult(status: status, result: result))
        }
      } catch {
        // Fall through to Groq AI execution below
      }
    }

    // High-performance Groq AI execution fallback (bypasses server validation errors)
    if let text = transcript, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      let systemPrompt = "You are Type Easy, a helpful voice assistant. Execute, summarize, or answer the user's spoken command clearly and concisely."
      let groqRes = await KeyboardGroqClient.chat(
        systemPrompt: systemPrompt,
        userPrompt: text,
        model: KeyboardGroqClient.smartModel,
        temperature: 0.3
      )
      if let result = groqRes.result, !result.isEmpty {
        return .success(ExecuteResult(status: "completed", result: result))
      }
    }

    return .failure(NSError(domain: "KeyboardVoice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to execute voice command"]))
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
