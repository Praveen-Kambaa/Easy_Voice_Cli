import Foundation

/// Unified dictation state machine between Keyboard Extension and TypeEasy Containing App.
/// Lifecycle: IDLE → REQUESTED → APP_OPENED → RECORDING → TRANSCRIBING → COMPLETED → INSERTED
/// Terminal error/cancellation: FAILED, CANCELLED
enum KeyboardDictationState: String {
  case idle = "IDLE"
  case requested = "REQUESTED"
  case appOpened = "APP_OPENED"
  case recording = "RECORDING"
  case transcribing = "TRANSCRIBING"
  case completed = "COMPLETED"
  case inserted = "INSERTED"
  case failed = "FAILED"
  case cancelled = "CANCELLED"

  // Legacy mappings for backwards-compatibility:
  case pending = "PENDING"
  case listening = "LISTENING"
  case done = "DONE"
  case error = "ERROR"

  static func normalize(_ raw: String?) -> KeyboardDictationState {
    guard let str = raw?.uppercased(), !str.isEmpty else { return .idle }
    switch str {
    case "IDLE": return .idle
    case "REQUESTED", "PENDING": return .requested
    case "APP_OPENED": return .appOpened
    case "RECORDING", "LISTENING": return .recording
    case "TRANSCRIBING": return .transcribing
    case "COMPLETED", "DONE": return .completed
    case "INSERTED": return .inserted
    case "FAILED", "ERROR": return .failed
    case "CANCELLED": return .cancelled
    default: return .idle
    }
  }

  var isListeningOrRecording: Bool {
    self == .recording || self == .listening || self == .transcribing
  }

  var isComplete: Bool {
    self == .completed || self == .done
  }
}

final class KeyboardDictationStore {
  static let shared = KeyboardDictationStore()

  private let versionKey = "dictation_version"
  private let requestIdKey = "dictation_request_id"
  private let stateKey = "dictation_state"
  private let partialTextKey = "dictation_partial_text"
  private let finalTextKey = "dictation_final_text"
  private let errorKey = "dictation_error"
  private let stopRequestedKey = "dictation_stop_requested"
  private let timestampKey = "dictation_timestamp"
  private let consumedKey = "dictation_consumed"

  private var defaults: UserDefaults { KeyboardSharedConfig.defaults() }

  private init() {}

