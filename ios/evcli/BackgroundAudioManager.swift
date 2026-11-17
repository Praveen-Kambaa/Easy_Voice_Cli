import AVFoundation
import Foundation
import Speech
import UIKit

/// Background Audio Manager for Type Easy / TypeVoice Main App.
///
/// Implements bulletproof background audio keep-alive (Wispr Flow / Superwhisper pattern):
/// 1. Initializes `AVAudioSession` with `.playAndRecord` + `[.mixWithOthers, .allowBluetoothHFP, .defaultToSpeaker]`.
/// 2. Loops a zero-volume silent `AVAudioPlayer` in memory so iOS `mediaserverd` maintains an active dual-direction audio stream.
/// 3. Installs a continuous `AVAudioEngine` input tap on Bus 0, calculating live mic dB levels for diagnostics.
/// 4. Connects live audio buffers to `SFSpeechAudioBufferRecognitionRequest` ONLY when `isActivelyRecording == true`.
/// 5. Automatically publishes results to App Groups and posts Darwin notifications back to `KeyboardViewController`.
public final class BackgroundAudioManager: NSObject {
  public static let shared = BackgroundAudioManager()

  private let ipc = SharedIPCManager.shared
  private let sessionQueue = DispatchQueue(label: "com.typeeasy.backgroundAudio.queue", qos: .userInitiated)

  private var audioEngine: AVAudioEngine?
  private var silentPlayer: AVAudioPlayer?
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?

  private var hasInputTap = false
  private var currentSessionText = ""
  private var hasCommittedCurrentCapture = false
  private var lastHeartbeatTime: Double = 0
  private var isSubscribed = false
  private var audioFileForSession: AVAudioFile?
  private var sessionAudioURL: URL?

  // Darwin Observer Tokens
  private var startTokens: [DarwinObserverToken] = []
  private var stopTokens: [DarwinObserverToken] = []
  private var pingToken: DarwinObserverToken?

  // Listeners for UI meters
  public var onMicLevelUpdate: ((Float) -> Void)?
  public var onStatusUpdate: ((String) -> Void)?

  private override init() {
    super.init()
    setupSystemNotificationObservers()
    setupDarwinIPCListeners()
  }

  // MARK: - Public Lifecycle API

