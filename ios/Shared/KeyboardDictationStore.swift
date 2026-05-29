import Foundation

/// Shared dictation state between the keyboard extension and the containing app (App Group).
enum KeyboardDictationState: String {
  case idle
  case pending
  case listening
  case done
  case error
  case cancelled
}

final class KeyboardDictationStore {
  static let shared = KeyboardDictationStore()

  private let requestIdKey = "dictation_request_id"
  private let stateKey = "dictation_state"
  private let partialTextKey = "dictation_partial_text"
  private let finalTextKey = "dictation_final_text"
  private let errorKey = "dictation_error"
  private let stopRequestedKey = "dictation_stop_requested"

  private var defaults: UserDefaults { KeyboardSharedConfig.defaults() }

  private init() {}

  func begin(requestId: String) {
    let d = defaults
    d.set(requestId, forKey: requestIdKey)
    d.set(KeyboardDictationState.pending.rawValue, forKey: stateKey)
    d.set("", forKey: partialTextKey)
    d.set("", forKey: finalTextKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func markListening() {
    defaults.set(KeyboardDictationState.listening.rawValue, forKey: stateKey)
    defaults.synchronize()
  }

  func updatePartial(_ text: String) {
    defaults.set(text, forKey: partialTextKey)
    defaults.synchronize()
  }

  func complete(_ text: String) {
    let d = defaults
    d.set(text, forKey: finalTextKey)
    d.set(KeyboardDictationState.done.rawValue, forKey: stateKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func fail(_ message: String) {
    let d = defaults
    d.set(message, forKey: errorKey)
    d.set(KeyboardDictationState.error.rawValue, forKey: stateKey)
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

  func isStopRequested() -> Bool {
    defaults.bool(forKey: stopRequestedKey)
  }

  func snapshot() -> (
    requestId: String,
    state: KeyboardDictationState,
    partialText: String,
    finalText: String,
    error: String
  ) {
    let d = defaults
    let stateRaw = d.string(forKey: stateKey) ?? KeyboardDictationState.idle.rawValue
    let state = KeyboardDictationState(rawValue: stateRaw) ?? .idle
    return (
      d.string(forKey: requestIdKey) ?? "",
      state,
      d.string(forKey: partialTextKey) ?? "",
      d.string(forKey: finalTextKey) ?? "",
      d.string(forKey: errorKey) ?? ""
    )
  }

  /// Clears dictation state after the keyboard has consumed the result.
  func reset() {
    let d = defaults
    d.set(KeyboardDictationState.idle.rawValue, forKey: stateKey)
    d.set("", forKey: requestIdKey)
    d.set("", forKey: partialTextKey)
    d.set("", forKey: finalTextKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }
}
