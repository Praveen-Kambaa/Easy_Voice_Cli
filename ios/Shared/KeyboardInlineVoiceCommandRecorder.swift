import AVFoundation
import Foundation

/// Records and transcribes voice commands inside the keyboard extension (requires Allow Full Access).
final class KeyboardInlineVoiceCommandRecorder {
  static let shared = KeyboardInlineVoiceCommandRecorder()

  enum StartOutcome {
    case started
    case failed(String)
  }

  private let store = KeyboardVoiceCommandStore.shared
  private var recorder: AVAudioRecorder?
  private var audioURL: URL?
  private var activeRequestId: String?
  private var controlPollTimer: Timer?
  private var isFinishingRecording = false
  private var recordingStartedAt: Date?

  private static let minRecordingSeconds: TimeInterval = 0.35

  private init() {}

  var isActive: Bool { activeRequestId != nil }

  func start(requestId: String, completion: @escaping (StartOutcome) -> Void) {
    let snap = store.snapshot()
    if activeRequestId == requestId,
       snap.state == .recording || snap.state == .pending || snap.state == .transcribing {
      completion(.started)
      return
    }
    if activeRequestId != nil, activeRequestId != requestId {
      cancel()
    }
    activeRequestId = requestId
    isFinishingRecording = false
    if snap.requestId != requestId {
      store.begin(requestId: requestId)
    }
    requestMicrophone { [weak self] granted, message in
      guard let self else { return }
      guard granted else {
        self.cancel()
        completion(.failed(message ?? "Microphone permission denied."))
        return
      }
      if self.beginRecording() {
        self.startControlPolling()
        completion(.started)
      } else {
        let err = self.store.snapshot().error
        self.cancel()
        completion(.failed(err.isEmpty ? "Could not start recording." : err))
      }
    }
  }

  func cancel() {
    controlPollTimer?.invalidate()
    controlPollTimer = nil
    recorder?.stop()
    recorder = nil
    if let url = audioURL {
      try? FileManager.default.removeItem(at: url)
      audioURL = nil
    }
    isFinishingRecording = false
    if activeRequestId != nil {
      store.cancel()
    }
    activeRequestId = nil
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func requestMicrophone(completion: @escaping (Bool, String?) -> Void) {
    let finishDenied = {
      completion(false, "Microphone permission denied. Enable mic for Type Easy in Settings.")
    }

    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        completion(true, nil)
      case .denied:
        finishDenied()
      case .undetermined:
        AVAudioApplication.requestRecordPermission { granted in
          DispatchQueue.main.async {
            granted ? completion(true, nil) : finishDenied()
          }
        }
      @unknown default:
        finishDenied()
      }
      return
    }

    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      completion(true, nil)
    case .denied:
      finishDenied()
    case .undetermined:
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        DispatchQueue.main.async {
          granted ? completion(true, nil) : finishDenied()
        }
      }
    @unknown default:
      finishDenied()
    }
  }

  @discardableResult
  private func beginRecording() -> Bool {
    guard activeRequestId != nil else { return false }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
      )
      try session.setActive(true)

      let baseDir = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: KeyboardSharedConfig.appGroupIdentifier
      ) ?? FileManager.default.temporaryDirectory
      let fileURL = baseDir.appendingPathComponent("keyboard_cmd_inline_\(UUID().uuidString).m4a")
      let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      ]
      let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
      recorder.prepareToRecord()
      guard recorder.record() else {
        throw NSError(domain: "KeyboardVoice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to start recording"])
      }
      self.recorder = recorder
      audioURL = fileURL
      recordingStartedAt = Date()
      store.markRecording()
      KeyboardSharedConfig.setExtensionOwnsMic(true)
      return true
    } catch {
      store.fail(error.localizedDescription)
      return false
    }
  }

  private func startControlPolling() {
    controlPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      self?.handleControlFlags()
    }
    RunLoop.main.add(timer, forMode: .common)
    controlPollTimer = timer
  }

  private func handleControlFlags() {
    if store.isCancelRequested() {
      cancel()
      return
    }
    if store.isStopRequested() {
      finishRecordingAndTranscribe()
    }
  }

  private func finishRecordingAndTranscribe() {
    guard !isFinishingRecording else { return }
    isFinishingRecording = true
    controlPollTimer?.invalidate()
    controlPollTimer = nil

    var recordedSeconds = recorder?.currentTime ?? 0
    recorder?.stop()
    recorder = nil
    if recordedSeconds <= 0, let started = recordingStartedAt {
      recordedSeconds = Date().timeIntervalSince(started)
    }
    recordingStartedAt = nil

    if recordedSeconds > 0, recordedSeconds < Self.minRecordingSeconds {
      if let url = audioURL {
        try? FileManager.default.removeItem(at: url)
        audioURL = nil
      }
      store.fail("Speak a bit longer, then tap Stop.")
      activeRequestId = nil
      KeyboardSharedConfig.setExtensionOwnsMic(false)
      return
    }

    guard let fileURL = audioURL else {
      store.fail("Recording file empty")
      activeRequestId = nil
      return
    }

    guard FileManager.default.fileExists(atPath: fileURL.path),
          let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
          let size = attrs[.size] as? UInt64,
          size > 0 else {
      try? FileManager.default.removeItem(at: fileURL)
      audioURL = nil
      store.fail("No speech detected.")
      activeRequestId = nil
      KeyboardSharedConfig.setExtensionOwnsMic(false)
      return
    }

    store.markTranscribing()
    let urlToTranscribe = fileURL
    Task {
      let result = await KeyboardVoiceApiClient.transcribeFile(at: urlToTranscribe)
      try? FileManager.default.removeItem(at: urlToTranscribe)
      await MainActor.run { [weak self] in
        guard let self else { return }
        self.audioURL = nil
        self.isFinishingRecording = false
        switch result {
        case .success(let tr):
          let text = tr.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
          if text.isEmpty {
            self.store.fail("No speech detected.")
          } else {
            self.store.setReview(transcript: text, voiceAssetId: tr.voiceAssetId)
          }
        case .failure(let error):
          self.store.fail(error.localizedDescription)
        }
        self.activeRequestId = nil
        KeyboardSharedConfig.setExtensionOwnsMic(false)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      }
    }
  }
}
