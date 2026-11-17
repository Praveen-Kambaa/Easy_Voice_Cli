import AVFoundation
import Foundation
import Speech

/// Notification names for Keyboard Dictation in the host app.
extension Notification.Name {
  static let keyboardDictationPartial = Notification.Name("keyboardDictationPartial")
  static let keyboardDictationComplete = Notification.Name("keyboardDictationComplete")
  static let keyboardDictationError = Notification.Name("keyboardDictationError")
  static let keyboardDictationState = Notification.Name("keyboardDictationState")
}

/// Lifecycle states for TypeEasy iOS dictation service.
enum DictationLifecycleState: String {
  case idle
  case requestingPermissions
  case preparingAudioSession
  case starting
  case recording
  case stopping
  case processing
  case completed
  case failed
  case cancelled
}

/// Runs speech recognition in the main app (keyboard extensions cannot use the microphone).
/// Manages AVAudioSession, AVAudioEngine, and SFSpeechRecognizer lifecycle reliably across repeated sessions.
final class KeyboardDictationService {
  static let shared = KeyboardDictationService()

  private let store = KeyboardDictationStore.shared
  private let sessionQueue = DispatchQueue(label: "com.typeeasy.dictation.sessionQueue", qos: .userInitiated)

  private var lifecycleState: DictationLifecycleState = .idle
  private var activeRequestId: String?
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine: AVAudioEngine?
  private var hasInputTap = false
  private var isPaused = false
  private var stopPollTimer: Timer?
  private var audioObserversRegistered = false

