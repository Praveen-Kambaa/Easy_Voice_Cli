import AVFoundation
import Foundation
import Speech

/// Runs speech recognition in the main app (keyboard extensions cannot use the microphone).
final class KeyboardDictationService {
  static let shared = KeyboardDictationService()

  private let store = KeyboardDictationStore.shared
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine = AVAudioEngine()
  private var activeRequestId: String?
  private var stopPollTimer: Timer?

  private init() {}

  func start(requestId: String) {
    let snap = store.snapshot()
    if activeRequestId == requestId,
       snap.state == .listening || snap.state == .pending {
      return
    }
    if activeRequestId != nil {
      teardownRecognition(markCancelled: true)
    }
    activeRequestId = requestId
    store.begin(requestId: requestId)
    requestPermissionsAndBegin()
    startStopPolling()
  }

  func stop() {
    teardownRecognition(markCancelled: true)
  }

  private func requestPermissionsAndBegin() {
    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] micGranted in
      guard let self else { return }
      guard micGranted else {
        DispatchQueue.main.async {
          self.store.fail("Microphone permission denied.")
          self.teardownRecognition(markCancelled: false)
        }
        return
      }
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard status == .authorized else {
            self.store.fail("Speech recognition permission denied.")
            self.teardownRecognition(markCancelled: false)
            return
          }
          self.beginRecognition()
        }
      }
    }
  }

  private func beginRecognition() {
    teardownEngineOnly()

    speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      store.fail("Speech recognition is unavailable.")
      return
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
        return
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
              self.store.complete(text)
              self.teardownRecognition(markCancelled: false)
            }
          }
        }
        if let error {
          let ns = error as NSError
          if ns.domain == "kAFAssistantErrorDomain", ns.code == 216 {
            return
          }
          DispatchQueue.main.async {
            self.store.fail(error.localizedDescription)
            self.teardownRecognition(markCancelled: false)
          }
        }
      }

      let format = inputNode.outputFormat(forBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        recognitionRequest.append(buffer)
      }
      audioEngine.prepare()
      try audioEngine.start()
      store.markListening()
    } catch {
      store.fail(error.localizedDescription)
      teardownRecognition(markCancelled: false)
    }
  }

  private func startStopPolling() {
    stopPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      guard let self, self.store.isStopRequested() else { return }
      let snap = self.store.snapshot()
      if !snap.partialText.isEmpty {
        self.store.complete(snap.partialText)
      } else {
        self.store.cancel()
      }
      self.teardownRecognition(markCancelled: false)
    }
    RunLoop.main.add(timer, forMode: .common)
    stopPollTimer = timer
  }

  private func teardownEngineOnly() {
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionRequest = nil
    recognitionTask = nil
  }

  private func teardownRecognition(markCancelled: Bool) {
    stopPollTimer?.invalidate()
    stopPollTimer = nil
    teardownEngineOnly()
    if markCancelled {
      store.cancel()
    }
    activeRequestId = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