  /// Creates a versioned pending dictation request from the keyboard extension.
  @discardableResult
  func createPendingRequest() -> String {
    let reqId = UUID().uuidString
    let d = defaults
    d.set(2, forKey: versionKey)
    d.set(reqId, forKey: requestIdKey)
    d.set(KeyboardDictationState.requested.rawValue, forKey: stateKey)
    d.set(Date().timeIntervalSince1970, forKey: timestampKey)
    d.set(false, forKey: consumedKey)
    d.set("", forKey: partialTextKey)
    d.set("", forKey: finalTextKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
    return reqId
  }

  func begin(requestId: String) {
    let d = defaults
    d.set(2, forKey: versionKey)
    d.set(requestId, forKey: requestIdKey)
    d.set(KeyboardDictationState.requested.rawValue, forKey: stateKey)
    d.set(Date().timeIntervalSince1970, forKey: timestampKey)
    d.set(false, forKey: consumedKey)
    d.set("", forKey: partialTextKey)
    d.set("", forKey: finalTextKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func markAppOpened(requestId: String? = nil) {
    let d = defaults
    if let r = requestId, !r.isEmpty {
      d.set(r, forKey: requestIdKey)
    }
    d.set(KeyboardDictationState.appOpened.rawValue, forKey: stateKey)
    d.synchronize()
  }

  func markListening() {
    let d = defaults
    d.set(KeyboardDictationState.recording.rawValue, forKey: stateKey)
    d.synchronize()
  }

  func markRecording(requestId: String? = nil) {
    let d = defaults
    if let r = requestId, !r.isEmpty {
      d.set(r, forKey: requestIdKey)
    }
    d.set(KeyboardDictationState.recording.rawValue, forKey: stateKey)
    d.synchronize()
  }

  func markTranscribing() {
    let d = defaults
    d.set(KeyboardDictationState.transcribing.rawValue, forKey: stateKey)
    d.synchronize()
  }

  func updatePartial(_ text: String) {
    let d = defaults
    d.set(text, forKey: partialTextKey)
    d.synchronize()
  }

  func complete(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      cancel()
      return
    }
    let d = defaults
    d.set(trimmed, forKey: finalTextKey)
    d.set(KeyboardDictationState.completed.rawValue, forKey: stateKey)
    d.set(Date().timeIntervalSince1970, forKey: timestampKey)
    d.set(false, forKey: consumedKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func fail(_ message: String) {
    let d = defaults
    d.set(message, forKey: errorKey)
    d.set(KeyboardDictationState.failed.rawValue, forKey: stateKey)
    d.set(Date().timeIntervalSince1970, forKey: timestampKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func cancel() {
    let d = defaults
    d.set(KeyboardDictationState.cancelled.rawValue, forKey: stateKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func requestStop() {
    defaults.set(true, forKey: stopRequestedKey)
    defaults.synchronize()
  }

  func clearStopRequested() {
    defaults.set(false, forKey: stopRequestedKey)
    defaults.synchronize()
  }

  func isStopRequested() -> Bool {
    defaults.bool(forKey: stopRequestedKey)
  }

  /// Consumes the pending transcription if available, marking it consumed to prevent duplicates.
  /// Discards expired entries older than `maxAgeSeconds` (strict 15s TTL).
  func consumePendingTranscription(maxAgeSeconds: TimeInterval = 15) -> String? {
    let d = defaults
    let stateRaw = d.string(forKey: stateKey)
    let state = KeyboardDictationState.normalize(stateRaw)
    let consumed = d.bool(forKey: consumedKey)
    let text = (d.string(forKey: finalTextKey) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let timestamp = d.double(forKey: timestampKey)

    guard state.isComplete, !consumed, !text.isEmpty else {
      return nil
    }

    let now = Date().timeIntervalSince1970
    if timestamp > 0 && (now - timestamp) > maxAgeSeconds {
      reset()
      return nil
    }

    // Mark as consumed immediately to prevent duplicate insertion
    d.set(true, forKey: consumedKey)
    d.set(KeyboardDictationState.inserted.rawValue, forKey: stateKey)
    d.set("", forKey: finalTextKey)
    d.synchronize()

    return text
  }

  func hasUnconsumedTranscription(maxAgeSeconds: TimeInterval = 15) -> Bool {
    let d = defaults
    let state = KeyboardDictationState.normalize(d.string(forKey: stateKey))
    guard state.isComplete else { return false }
    let consumed = d.bool(forKey: consumedKey)
    guard !consumed else { return false }
    let text = (d.string(forKey: finalTextKey) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return false }
    let timestamp = d.double(forKey: timestampKey)
    if timestamp > 0 && (Date().timeIntervalSince1970 - timestamp) > maxAgeSeconds {
      return false
    }
    return true
  }

  func snapshot() -> (
    requestId: String,
    state: KeyboardDictationState,
    partialText: String,
    finalText: String,
    error: String,
    consumed: Bool,
    timestamp: Double
  ) {
    let d = defaults
    let state = KeyboardDictationState.normalize(d.string(forKey: stateKey))
    return (
      d.string(forKey: requestIdKey) ?? "",
      state,
      d.string(forKey: partialTextKey) ?? "",
      d.string(forKey: finalTextKey) ?? "",
      d.string(forKey: errorKey) ?? "",
      d.bool(forKey: consumedKey),
      d.double(forKey: timestampKey)
    )
  }

  /// Clears dictation state after the keyboard has consumed the result or session reset.
  func reset() {
    let d = defaults
    d.set(KeyboardDictationState.idle.rawValue, forKey: stateKey)
    d.set("", forKey: requestIdKey)
    d.set("", forKey: partialTextKey)
    d.set("", forKey: finalTextKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(true, forKey: consumedKey)
    d.synchronize()
  }
}
