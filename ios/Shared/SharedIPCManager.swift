import Foundation

/// Unified Inter-Process Communication (IPC) Manager for Type Easy & TypeVoice.
///
/// Backed by:
/// 1. App Group Shared Container (`FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.type.easy.shared")`)
///    with atomic JSON persistence (`ipc_state.json`) and zero calls to UserDefaults(suiteName:) or cfprefsd.
/// 2. Darwin Notification Center (`CFNotificationCenterGetDarwinNotifyCenter()`) for instant, zero-delay cross-process event signaling between the keyboard extension and backgrounded main app.
public final class SharedIPCManager {
  public static let shared = SharedIPCManager()

  // App Group Identifier
  public static let primaryAppGroup = "group.com.type.easy.shared"

  // Darwin Notification Names (Cross-Process IPC)
  public static let notifyStartCapture        = "com.typeeasy.startCapture"
  public static let notifyStopCapture         = "com.typeeasy.stopCapture"
  public static let notifyTranscriptionReady   = "com.typeeasy.transcriptionReady"
  public static let notifySessionReady         = "com.typeeasy.sessionReady"
  public static let notifySessionInterrupted   = "com.typeeasy.sessionInterrupted"
  public static let notifyStateChanged         = "com.typeeasy.stateChanged"
  public static let notifyPing                 = "com.typeeasy.ping"

  // Legacy aliases for backward compatibility
  public static let legacyNotifyStartCapture      = "com.typevoice.startCapture"
  public static let legacyNotifyStopCapture       = "com.typevoice.stopCapture"
  public static let legacyNotifyTranscriptionReady = "com.typevoice.transcriptionReady"

  public let activeSuiteName: String
  public let containerURL: URL?
  public let containerStatus: String // "OK", "NO_ENTITLEMENT", "UNWRITABLE"
  public let isAppGroupValid: Bool

  private var ipcStateURL: URL? {
    return containerURL?.appendingPathComponent("ipc_state.json")
  }

  private var typeEasyIpcURL: URL? {
    return containerURL?.appendingPathComponent("typeeasy_ipc.json")
  }

  private var memoryState = IPCState()
  private let stateLock = NSLock()

  private init() {
    self.activeSuiteName = Self.primaryAppGroup

    // Resolve App Group shared container strictly via FileManager.
    // Never touches UserDefaults(suiteName:) or cfprefsd.
    guard let url = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.primaryAppGroup
    ) else {
      NSLog("[SharedIPC] ❌ App Group containerURL is NIL for '%@'. Check Xcode App Groups entitlements!", Self.primaryAppGroup)
      self.containerURL = nil
      self.containerStatus = "NO_ENTITLEMENT"
      self.isAppGroupValid = false
      return
    }

    self.containerURL = url

    // Validate container write/read access once at init
    let testFile = url.appendingPathComponent(".container_check")
    var ok = false
    do {
      try "ok".write(to: testFile, atomically: true, encoding: .utf8)
      let read = try String(contentsOf: testFile, encoding: .utf8)
      try? FileManager.default.removeItem(at: testFile)
      ok = (read == "ok")
    } catch {
      ok = false
      NSLog("[SharedIPC] ⚠️ Container URL exists but failed write test: %@", error.localizedDescription)
    }

