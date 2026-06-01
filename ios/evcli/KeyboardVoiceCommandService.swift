import AVFoundation
import Foundation

/// Records voice command audio in the main app and transcribes via the Easy Voice API.
/// Keyboard extensions cannot use the microphone reliably — same pattern as `KeyboardDictationService`.
final class KeyboardVoiceCommandService {
  static let shared = KeyboardVoiceCommandService()

  private let store = KeyboardVoiceCommandStore.shared
  private var recorder: AVAudioRecorder?
  private var audioURL: URL?
  private var activeRequestId: String?
  private var controlPollTimer: Timer?
  private var isFinishingRecording = false

  private init() {}

  func start(requestId: String) {
    let snap = store.snapshot()
    if activeRequestId == requestId,
       snap.state == .recording || snap.state == .transcribing || snap.state == .pending {
      return
    }
    if activeRequestId != nil {
      teardown(markCancelled: true)
    }

    activeRequestId = requestId
    isFinishingRecording = false
    store.begin(requestId: requestId)
    requestMicrophoneAndRecord()
    startControlPolling()
  }

  func stop() {
    store.requestCancel()
  }

  private func requestMicrophoneAndRecord() {
    let finishDenied = { [weak self] in
      DispatchQueue.main.async {
        self?.store.fail("Microphone permission denied. Enable mic for Type Easy in Settings.")
        self?.teardown(markCancelled: false)
      }
    }

    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        DispatchQueue.main.async { [weak self] in self?.beginRecording() }
      case .denied:
        finishDenied()
      case .undetermined:
        AVAudioApplication.requestRecordPermission { granted in
          granted
            ? DispatchQueue.main.async { [weak self] in self?.beginRecording() }
            : finishDenied()
        }
      @unknown default:
        finishDenied()
      }
      return
    }

    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      DispatchQueue.main.async { [weak self] in self?.beginRecording() }
    case .denied:
      finishDenied()
    case .undetermined:
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        granted
          ? DispatchQueue.main.async { [weak self] in self?.beginRecording() }
          : finishDenied()
      }
    @unknown default:
      finishDenied()
    }
  }

  private func beginRecording() {
    guard activeRequestId != nil else { return }
    teardownRecorderOnly()
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
      let fileURL = baseDir.appendingPathComponent("keyboard_cmd_\(UUID().uuidString).m4a")
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
      store.markRecording()
    } catch {
      store.fail(error.localizedDescription)
      teardown(markCancelled: false)
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
      teardown(markCancelled: true)
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

    recorder?.stop()
    recorder = nil

    guard let fileURL = audioURL else {
      store.fail("Recording file empty")
      teardown(markCancelled: false)
      return
    }

    guard FileManager.default.fileExists(atPath: fileURL.path),
          let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
          let size = attrs[.size] as? UInt64,
          size > 0 else {
      try? FileManager.default.removeItem(at: fileURL)
      audioURL = nil
      store.fail("Recording file empty")
      teardown(markCancelled: false)
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
          self.store.setReview(transcript: tr.transcript, voiceAssetId: tr.voiceAssetId)
        case .failure(let error):
          self.store.fail(error.localizedDescription)
        }
        self.activeRequestId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      }
    }
  }

  private func teardownRecorderOnly() {
    recorder?.stop()
    recorder = nil
    if let url = audioURL {
      try? FileManager.default.removeItem(at: url)
      audioURL = nil
    }
  }

  private func teardown(markCancelled: Bool) {
    controlPollTimer?.invalidate()
    controlPollTimer = nil
    isFinishingRecording = false
    teardownRecorderOnly()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if markCancelled {
      store.cancel()
    }
    activeRequestId = nil
  }
}
