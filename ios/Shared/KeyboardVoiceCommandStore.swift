import Foundation

/// Shared voice-command state between the keyboard extension and the main app (App Group).
enum KeyboardVoiceCommandState: String {
  case idle
  case pending
  case recording
  case transcribing
  case review
  case error
  case cancelled
}

final class KeyboardVoiceCommandStore {
  static let shared = KeyboardVoiceCommandStore()

  private let requestIdKey = "voice_cmd_request_id"
  private let stateKey = "voice_cmd_state"
  private let transcriptKey = "voice_cmd_transcript"
  private let voiceAssetIdKey = "voice_cmd_voice_asset_id"
  private let errorKey = "voice_cmd_error"
  private let stopRequestedKey = "voice_cmd_stop_requested"
  private let cancelRequestedKey = "voice_cmd_cancel_requested"
  private let recordingStartedAtKey = "voice_cmd_recording_started_at"

  private var defaults: UserDefaults { KeyboardSharedConfig.defaults() }

  private init() {}

  func begin(requestId: String) {
    let d = defaults
    d.set(requestId, forKey: requestIdKey)
    d.set(KeyboardVoiceCommandState.pending.rawValue, forKey: stateKey)
    d.set("", forKey: transcriptKey)
    d.set("", forKey: voiceAssetIdKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(false, forKey: cancelRequestedKey)
    d.removeObject(forKey: recordingStartedAtKey)
    d.synchronize()
  }

  func markRecording() {
    let d = defaults
    d.set(KeyboardVoiceCommandState.recording.rawValue, forKey: stateKey)
    d.set(Date().timeIntervalSince1970, forKey: recordingStartedAtKey)
    d.synchronize()
  }

  func markTranscribing() {
    defaults.set(KeyboardVoiceCommandState.transcribing.rawValue, forKey: stateKey)
    defaults.synchronize()
  }

  func setReview(transcript: String, voiceAssetId: String?) {
    let d = defaults
    d.set(transcript, forKey: transcriptKey)
    if let voiceAssetId, !voiceAssetId.isEmpty {
      d.set(voiceAssetId, forKey: voiceAssetIdKey)
    }
    d.set(KeyboardVoiceCommandState.review.rawValue, forKey: stateKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(false, forKey: cancelRequestedKey)
    d.synchronize()
  }

  func fail(_ message: String) {
    let d = defaults
    d.set(message, forKey: errorKey)
    d.set(KeyboardVoiceCommandState.error.rawValue, forKey: stateKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(false, forKey: cancelRequestedKey)
    d.synchronize()
  }

  func cancel() {
    let d = defaults
    d.set(KeyboardVoiceCommandState.cancelled.rawValue, forKey: stateKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(false, forKey: cancelRequestedKey)
    d.synchronize()
  }

  func requestStop() {
    defaults.set(true, forKey: stopRequestedKey)
    defaults.synchronize()
  }

  func requestCancel() {
    let d = defaults
    d.set(true, forKey: cancelRequestedKey)
    d.set(false, forKey: stopRequestedKey)
    d.synchronize()
  }

  func isStopRequested() -> Bool { defaults.bool(forKey: stopRequestedKey) }
  func isCancelRequested() -> Bool { defaults.bool(forKey: cancelRequestedKey) }

  func snapshot() -> (
    requestId: String,
    state: KeyboardVoiceCommandState,
    transcript: String,
    voiceAssetId: String,
    error: String,
    recordingStartedAt: Date?
  ) {
    let d = defaults
    let stateRaw = d.string(forKey: stateKey) ?? KeyboardVoiceCommandState.idle.rawValue
    let state = KeyboardVoiceCommandState(rawValue: stateRaw) ?? .idle
    let started = d.object(forKey: recordingStartedAtKey) as? Double
    return (
      d.string(forKey: requestIdKey) ?? "",
      state,
      d.string(forKey: transcriptKey) ?? "",
      d.string(forKey: voiceAssetIdKey) ?? "",
      d.string(forKey: errorKey) ?? "",
      started.map { Date(timeIntervalSince1970: $0) }
    )
  }

  func reset() {
    let d = defaults
    d.set(KeyboardVoiceCommandState.idle.rawValue, forKey: stateKey)
    d.set("", forKey: requestIdKey)
    d.set("", forKey: transcriptKey)
    d.set("", forKey: voiceAssetIdKey)
    d.set("", forKey: errorKey)
    d.set(false, forKey: stopRequestedKey)
    d.set(false, forKey: cancelRequestedKey)
    d.removeObject(forKey: recordingStartedAtKey)
    d.synchronize()
  }
}