  /// Immediately and synchronously activates AVAudioSession and the looping silent player while in the foreground.
  /// This registers the process with mediaserverd so iOS NEVER suspends the app when it transitions to background.
  @discardableResult
  @objc public func ensureActiveBeforeBackground() -> Bool {
    if let player = silentPlayer, player.isPlaying, ipc.isAudioSessionReady {
      return true
    }

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
      )
      try session.setActive(true)
      startSilentPlayerLoop()
      ipc.isAudioSessionReady = true
      NSLog("[BackgroundAudio] 🎙️ Foreground AudioSession & Silent Looper ACTIVATED synchronously.")
      return true
    } catch {
      NSLog("[BackgroundAudio] ⚠️ ensureActiveBeforeBackground error: %@", error.localizedDescription)
      return false
    }
  }

  /// Activates the background audio engine and returns back to the caller app (e.g. WhatsApp) without blocking.
  @objc public func activateAndReturn(returnScheme: String?, autoStart: Bool = false) {
    // 1. Immediately activate audio session & silent player synchronously while in foreground!
    ensureActiveBeforeBackground()

    // 2. Show interactive diagnostic overlay with live mic meter immediately
    ActivationViewController.presentIfNeeded(returnScheme: returnScheme)
    LiveActivityManager.shared.startLiveActivity()

    // 3. Continue activating continuous engine tap asynchronously
    activateBackgroundEngine { [weak self] success, error in
      guard let self else { return }
      DispatchQueue.main.async {
        if success {
          if autoStart {
            let reqId = UUID().uuidString
            self.ipc.currentRequestId = reqId
            self.beginDictationCapture(requestId: reqId)
          }

          // Automatically prompt return to host app (e.g. whatsapp://)
          if let returnScheme = returnScheme, !returnScheme.isEmpty,
             let targetURL = URL(string: "\(returnScheme)://") {
            NSLog("[BackgroundAudio] 🔗 Calling UIApplication.open for returnScheme: %@", targetURL.absoluteString)
            UIApplication.shared.open(targetURL, options: [:]) { opened in
              NSLog("[BackgroundAudio] 🔗 Return handoff to %@: %d", returnScheme, opened)
            }
          }
        } else {
          NSLog("[BackgroundAudio] ❌ Failed to activate background engine: %@", error ?? "unknown error")
        }
      }
    }
  }

  /// Proactively warms up the background audio engine whenever mic is permitted.
  /// Automatically requests SFSpeechRecognizer authorization if undetermined.
  @objc public func warmUpIfPermitted() {
    let session = AVAudioSession.sharedInstance()
    let micStatus = session.recordPermission
    let speechStatus = SFSpeechRecognizer.authorizationStatus()

    // 1. If Speech Recognition permission is undetermined, request it automatically so iOS presents the prompt!
    if speechStatus == .notDetermined {
      DispatchQueue.main.async {
        SFSpeechRecognizer.requestAuthorization { status in
          NSLog("[BackgroundAudio] 🗣️ SFSpeechRecognizer permission updated: %ld", status.rawValue)
        }
      }
    }

    // 2. If mic permission is undetermined, request it
    if micStatus == .undetermined {
      session.requestRecordPermission { [weak self] granted in
        if granted {
          DispatchQueue.main.async {
            self?.activateBackgroundEngine()
          }
        }
      }
      return
    }

    let micGranted = (micStatus == .granted)
    guard micGranted else {
      NSLog("[BackgroundAudio] ℹ️ Warmup skipped: micGranted=0")
      return
    }

    // 3. Start engine whenever micGranted == true. Do NOT wait for speechGranted!
    NSLog("[BackgroundAudio] ☀️ Warming up background audio engine: micGranted=1 speechStatus=%ld", speechStatus.rawValue)

    guard !ipc.isAudioSessionReady else {
      NSLog("[BackgroundAudio] ℹ️ Engine already warm and ready.")
      return
    }

    activateBackgroundEngine { success, error in
      NSLog("[BackgroundAudio] ☀️ Warmup completed: success=%d", success)
    }
  }

  /// Activates the background audio session, continuous engine, and silent audio player keep-alive.
  /// Must be called while the app is in the foreground before triggering return handoff.
  public func activateBackgroundEngine(completion: ((Bool, String?) -> Void)? = nil) {
    // Guarantee synchronous audio session & silent looper active first
    ensureActiveBeforeBackground()

    sessionQueue.async { [weak self] in
      guard let self else { return }

      // 1. Ensure Permissions
      self.ensurePermissions { [weak self] granted, message in
        guard let self else { return }
        guard granted else {
          self.ipc.isAudioSessionReady = false
          self.ipc.errorMessage = message
          DispatchQueue.main.async { completion?(false, message) }
          return
        }

        // 2. Start Continuous Audio Engine Loop
        self.startContinuousAudioEngineLoop { [weak self] success, engineError in
          guard let self else { return }
          if success {
            self.ipc.isAudioSessionReady = true
            self.ipc.errorMessage = nil
            self.ipc.postDarwinNotification(SharedIPCManager.notifySessionReady)
            self.ipc.sendPing(from: "main_app")
            NSLog("[BackgroundAudio] 🚀 Continuous audio engine & silent keep-alive are LIVE.")
            DispatchQueue.main.async {
              self.onStatusUpdate?("Engine Active • Mic Ready")
              completion?(true, nil)
            }
          } else {
            self.ipc.errorMessage = engineError
            DispatchQueue.main.async { completion?(false, engineError) }
          }
        }
      }
    }
  }

  /// Gracefully tears down the continuous engine and releases hardware.
  public func deactivateBackgroundEngine() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.ipc.isAudioSessionReady = false
      self.ipc.isActivelyRecording = false
      self.stopCurrentDictationCapture(publishResult: false)
      self.stopContinuousAudioEngineLoop()
      self.stopSilentPlayerLoop()
      LiveActivityManager.shared.endLiveActivity()
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      NSLog("[BackgroundAudio] 🛑 Audio session and engine deactivated.")
    }
  }

  // MARK: - Silent Audio Looping Player (Prevents iOS 3s Suspension)

  private func startSilentPlayerLoop() {
    stopSilentPlayerLoop()
    let silentData = createSilentWavData()
    do {
      let player = try AVAudioPlayer(data: silentData)
      player.numberOfLoops = -1 // Loop infinitely
      player.volume = 0.0 // Zero volume (silent)
      player.prepareToPlay()
      player.play()
      self.silentPlayer = player
      NSLog("[BackgroundAudio] 🔇 Silent audio player started (infinite loop, vol 0.0). Keeps iOS audio background active.")
    } catch {
      NSLog("[BackgroundAudio] ⚠️ Failed to start silent audio player: %@", error.localizedDescription)
    }
  }

  private func stopSilentPlayerLoop() {
    silentPlayer?.stop()
    silentPlayer = nil
  }

  /// Generates a valid 1-second 16-bit PCM mono silent WAV file in memory.
  private func createSilentWavData() -> Data {
    let sampleRate: Int32 = 44100
    let numChannels: Int16 = 1
    let bitsPerSample: Int16 = 16
    let byteRate: Int32 = sampleRate * Int32(numChannels) * Int32(bitsPerSample / 8)
    let blockAlign: Int16 = numChannels * (bitsPerSample / 8)
    let numSamples: Int32 = sampleRate
    let dataSize: Int32 = numSamples * Int32(blockAlign)
    let chunkSize: Int32 = 36 + dataSize

    var data = Data()
    data.append(contentsOf: "RIFF".utf8)
    data.append(contentsOf: withUnsafeBytes(of: chunkSize.littleEndian) { Array($0) })
    data.append(contentsOf: "WAVEfmt ".utf8)
    let subchunk1Size: Int32 = 16
    let audioFormat: Int16 = 1
    data.append(contentsOf: withUnsafeBytes(of: subchunk1Size.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: audioFormat.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: numChannels.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: sampleRate.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
    data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })
    data.append(contentsOf: "data".utf8)
    data.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })
    data.append(contentsOf: [UInt8](repeating: 0, count: Int(dataSize)))
    return data
  }

  // MARK: - Continuous Audio Engine (Bus 0 Tap + dB Metering)

  private func startContinuousAudioEngineLoop(completion: @escaping (Bool, String?) -> Void) {
    stopContinuousAudioEngineLoop()

    let engine = AVAudioEngine()
    self.audioEngine = engine

    let inputNode = engine.inputNode
    let hardwareFormat = inputNode.outputFormat(forBus: 0)

    let tapFormat: AVAudioFormat
    if hardwareFormat.sampleRate > 0 && hardwareFormat.channelCount > 0 {
      tapFormat = hardwareFormat
    } else {
      tapFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 1, interleaved: false) ?? hardwareFormat
    }

    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: tapFormat) { [weak self] buffer, _ in
      guard let self else { return }

      // 1. Calculate Live Microphone RMS & dB level for diagnostic strip & meter
      if let channelData = buffer.floatChannelData?[0] {
        let frameLen = Int(buffer.frameLength)
        if frameLen > 0 {
          var sumSquares: Float = 0
          for i in 0..<frameLen {
            let s = channelData[i]
            sumSquares += s * s
          }
          let rms = sqrt(sumSquares / Float(frameLen))
          let db = 20.0 * log10(max(rms, 1e-4))
          self.ipc.micLevelDb = db
          DispatchQueue.main.async {
            self.onMicLevelUpdate?(db)
          }
        }
      }

      // 2. Route audio to speech recognition & WAV capture ONLY when user is actively recording
      if self.ipc.isActivelyRecording {
        self.recognitionRequest?.append(buffer)
        try? self.audioFileForSession?.write(from: buffer)
      }

      // 3. Heartbeat update to keep shared state fresh for keyboard extension
      let now = Date().timeIntervalSince1970
      if (now - self.lastHeartbeatTime) > 1.0 {
        self.lastHeartbeatTime = now
        self.ipc.lastEngineHeartbeat = now
        if !self.ipc.isEngineRunning {
          self.ipc.isEngineRunning = true
        }
      }
    }
    self.hasInputTap = true

    engine.prepare()
    do {
      try engine.start()
      self.ipc.isEngineRunning = true
      self.ipc.isAudioSessionReady = true
      self.ipc.needsForegroundReactivation = false
      self.ipc.lastEngineHeartbeat = Date().timeIntervalSince1970
      NSLog("[BackgroundAudio] ✅ Continuous engine started on bus 0 (sampleRate: %.0f Hz).", tapFormat.sampleRate)
      completion(true, nil)
    } catch {
      let ns = error as NSError
      NSLog("[BackgroundAudio] ❌ Failed to start engine: %@ (code: %ld)", error.localizedDescription, ns.code)
      self.ipc.isEngineRunning = false
      self.ipc.isAudioSessionReady = false
      self.ipc.needsForegroundReactivation = true
      completion(false, error.localizedDescription)
    }
  }

  private func stopContinuousAudioEngineLoop() {
    if let engine = audioEngine {
      if hasInputTap {
        engine.inputNode.removeTap(onBus: 0)
        hasInputTap = false
      }
      if engine.isRunning {
        engine.stop()
      }
      engine.reset()
    }
    audioEngine = nil
  }

  // MARK: - Darwin Notification IPC Handlers

  private func setupDarwinIPCListeners() {
    guard !isSubscribed else {
      NSLog("[BackgroundAudio] ℹ️ Darwin listeners already registered, skipping duplicate setup.")
      return
    }
    isSubscribed = true

    // 1. Start Capture (listen ONLY to primary notifyStartCapture once)
    let startToken = ipc.observeDarwinNotification(SharedIPCManager.notifyStartCapture) { [weak self] in
      self?.handleStartCaptureNotification()
    }
    startTokens = [startToken]

    // 2. Stop Capture (listen ONLY to primary notifyStopCapture once)
    let stopToken = ipc.observeDarwinNotification(SharedIPCManager.notifyStopCapture) { [weak self] in
      self?.handleStopCaptureNotification()
    }
    stopTokens = [stopToken]

    // 3. Ping
    pingToken = ipc.observeDarwinNotification(SharedIPCManager.notifyPing) { [weak self] in
      guard let self else { return }
      NSLog("[BackgroundAudio] 🏓 Ping received from %@", self.ipc.lastPingSender)
    }
  }

  private func handleStartCaptureNotification() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      let reqId = self.ipc.currentRequestId.isEmpty ? UUID().uuidString : self.ipc.currentRequestId
      NSLog("[BackgroundAudio] [%@] 🎙️ Received startCapture Darwin notification from keyboard", reqId)

      // Ensure engine is running
      if self.audioEngine?.isRunning != true {
        NSLog("[BackgroundAudio] [%@] Engine not running. Attempting background reactivation...", reqId)
        self.activateBackgroundEngine { [weak self] success, err in
          guard let self else { return }
          if success {
            self.beginDictationCapture(requestId: reqId)
          } else {
            NSLog("[BackgroundAudio] [%@] 🛑 Background restart blocked (2003329396). Flagging needsForegroundReactivation.", reqId)
            self.ipc.isEngineRunning = false
            self.ipc.isAudioSessionReady = false
            self.ipc.needsForegroundReactivation = true
            self.ipc.postDarwinNotification(SharedIPCManager.notifySessionInterrupted)
          }
        }
      } else {
        self.beginDictationCapture(requestId: reqId)
      }
    }
  }

  private func handleStopCaptureNotification() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      let reqId = self.ipc.currentRequestId
      NSLog("[BackgroundAudio] [%@] ⏹️ Received stopCapture Darwin notification from keyboard", reqId)
      self.stopCurrentDictationCapture(publishResult: true)
    }
  }

  // MARK: - Dictation Pipeline

  private func beginDictationCapture(requestId: String) {
    recognitionRequest?.endAudio()
    recognitionTask?.finish()
    recognitionRequest = nil
    recognitionTask = nil
    currentSessionText = ""
    hasCommittedCurrentCapture = false

    // Create session audio file to capture PCM buffers as fallback for backend transcription
    let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
    let audioURL = tempDir.appendingPathComponent("dictation_\(requestId).wav")
    self.sessionAudioURL = audioURL
    if let engine = audioEngine {
      let format = engine.inputNode.outputFormat(forBus: 0)
      if format.sampleRate > 0 && format.channelCount > 0 {
        self.audioFileForSession = try? AVAudioFile(forWriting: audioURL, settings: format.settings)
      }
    }

    // Check SFSpeechRecognizer authorization
    let speechStatus = SFSpeechRecognizer.authorizationStatus()
    if speechStatus == .notDetermined {
      SFSpeechRecognizer.requestAuthorization { [weak self] status in
        if status == .authorized {
          self?.sessionQueue.async {
            self?.startSpeechRecognizerTask(requestId: requestId)
          }
        }
      }
    } else if speechStatus == .authorized {
      startSpeechRecognizerTask(requestId: requestId)
    } else {
      NSLog("[BackgroundAudio] [%@] ℹ️ SpeechRecognizer status=%ld; backend transcription fallback ready.", requestId, speechStatus.rawValue)
    }

    self.ipc.isActivelyRecording = true
    LiveActivityManager.shared.updateLiveActivity(isListening: true, status: "Listening…")
    NSLog("[BackgroundAudio] [%@] 🚀 Speech capture active.", requestId)
  }

  private func startSpeechRecognizerTask(requestId: String) {
    let locale = Locale(identifier: "en-US")
    speechRecognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      NSLog("[BackgroundAudio] [%@] ❌ Speech recognizer unavailable", requestId)
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 16.0, *) {
      request.addsPunctuation = true
    }
    self.recognitionRequest = request

    self.recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let text = result.bestTranscription.formattedString
        self.currentSessionText = text
        self.ipc.partialTranscription = text
        NSLog("[BackgroundAudio] [%@] 🗣️ Partial: '%@'", requestId, text)
        if result.isFinal {
          self.sessionQueue.async {
            self.commitCaptureOnce(text: text, requestId: requestId)
          }
        }
      }
      if let error {
        let ns = error as NSError
        if ns.code != 216 && ns.code != 203 {
          NSLog("[BackgroundAudio] [%@] Notice: %@", requestId, error.localizedDescription)
        }
      }
    }
  }

  /// Commits a transcription payload strictly once per dictation capture session.
  private func commitCaptureOnce(text: String, requestId: String) {
    guard !hasCommittedCurrentCapture else {
      NSLog("[BackgroundAudio] [%@] ⚠️ Capture already committed, skipping duplicate commit.", requestId)
      return
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    hasCommittedCurrentCapture = true

    let transcriptionId = UUID().uuidString
    ipc.postTranscription(trimmed, requestId: requestId, transcriptionId: transcriptionId)
    NSLog("[BackgroundAudio] [%@] 📤 Posted transcriptionReady (id: %@, text: '%@')", requestId, transcriptionId, trimmed)
    if let audioURL = sessionAudioURL {
      try? FileManager.default.removeItem(at: audioURL)
    }
  }

  private func stopCurrentDictationCapture(publishResult: Bool) {
    guard ipc.isActivelyRecording || recognitionRequest != nil || audioFileForSession != nil else { return }
    let reqId = ipc.currentRequestId

    ipc.isActivelyRecording = false
    LiveActivityManager.shared.updateLiveActivity(isListening: false, status: "Type Easy Mic Active • Ready to dictate")

    recognitionRequest?.endAudio()
    recognitionTask?.finish()
    recognitionRequest = nil
    recognitionTask = nil
    audioFileForSession = nil // Flushes and closes the WAV file

    let finalText = currentSessionText.trimmingCharacters(in: .whitespacesAndNewlines)
    NSLog("[BackgroundAudio] [%@] 📝 Final transcription captured: '%@'", reqId, finalText)

    if publishResult {
      if !finalText.isEmpty {
        commitCaptureOnce(text: finalText, requestId: reqId)
      } else if !hasCommittedCurrentCapture, let audioURL = sessionAudioURL, FileManager.default.fileExists(atPath: audioURL.path) {
        NSLog("[BackgroundAudio] [%@] ☁️ On-device transcript empty; falling back to backend transcription...", reqId)
        Task {
          let result = await KeyboardVoiceApiClient.transcribeFile(at: audioURL)
          switch result {
          case .success(let res):
            let transcript = res.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
            NSLog("[BackgroundAudio] [%@] ☁️ Backend transcribed: '%@'", reqId, transcript)
            if !transcript.isEmpty {
              self.sessionQueue.async {
                self.commitCaptureOnce(text: transcript, requestId: reqId)
              }
            }
          case .failure(let err):
            NSLog("[BackgroundAudio] [%@] ❌ Backend transcription failed: %@", reqId, err.localizedDescription)
          }
          try? FileManager.default.removeItem(at: audioURL)
        }
      }
    }

    currentSessionText = ""
  }

  // MARK: - Permission & Interruption Observers

  private func ensurePermissions(completion: @escaping (Bool, String?) -> Void) {
    let session = AVAudioSession.sharedInstance()
    let micStatus = session.recordPermission
    let speechStatus = SFSpeechRecognizer.authorizationStatus()

    // 1. Request Speech Recognition authorization automatically if undetermined
    if speechStatus == .notDetermined {
      DispatchQueue.main.async {
        SFSpeechRecognizer.requestAuthorization { status in
          NSLog("[BackgroundAudio] 🗣️ SFSpeechRecognizer authorization updated: %ld", status.rawValue)
        }
      }
    }

    // 2. Microphone permission is sufficient to start the continuous audio engine
    if micStatus == .granted {
      completion(true, nil)
      return
    }

    if micStatus == .undetermined {
      session.requestRecordPermission { granted in
        if granted {
          completion(true, nil)
        } else {
          completion(false, "Microphone permission denied. Enable in Settings.")
        }
      }
    } else {
      completion(false, "Microphone permission denied. Enable in Settings.")
    }
  }

  private func setupSystemNotificationObservers() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppWillTerminate),
      name: UIApplication.willTerminateNotification,
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

      if type == .began {
        NSLog("[BackgroundAudio] ⚠️ Audio interruption began (e.g. phone call or external media).")
        self.ipc.isEngineRunning = false
        self.ipc.isAudioSessionReady = false
        self.ipc.needsForegroundReactivation = true
        self.stopCurrentDictationCapture(publishResult: false)
        self.ipc.postDarwinNotification(SharedIPCManager.notifySessionInterrupted)
      } else if type == .ended {
        NSLog("[BackgroundAudio] ℹ️ Audio interruption ended. Attempting background recovery...")
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
          try session.setActive(true)
          if let engine = self.audioEngine {
            if !engine.isRunning {
              try engine.start()
            }
            self.ipc.isEngineRunning = true
            self.ipc.isAudioSessionReady = true
            self.ipc.needsForegroundReactivation = false
            self.ipc.lastEngineHeartbeat = Date().timeIntervalSince1970
            self.ipc.postDarwinNotification(SharedIPCManager.notifySessionReady)
            NSLog("[BackgroundAudio] ✅ Audio engine recovered in background after interruption!")
          }
        } catch {
          let ns = error as NSError
          NSLog("[BackgroundAudio] ⚠️ Background restart blocked (%@, code: %ld). Setting isEngineRunning = false, needsForegroundReactivation = true.", error.localizedDescription, ns.code)
          self.ipc.isEngineRunning = false
          self.ipc.isAudioSessionReady = false
          self.ipc.needsForegroundReactivation = true
        }
      }
    }
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard let userInfo = notification.userInfo,
            let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

      NSLog("[BackgroundAudio] 🎧 Route changed: reason=%lu", reason.rawValue)
      if reason == .oldDeviceUnavailable {
        if self.audioEngine?.isRunning != true {
          self.activateBackgroundEngine()
        }
      }
    }
  }

  @objc private func handleAppWillTerminate() {
    NSLog("[BackgroundAudio] 🛑 Main app will terminate. Resetting isAudioSessionReady = false.")
    ipc.isAudioSessionReady = false
    ipc.isActivelyRecording = false
    LiveActivityManager.shared.endLiveActivity()
    stopSilentPlayerLoop()
    ipc.postDarwinNotification(SharedIPCManager.notifySessionInterrupted)
  }
}
