import AVFoundation
import Foundation

/// Records audio in the keyboard extension and transcribes via the voice API
/// (mirrors Android `startCloudDictation` / `stopCloudDictationAndUpload`).
final class KeyboardExtensionCloudDictation {
  static let shared = KeyboardExtensionCloudDictation()

  private var recorder: AVAudioRecorder?
  private var audioURL: URL?
  private var activeRequestId: String?
  private var recordingStartedAt: Date?

  private static let minRecordingSeconds: TimeInterval = 0.35

  private init() {}

  var isRecording: Bool { recorder?.isRecording == true }

  enum StartError: Error {
    case message(String)
  }

  func start(requestId: String) -> Result<Void, StartError> {
    if isRecording, activeRequestId == requestId {
      return .success(())
    }
    teardownRecorderOnly()
    activeRequestId = requestId
    KeyboardDictationStore.shared.begin(requestId: requestId)
    KeyboardSharedConfig.setExtensionOwnsMic(true)

    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
      )
      try session.setActive(true)

      let baseDir = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: KeyboardSharedConfig.appGroupIdentifier
      ) ?? FileManager.default.temporaryDirectory
      let fileURL = baseDir.appendingPathComponent("keyboard_dictation_\(UUID().uuidString).m4a")
      let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      ]
      let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
      recorder.prepareToRecord()
      guard recorder.record() else {
        throw NSError(
          domain: "KeyboardDictation",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Failed to start recording"]
        )
      }
      self.recorder = recorder
      audioURL = fileURL
      recordingStartedAt = Date()
      KeyboardDictationStore.shared.markListening()
      return .success(())
    } catch {
      KeyboardSharedConfig.setExtensionOwnsMic(false)
      teardownRecorderOnly()
      activeRequestId = nil
      return .failure(.message(error.localizedDescription))
    }
  }

  func stopAndTranscribe() {
    guard activeRequestId != nil else { return }
    var recordedSeconds = recorder?.currentTime ?? 0
    if recordedSeconds <= 0, let started = recordingStartedAt {
      recordedSeconds = Date().timeIntervalSince(started)
    }
    recorder?.stop()
    recorder = nil
    recordingStartedAt = nil

    if recordedSeconds > 0, recordedSeconds < Self.minRecordingSeconds {
      teardownRecorderOnly()
      KeyboardDictationStore.shared.fail("Speak a bit longer, then tap the mic again.")
      finishSession()
      return
    }

    guard let fileURL = audioURL else {
      KeyboardDictationStore.shared.fail("Recording file empty")
      finishSession()
      return
    }

    guard FileManager.default.fileExists(atPath: fileURL.path),
          let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
          let size = attrs[.size] as? UInt64,
          size > 0 else {
      try? FileManager.default.removeItem(at: fileURL)
      audioURL = nil
      KeyboardDictationStore.shared.fail("No speech detected.")
      finishSession()
      return
    }

    let urlToTranscribe = fileURL
    Task {
      let result = await KeyboardVoiceApiClient.transcribeFile(at: urlToTranscribe)
      try? FileManager.default.removeItem(at: urlToTranscribe)
      await MainActor.run { [weak self] in
        guard let self else { return }
        self.audioURL = nil
        switch result {
        case .success(let tr):
          let text = tr.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
          if text.isEmpty {
            KeyboardDictationStore.shared.fail("No speech detected.")
          } else {
            KeyboardDictationStore.shared.complete(text)
          }
        case .failure(let error):
          KeyboardDictationStore.shared.fail(error.localizedDescription)
        }
        self.finishSession()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      }
    }
  }

  func cancel() {
    teardownRecorderOnly()
    if activeRequestId != nil {
      KeyboardDictationStore.shared.cancel()
    }
    finishSession()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func teardownRecorderOnly() {
    recorder?.stop()
    recorder = nil
    recordingStartedAt = nil
    if let url = audioURL {
      try? FileManager.default.removeItem(at: url)
      audioURL = nil
    }
  }

  private func finishSession() {
    activeRequestId = nil
    KeyboardSharedConfig.setExtensionOwnsMic(false)
  }
}
