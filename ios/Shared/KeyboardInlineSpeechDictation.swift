import AVFoundation
import Foundation
import Speech

/// Speech dictation inside the keyboard extension (requires Allow Full Access).
/// Falls back to the host app when the extension cannot access the microphone.
final class KeyboardInlineSpeechDictation {
  static let shared = KeyboardInlineSpeechDictation()

  enum StartOutcome {
    case started
    case failed(String)
  }

  private let store = KeyboardDictationStore.shared
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine = AVAudioEngine()
  private var activeRequestId: String?
  private var stopPollTimer: Timer?
  private var hasInputTap = false

  private init() {}

  var isActive: Bool { activeRequestId != nil }

  func start(requestId: String, completion: @escaping (StartOutcome) -> Void) {
    if activeRequestId == requestId,
       store.snapshot().state == .listening || store.snapshot().state == .pending {
      completion(.started)
      return
    }
    teardown(markCancelled: true)
    activeRequestId = requestId
    store.begin(requestId: requestId)

    requestPermissions { [weak self] granted, message in
      guard let self else { return }
      guard granted else {
        self.teardown(markCancelled: true)
        completion(.failed(message ?? "Microphone or speech recognition denied."))
        return
      }
      if self.beginRecognition() {
        self.startStopPolling()
        completion(.started)
      } else {
        let err = self.store.snapshot().error
        self.teardown(markCancelled: true)
        completion(.failed(err.isEmpty ? "Could not start listening." : err))
      }
    }
  }

  func requestStop() {
    store.requestStop()
  }

  func teardown(markCancelled: Bool = false) {
    stopPollTimer?.invalidate()
    stopPollTimer = nil
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    if hasInputTap {
      audioEngine.inputNode.removeTap(onBus: 0)
      hasInputTap = false
    }
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionRequest = nil
    recognitionTask = nil
    speechRecognizer = nil
    if markCancelled, activeRequestId != nil {
      store.cancel()
    }
    activeRequestId = nil
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func requestPermissions(completion: @escaping (Bool, String?) -> Void) {
    AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
      guard micGranted else {
        DispatchQueue.main.async {
          completion(false, "Microphone permission denied. Enable mic for Type Easy in Settings.")
        }
        return
      }
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          if status == .authorized {
            completion(true, nil)
          } else {
            completion(false, "Speech recognition permission denied.")
          }
        }
      }
    }
  }

  @discardableResult
  private func beginRecognition() -> Bool {
    speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      return false
    }

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .measurement,
        options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
      )
      try session.setActive(true, options: .notifyOthersOnDeactivation)

      recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
      guard let recognitionRequest else {
        store.fail("Could not start speech recognition.")
        return false
      }
      recognitionRequest.shouldReportPartialResults = true

      let inputNode = audioEngine.inputNode
      recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
        guard let self else { return }
        if let result {
          let text = result.bestTranscription.formattedString
          DispatchQueue.main.async {
            self.store.updatePartial(text)
            if result.isFinal {
              let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
              if trimmed.isEmpty {
                self.store.fail("No speech detected.")
              } else {
                self.store.complete(trimmed)
              }
              self.teardown(markCancelled: false)
            }
          }
        }
        if let error {
          let ns = error as NSError
          if ns.domain == "kAFAssistantErrorDomain", ns.code == 216 { return }
          DispatchQueue.main.async {
            self.store.fail(error.localizedDescription)
            self.teardown(markCancelled: false)
          }
        }
      }

      let format = inputNode.outputFormat(forBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        recognitionRequest.append(buffer)
      }
      hasInputTap = true
      audioEngine.prepare()
      try audioEngine.start()
      store.markListening()
      KeyboardSharedConfig.setExtensionOwnsMic(true)
      return true
    } catch {
      return false
    }
  }

  private func startStopPolling() {
    stopPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      guard let self, self.store.isStopRequested() else { return }
      let snap = self.store.snapshot()
      let trimmed = snap.partialText.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        self.store.complete(trimmed)
      } else {
        self.store.fail("No speech detected.")
      }
      self.teardown(markCancelled: false)
    }
    RunLoop.main.add(timer, forMode: .common)
    stopPollTimer = timer
  }
}