  private init() {
    registerAudioSessionObservers()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Public API

  func isActive(requestId: String) -> Bool {
    sessionQueue.sync {
      guard activeRequestId == requestId else { return false }
      return lifecycleState == .requestingPermissions ||
             lifecycleState == .preparingAudioSession ||
             lifecycleState == .starting ||
             lifecycleState == .recording
    }
  }

  func currentLifecycleState() -> DictationLifecycleState {
    sessionQueue.sync { lifecycleState }
  }

  func start(requestId: String) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.log(requestId, "Dictation request received (current state=\(self.lifecycleState.rawValue), activeId=\(self.activeRequestId ?? "none"))")

      // 1. Guard against duplicate / redundant start requests for the same session
      if self.activeRequestId == requestId {
        switch self.lifecycleState {
        case .requestingPermissions, .preparingAudioSession, .starting, .recording:
          self.log(requestId, "Redundant start request ignored: session already \(self.lifecycleState.rawValue)")
          return
        case .stopping, .processing:
          self.log(requestId, "Session is currently \(self.lifecycleState.rawValue); waiting for cleanup before restarting")
          self.performTeardown(requestId: self.activeRequestId, markCancelled: false, deactivateAudio: true)
        case .idle, .completed, .failed, .cancelled:
          break
        }
      } else if self.activeRequestId != nil {
        self.log(requestId, "Tearing down previous session \(self.activeRequestId ?? "") before starting new session")
        self.performTeardown(requestId: self.activeRequestId, markCancelled: false, deactivateAudio: true)
      }

      // 2. Set new active session state
      self.activeRequestId = requestId
      self.lifecycleState = .requestingPermissions
      self.isPaused = false
      self.store.clearStopRequested()
      self.store.begin(requestId: requestId)
      self.notifyStateChanged(KeyboardDictationState.requested.rawValue)

      DispatchQueue.main.async {
        self.startStopPolling()
      }

      // 3. Begin permission validation
      self.requestPermissionsAndBegin(requestId: requestId)
    }
  }

  func pause() {
    sessionQueue.async { [weak self] in
      guard let self, self.lifecycleState == .recording, let engine = self.audioEngine, engine.isRunning else { return }
      engine.pause()
      self.isPaused = true
      self.log(self.activeRequestId, "Dictation paused")
      self.notifyStateChanged("PAUSED")
    }
  }

  func resume() {
    sessionQueue.async { [weak self] in
      guard let self, self.isPaused, let engine = self.audioEngine else { return }
      do {
        try engine.start()
        self.isPaused = false
        self.log(self.activeRequestId, "Dictation resumed")
        self.notifyStateChanged(KeyboardDictationState.recording.rawValue)
      } catch {
        self.log(self.activeRequestId, "Failed to resume audio engine: \(error.localizedDescription)")
        self.notifyError(error.localizedDescription)
      }
    }
  }

  func stop(finalText: String? = nil) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard let requestId = self.activeRequestId else {
        self.log(nil, "stop() called but no active session")
        return
      }
      self.log(requestId, "Recording stopped (stop requested)")

      // Idempotency: Ignore if already stopping, completed, failed or idle
      guard self.lifecycleState == .recording ||
            self.lifecycleState == .starting ||
            self.lifecycleState == .requestingPermissions ||
            self.lifecycleState == .preparingAudioSession else {
        self.log(requestId, "stop() called while in state \(self.lifecycleState.rawValue). Idempotent return.")
        return
      }

      self.lifecycleState = .stopping

      // Determine final text: explicit argument -> partial text -> empty
      let candidateText: String
      if let text = finalText, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        candidateText = text.trimmingCharacters(in: .whitespacesAndNewlines)
      } else {
        let snap = self.store.snapshot()
        let t = (snap.finalText.isEmpty ? snap.partialText : snap.finalText).trimmingCharacters(in: .whitespacesAndNewlines)
        candidateText = t
      }

      // 1. Stop audio input tap and audio engine immediately
      self.stopAudioInputAndEngine(requestId: requestId)

      // 2. Finalize recognition audio stream
      self.recognitionRequest?.endAudio()
      self.recognitionTask?.finish()

      self.lifecycleState = .processing

      // 3. Process transcription and update store
      if !candidateText.isEmpty {
        self.log(requestId, "Recognition completed with text: '\(candidateText)'")
        self.transitionToCompleted(requestId: requestId, finalText: candidateText)
      } else {
        self.log(requestId, "No speech captured; cancelling session cleanly")
        self.transitionToCancelled(requestId: requestId)
      }
    }
  }

  func cancel() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      let reqId = self.activeRequestId
      self.log(reqId, "cancel() requested")
      self.transitionToCancelled(requestId: reqId)
    }
  }

  func finalizeCurrentSession() {
    stop()
  }

  // MARK: - Lifecycle Pipeline

  private func requestPermissionsAndBegin(requestId: String) {
    let session = AVAudioSession.sharedInstance()
    let micStatus = session.recordPermission
    let speechStatus = SFSpeechRecognizer.authorizationStatus()

    log(requestId, "Checking permissions: mic=\(micStatus.rawValue), speech=\(speechStatus.rawValue)")

    // Fast-path: When running in the background, asynchronous permission requests
    // (session.requestRecordPermission / SFSpeechRecognizer.requestAuthorization)
    // are deferred by iOS until foregrounded. If already granted, begin immediately!
    if micStatus == .granted && speechStatus == .authorized {
      log(requestId, "Permissions already granted. Starting recognition immediately.")
      self.beginRecognition(requestId: requestId)
      return
    }

    session.requestRecordPermission { [weak self] micGranted in
      guard let self else { return }
      self.sessionQueue.async {
        guard self.activeRequestId == requestId else {
          self.log(requestId, "Session changed or cancelled while awaiting mic permission")
          return
        }

        self.log(requestId, "Microphone permission status: \(micGranted ? "granted" : "denied")")
        guard micGranted else {
          self.transitionToFailed(
            requestId: requestId,
            error: "Microphone permission denied. Enable mic for Type Easy in Settings → Privacy → Microphone."
          )
          return
        }

        SFSpeechRecognizer.requestAuthorization { authStatus in
          self.sessionQueue.async {
            guard self.activeRequestId == requestId else {
              self.log(requestId, "Session changed or cancelled while awaiting speech permission")
              return
            }

            self.log(requestId, "Speech recognition authorization status: \(authStatus.rawValue)")
            guard authStatus == .authorized else {
              self.transitionToFailed(
                requestId: requestId,
                error: "Speech recognition permission denied. Enable in Settings."
              )
              return
            }

            self.beginRecognition(requestId: requestId)
          }
        }
      }
    }
  }

  private func beginRecognition(requestId: String) {
    // Clean up any lingering engine or task
    cleanupAudioEngineOnly(requestId: requestId)

    lifecycleState = .preparingAudioSession
    log(requestId, "Configuring audio session")

    let locale = Locale(identifier: KeyboardSharedConfig.currentSpeechLocale())
    speechRecognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(locale: Locale.current)
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      log(requestId, "Speech recognition is unavailable for locale \(locale.identifier)")
      transitionToFailed(requestId: requestId, error: "Speech recognition is unavailable.")
      return
    }

    do {
      let session = AVAudioSession.sharedInstance()

      // Configure category and mode for high quality speech recognition
      do {
        try session.setCategory(
          .playAndRecord,
          mode: .spokenAudio,
          options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP]
        )
        log(requestId, "Audio session category configured (.playAndRecord, mode: .spokenAudio)")
      } catch {
        try session.setCategory(
          .playAndRecord,
          mode: .measurement,
          options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
        )
        log(requestId, "Audio session fallback configured (.playAndRecord, mode: .measurement, mixWithOthers)")
      }

      // Activate audio session explicitly
      try session.setActive(true)
      log(requestId, "Audio session activated")

      lifecycleState = .starting

      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true
      if #available(iOS 16.0, *) {
        request.addsPunctuation = true
      }
      self.recognitionRequest = request

      // Create a fresh audio engine instance for each session
      let engine = AVAudioEngine()
      self.audioEngine = engine

      let inputNode = engine.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)
      log(requestId, "Audio input node format: sampleRate=\(recordingFormat.sampleRate), channels=\(recordingFormat.channelCount)")

      let inputFormat: AVAudioFormat
      if recordingFormat.sampleRate > 0 && recordingFormat.channelCount > 0 {
        inputFormat = recordingFormat
      } else {
        inputFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 1, interleaved: false) ?? recordingFormat
      }

      if hasInputTap {
        inputNode.removeTap(onBus: 0)
        hasInputTap = false
      }

      inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
        self?.recognitionRequest?.append(buffer)
      }
      self.hasInputTap = true

      // Initialize recognition task pinned to this specific requestId
      self.recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self else { return }
        self.sessionQueue.async {
          // CRUCIAL: Protect against old/stale task callbacks overwriting newer sessions
          guard self.activeRequestId == requestId else {
            self.log(requestId, "Ignoring recognition callback from stale session (current active is \(self.activeRequestId ?? "none"))")
            return
          }

          if let result {
            let text = result.bestTranscription.formattedString
            self.log(requestId, "Partial transcription received: '\(text)' (isFinal=\(result.isFinal))")
            DispatchQueue.main.async {
              self.store.updatePartial(text)
              self.notifyPartial(text)
            }
            if result.isFinal {
              self.log(requestId, "Recognition completed (isFinal)")
              self.transitionToCompleted(requestId: requestId, finalText: text)
            }
          }

          if let error {
            let ns = error as NSError
            self.log(requestId, "Recognition notice: domain=\(ns.domain), code=\(ns.code), desc='\(error.localizedDescription)'")

            // Safe handling: ignore benign cancellation and silence notifications
            let isCancelled = ns.code == 216 || ns.code == 203 ||
                              error.localizedDescription.localizedCaseInsensitiveContains("canceled") ||
                              error.localizedDescription.localizedCaseInsensitiveContains("cancelled")
            if isCancelled {
              self.log(requestId, "Recognition cancellation notice handled safely (non-fatal)")
              return
            }

            if ns.domain == "kAFAssistantErrorDomain" && (ns.code == 1700 || ns.code == 1110) {
              self.log(requestId, "Waiting for speech notice ignored")
              return
            }
            if error.localizedDescription.localizedCaseInsensitiveContains("No speech detected") {
              self.log(requestId, "No speech detected notice ignored")
              return
            }

            // Real fatal recognition failure
            self.log(requestId, "Fatal recognition error: \(error.localizedDescription)")
            self.transitionToFailed(requestId: requestId, error: error.localizedDescription)
          }
        }
      }
      log(requestId, "Recognition task created")

      engine.prepare()
      do {
        try engine.start()
        log(requestId, "Recording started")
      } catch {
        let ns = error as NSError
        log(requestId, "Engine initial start warning: \(ns.domain) code=\(ns.code) (\(error.localizedDescription)). Attempting recovery with .mixWithOthers...")
        try? session.setCategory(
          .playAndRecord,
          mode: .measurement,
          options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
        )
        try? session.setActive(true)
        engine.prepare()
        try engine.start()
        log(requestId, "Recording started (after recovery)")
      }

      lifecycleState = .recording
      store.markRecording(requestId: requestId)
      notifyStateChanged(KeyboardDictationState.recording.rawValue)

    } catch {
      let ns = error as NSError
      log(requestId, "Audio engine start failed: domain=\(ns.domain), code=\(ns.code), desc='\(error.localizedDescription)'")
      let errorMsg = (ns.code == 560557684 || error.localizedDescription.contains("560557684"))
        ? "Microphone session paused. Tap mic to re-open Type Easy."
        : "Audio engine error: \(error.localizedDescription)"
      transitionToFailed(requestId: requestId, error: errorMsg)
    }
  }

  // MARK: - Transitions & Teardown

  private func transitionToCompleted(requestId: String, finalText: String) {
    lifecycleState = .completed
    log(requestId, "Final transcription completed: '\(finalText)'")
    store.complete(finalText)
    log(requestId, "Result stored in App Group")
    notifyComplete(finalText)
    performTeardown(requestId: requestId, markCancelled: false, deactivateAudio: true)
  }

  private func transitionToFailed(requestId: String, error: String) {
    lifecycleState = .failed
    store.fail(error)
    notifyError(error)
    performTeardown(requestId: requestId, markCancelled: false, deactivateAudio: true)
  }

  private func transitionToCancelled(requestId: String?) {
    lifecycleState = .cancelled
    store.cancel()
    notifyStateChanged(KeyboardDictationState.cancelled.rawValue)
    performTeardown(requestId: requestId, markCancelled: true, deactivateAudio: true)
  }

  private func stopAudioInputAndEngine(requestId: String?) {
    if let engine = audioEngine {
      if hasInputTap {
        engine.inputNode.removeTap(onBus: 0)
        hasInputTap = false
        log(requestId, "Removed audio input tap")
      }
      if engine.isRunning {
        engine.stop()
        log(requestId, "Audio engine stopped")
      }
      engine.reset()
    }
    audioEngine = nil
    log(requestId, "Audio engine cleaned up")
  }

  private func cleanupAudioEngineOnly(requestId: String?) {
    stopAudioInputAndEngine(requestId: requestId)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionRequest = nil
    recognitionTask = nil
    isPaused = false
  }

  private func performTeardown(requestId: String?, markCancelled: Bool, deactivateAudio: Bool = false) {
    DispatchQueue.main.async { [weak self] in
      self?.stopPollTimer?.invalidate()
      self?.stopPollTimer = nil
    }

    cleanupAudioEngineOnly(requestId: requestId)

    // Preserve active audio session while background dictation is in use.
    // Deactivating the session in the background causes iOS to revoke background audio
    // privileges and fail subsequent sessions with OSStatus 560557684.
    if deactivateAudio {
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        log(requestId, "Audio session deactivated")
      } catch {
        let ns = error as NSError
        log(requestId, "Audio session deactivation notice: \(ns.domain) \(ns.code)")
      }
    } else {
      log(requestId, "Preserving active audio session for subsequent background recordings")
    }

    speechRecognizer = nil
    activeRequestId = nil
    lifecycleState = .idle
    log(requestId, "Ready for next recording")
  }

  // MARK: - Polling & Interruptions

  private func startStopPolling() {
    stopPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      guard let self else { return }
      if self.store.isStopRequested() {
        self.stop()
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    stopPollTimer = timer
  }

  private func registerAudioSessionObservers() {
    guard !audioObserversRegistered else { return }
    audioObserversRegistered = true

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
  }

  @objc private func handleAudioInterruption(_ notification: Notification) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard let userInfo = notification.userInfo,
            let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

      let reqId = self.activeRequestId
      if type == .began {
        self.log(reqId, "Audio interruption began (e.g. phone call / Siri). Stopping recording gracefully.")
        self.stop()
      } else if type == .ended {
        self.log(reqId, "Audio interruption ended.")
      }
    }
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard let userInfo = notification.userInfo,
            let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

      let reqId = self.activeRequestId
      self.log(reqId, "Audio route changed: reason=\(reason.rawValue)")
    }
  }

  // MARK: - Structured Logging & Notifications

  private func log(_ requestId: String?, _ message: String) {
    let id = requestId ?? activeRequestId ?? "no-session"
    NSLog("[TypeEasyDictation] [%@] %@", id, message)
  }

  private func notifyPartial(_ text: String) {
    NotificationCenter.default.post(name: .keyboardDictationPartial, object: nil, userInfo: ["text": text])
  }

  private func notifyComplete(_ text: String) {
    NotificationCenter.default.post(name: .keyboardDictationComplete, object: nil, userInfo: ["text": text])
  }

  private func notifyError(_ error: String) {
    NotificationCenter.default.post(name: .keyboardDictationError, object: nil, userInfo: ["error": error])
  }

  private func notifyStateChanged(_ state: String) {
    NotificationCenter.default.post(name: .keyboardDictationState, object: nil, userInfo: ["state": state])
  }
}