    self.isAppGroupValid = ok
    self.containerStatus = ok ? "OK" : "UNWRITABLE"
    if ok {
      NSLog("[SharedIPC] ✅ Resolved App Group container: %@", url.path)
    }
  }

  // MARK: - Codable IPC State Model

  public struct IPCState: Codable {
    public var isAudioSessionReady: Bool = false
    public var isEngineRunning: Bool = false
    public var lastEngineHeartbeat: Double = 0
    public var needsForegroundReactivation: Bool = false
    public var engineStatusText: String = "STOP"
    public var isActivelyRecording: Bool = false
    public var currentRequestId: String = ""
    public var pendingTranscription: String = ""
    public var pendingText: String = "" // Explicit field requested for typeeasy_ipc.json
    public var transcriptionId: String = "" // Unique ID to deduplicate insertions across processes
    public var lastConsumedTranscriptionId: String = "" // Persisted across app switches
    public var partialTranscription: String = ""
    public var timestamp: Double = 0
    public var createdAt: Double = 0 // Strict 15s TTL timestamp
    public var isConsumed: Bool = true
    public var lastReturnScheme: String = ""
    public var micLevelDb: Float = -160.0
    public var lastPingTimestamp: Double = 0
    public var lastPingSender: String = ""
    public var errorMessage: String? = nil

    public init() {}
  }

  // MARK: - Non-Blocking Atomic JSON File Operations

  /// Reads current IPC state from typeeasy_ipc.json / ipc_state.json without locks, coordination, or UserDefaults.
  public func readState() -> IPCState {
    let candidateURLs = [typeEasyIpcURL, ipcStateURL].compactMap { $0 }
    for url in candidateURLs {
      if FileManager.default.fileExists(atPath: url.path) {
        do {
          let data = try Data(contentsOf: url)
          let state = try JSONDecoder().decode(IPCState.self, from: data)
          stateLock.lock()
          self.memoryState = state
          stateLock.unlock()
          return state
        } catch {
          // Try next candidate
        }
      }
    }

    stateLock.lock()
    defer { stateLock.unlock() }
    return memoryState
  }

  /// Writes IPC state atomically to typeeasy_ipc.json and ipc_state.json without touching cfprefsd or UserDefaults.
  public func writeState(_ update: (inout IPCState) -> Void) {
    stateLock.lock()
    update(&memoryState)
    let stateToSave = memoryState
    stateLock.unlock()

    let candidateURLs = [typeEasyIpcURL, ipcStateURL].compactMap { $0 }
    if let data = try? JSONEncoder().encode(stateToSave) {
      for url in candidateURLs {
        do {
          try data.write(to: url, options: .atomic)
        } catch {
          NSLog("[SharedIPC] ⚠️ Failed to write atomic %@: %@", url.lastPathComponent, error.localizedDescription)
        }
      }
    }
  }

  // MARK: - Properties Bridged to Atomic State

  public var isAudioSessionReady: Bool {
    get { readState().isAudioSessionReady }
    set {
      writeState {
        $0.isAudioSessionReady = newValue
        if newValue {
          $0.engineStatusText = "RUN"
        } else if $0.engineStatusText == "RUN" {
          $0.engineStatusText = "STOP"
        }
      }
      postDarwinNotification(Self.notifyStateChanged)
    }
  }

  public var isEngineRunning: Bool {
    get { readState().isEngineRunning }
    set {
      writeState {
        $0.isEngineRunning = newValue
        if newValue {
          $0.isAudioSessionReady = true
          $0.engineStatusText = "RUN"
          $0.needsForegroundReactivation = false
          $0.lastEngineHeartbeat = Date().timeIntervalSince1970
        } else {
          $0.isAudioSessionReady = false
          if $0.engineStatusText == "RUN" {
            $0.engineStatusText = "STOP"
          }
        }
      }
      postDarwinNotification(Self.notifyStateChanged)
    }
  }

  public var needsForegroundReactivation: Bool {
    get { readState().needsForegroundReactivation }
    set {
      writeState {
        $0.needsForegroundReactivation = newValue
        if newValue {
          $0.isEngineRunning = false
          $0.isAudioSessionReady = false
          $0.engineStatusText = "RE-ARM"
        }
      }
      postDarwinNotification(Self.notifyStateChanged)
    }
  }

  public var lastEngineHeartbeat: Double {
    get { readState().lastEngineHeartbeat }
    set { writeState { $0.lastEngineHeartbeat = newValue } }
  }

  public var engineStatusText: String {
    get { readState().engineStatusText }
    set {
      writeState { $0.engineStatusText = newValue }
      postDarwinNotification(Self.notifyStateChanged)
    }
  }

  public var isActivelyRecording: Bool {
    get { readState().isActivelyRecording }
    set {
      writeState { $0.isActivelyRecording = newValue }
      postDarwinNotification(Self.notifyStateChanged)
    }
  }

  public var currentRequestId: String {
    get { readState().currentRequestId }
    set { writeState { $0.currentRequestId = newValue } }
  }

  public var partialTranscription: String {
    get { readState().partialTranscription }
    set { writeState { $0.partialTranscription = newValue } }
  }

  public var errorMessage: String? {
    get { readState().errorMessage }
    set { writeState { $0.errorMessage = newValue } }
  }

  public var lastReturnScheme: String? {
    get {
      let s = readState().lastReturnScheme
      return s.isEmpty ? nil : s
    }
    set { writeState { $0.lastReturnScheme = newValue ?? "" } }
  }

  public var micLevelDb: Float {
    get { readState().micLevelDb }
    set { writeState { $0.micLevelDb = newValue } }
  }

  public var lastPingTimestamp: Double {
    get { readState().lastPingTimestamp }
    set { writeState { $0.lastPingTimestamp = newValue } }
  }

  public var lastPingSender: String {
    get { readState().lastPingSender }
    set { writeState { $0.lastPingSender = newValue } }
  }

  // MARK: - Ping / Heartbeat IPC

  public func sendPing(from sender: String) {
    writeState {
      $0.lastPingTimestamp = Date().timeIntervalSince1970
      $0.lastPingSender = sender
    }
    postDarwinNotification(Self.notifyPing)
  }

  // MARK: - Transcription Payload Operations

  /// Stores a completed transcription payload atomically in typeeasy_ipc.json and ipc_state.json.
  public func postTranscription(_ text: String, requestId: String, transcriptionId: String? = nil) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let tId = (transcriptionId?.isEmpty == false) ? transcriptionId! : UUID().uuidString
    let now = Date().timeIntervalSince1970
    writeState {
      $0.pendingTranscription = trimmed
      $0.pendingText = trimmed
      $0.transcriptionId = tId
      $0.currentRequestId = requestId
      $0.timestamp = now
      $0.createdAt = now
      $0.isConsumed = false
      $0.isActivelyRecording = false
    }

    postDarwinNotification(Self.notifyTranscriptionReady)
    NSLog("[SharedIPC] 📤 Posted transcription '%@' (reqId: %@, transcriptionId: %@, createdAt: %.2f)", trimmed, requestId, tId, now)
  }

  /// Consumes the pending transcription once, atomically clearing it.
  public func consumePendingTranscription(maxAgeSeconds: TimeInterval = 15) -> String? {
    let state = readState()
    guard !state.isConsumed else { return nil }

    var text = state.pendingText.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty {
      text = state.pendingTranscription.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    guard !text.isEmpty else { return nil }

    let recordTime = state.createdAt > 0 ? state.createdAt : state.timestamp
    let age = (recordTime > 0) ? (Date().timeIntervalSince1970 - recordTime) : 999.0
    guard recordTime > 0 && age <= maxAgeSeconds else {
      writeState {
        $0.isConsumed = true
        $0.pendingTranscription = ""
        $0.pendingText = ""
        $0.transcriptionId = ""
      }
      return nil
    }

    // Mark as consumed immediately
    writeState {
      $0.isConsumed = true
      $0.pendingTranscription = ""
      $0.pendingText = ""
      $0.lastConsumedTranscriptionId = state.transcriptionId
      $0.transcriptionId = ""
    }

    NSLog("[SharedIPC] 📥 Successfully consumed transcription from typeeasy_ipc.json: '%@'", text)
    return text
  }

  public func resetSession() {
    writeState {
      $0.isActivelyRecording = false
      $0.isConsumed = true
      $0.pendingTranscription = ""
      $0.pendingText = ""
      $0.transcriptionId = ""
      $0.partialTranscription = ""
      $0.errorMessage = nil
    }
  }

  // MARK: - Darwin Notification Center (Cross-Process IPC)

  /// Posts a system-wide Darwin notification (broadcast across process sandboxes).
  public func postDarwinNotification(_ name: String) {
    let notificationName = CFNotificationName(name as CFString)
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterPostNotification(center, notificationName, nil, nil, true)
    NSLog("[SharedIPC] 📡 Posted Darwin Notification: %@", name)
  }

  /// Observes a Darwin notification with a closure.
  public func observeDarwinNotification(_ name: String, handler: @escaping () -> Void) -> DarwinObserverToken {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let token = DarwinObserverToken(name: name, handler: handler)
    let observer = Unmanaged.passUnretained(token).toOpaque()

    let callback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer else { return }
      let token = Unmanaged<DarwinObserverToken>.fromOpaque(observer).takeUnretainedValue()
      DispatchQueue.main.async {
        token.handler()
      }
    }

    CFNotificationCenterAddObserver(
      center,
      observer,
      callback,
      name as CFString,
      nil,
      .deliverImmediately
    )

    NSLog("[SharedIPC] 👂 Subscribed to Darwin Notification: %@", name)
    return token
  }

  public func removeDarwinObserver(_ token: DarwinObserverToken) {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(token).toOpaque()
    CFNotificationCenterRemoveObserver(center, observer, CFNotificationName(token.name as CFString), nil)
    NSLog("[SharedIPC] 🛑 Unsubscribed from Darwin Notification: %@", token.name)
  }
}

/// Token wrapping a Darwin notification subscription.
public final class DarwinObserverToken {
  public let name: String
  fileprivate let handler: () -> Void

  fileprivate init(name: String, handler: @escaping () -> Void) {
    self.name = name
    self.handler = handler
  }

  deinit {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterRemoveObserver(center, observer, CFNotificationName(name as CFString), nil)
  }
}
