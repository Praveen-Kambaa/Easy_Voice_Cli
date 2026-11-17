import Foundation
import UIKit

/// In-Keyboard Controller for the Type Easy Red Microphone Button.
///
/// Implements the "Open Once, Dictate Unlimited Times" client workflow:
/// - If `isAudioSessionReady == true`: Stays directly inside WhatsApp/host app, signals the main app
///   via Darwin notifications (`startCapture` / `stopCapture`), and inserts completed text into `textDocumentProxy`.
/// - If `isAudioSessionReady == false`: Triggers the one-time foreground activation of Type Easy via URL scheme,
///   passing the detected `returnScheme` so the main app can trigger immediate automatic return handoff!
public final class KeyboardMicController {

  public enum MicState {
    case idle
    case listening
    case processing
  }

  public weak var delegate: KeyboardMicControllerDelegate?

  private let ipc = SharedIPCManager.shared
  public private(set) var currentState: MicState = .idle

  // Darwin Observer Tokens
  private var transcriptionReadyTokens: [DarwinObserverToken] = []
  private var sessionReadyTokens: [DarwinObserverToken] = []
  private var sessionInterruptedTokens: [DarwinObserverToken] = []

  private var isSubscribed = false

  public init() {
    setupDarwinIPCListeners()
  }

  deinit {
    transcriptionReadyTokens.removeAll()
    sessionReadyTokens.removeAll()
    sessionInterruptedTokens.removeAll()
  }

  // MARK: - User Tap Action

  /// Called whenever the user taps the red microphone button on the keyboard toolbar.
  public func handleMicButtonTapped(
    extensionContext: NSExtensionContext?,
    textDocumentProxy: UITextDocumentProxy,
    returnScheme: String? = nil
  ) {
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()

    switch currentState {
    case .idle:
      startOrActivate(extensionContext: extensionContext, returnScheme: returnScheme)
    case .listening:
      stopDictation()
    case .processing:
      NSLog("[KeyboardMic] ⏳ Currently processing. Ignoring duplicate tap.")
    }
  }

  // MARK: - State Machine Handlers

  private func startOrActivate(extensionContext: NSExtensionContext?, returnScheme: String?) {
    let state = ipc.readState()
    let now = Date().timeIntervalSince1970
    let heartbeatAge = state.lastEngineHeartbeat > 0 ? (now - state.lastEngineHeartbeat) : 999.0
    let isHeartbeatFresh = heartbeatAge <= 20.0
    let isEngineWarm = state.isEngineRunning && state.isAudioSessionReady && !state.needsForegroundReactivation && isHeartbeatFresh

    if isEngineWarm {
      // WARM STATE: Stay completely inside WhatsApp / Host app!
      let reqId = UUID().uuidString
      ipc.currentRequestId = reqId
      ipc.resetSession()

      NSLog("[KeyboardMic] [%@] 🚀 Warm background state active (heartbeat: %.1fs ago). Posting startCapture.", reqId, heartbeatAge)
      ipc.postDarwinNotification(SharedIPCManager.notifyStartCapture)
      updateState(.listening)
    } else {
      // COLD / INTERRUPTED STATE: Re-arm via foreground bounce with autoStart=1
      NSLog("[KeyboardMic] ❄️ Foreground re-arm needed (isEngineRunning=%d, isAudioSessionReady=%d, needsReactivation=%d, heartbeatAge=%.1fs). Launching activation with autoStart=1.",
            state.isEngineRunning, state.isAudioSessionReady, state.needsForegroundReactivation, heartbeatAge)
      delegate?.micController(self, didRequestStatusMessage: "Re-activating Type Easy mic in background…")
      triggerForegroundReactivation(extensionContext: extensionContext, returnScheme: returnScheme, autoStart: true)
    }
  }

  public func stopDictation() {
    let reqId = ipc.currentRequestId
    NSLog("[KeyboardMic] [%@] ⏹️ User tapped stop. Posting stopCapture to background app.", reqId)
    ipc.postDarwinNotification(SharedIPCManager.notifyStopCapture)
    updateState(.processing)
  }

  // MARK: - Darwin Notification IPC Listeners

  private func setupDarwinIPCListeners() {
    guard !isSubscribed else { return }
    isSubscribed = true

    // 1. Transcription Ready (listen to primary notifyTranscriptionReady once)
    let readyToken = ipc.observeDarwinNotification(SharedIPCManager.notifyTranscriptionReady) { [weak self] in
      self?.handleTranscriptionReady()
    }
    transcriptionReadyTokens = [readyToken]

    // 2. Background app became ready
    let sessionToken = ipc.observeDarwinNotification(SharedIPCManager.notifySessionReady) { [weak self] in
      guard let self else { return }
      NSLog("[KeyboardMic] ✅ Received sessionReady from main app.")
      self.delegate?.micController(self, didRequestStatusMessage: "✓ Type Easy mic active! Tap mic to speak.")
    }
    sessionReadyTokens = [sessionToken]

    // 3. Audio session interrupted (e.g. phone call / camera)
    let interruptToken = ipc.observeDarwinNotification(SharedIPCManager.notifySessionInterrupted) { [weak self] in
      guard let self else { return }
      NSLog("[KeyboardMic] ⚠️ Received sessionInterrupted from main app.")
      self.updateState(.idle)
    }
    sessionInterruptedTokens = [interruptToken]
  }

  public func handleTranscriptionReady() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.delegate?.micController(self, didProduceTranscription: "")
      self.updateState(.idle)
    }
  }

  public func updateState(_ newState: MicState) {
    currentState = newState
    delegate?.micController(self, didChangeState: newState)
  }

  // MARK: - Foreground Re-Arm with Return Handoff (Responder Chain)

  public func triggerForegroundReactivation(extensionContext: NSExtensionContext?, returnScheme: String?, autoStart: Bool = true) {
    var queryItems: [String] = []
    if let scheme = returnScheme, !scheme.isEmpty {
      queryItems.append("returnScheme=\(scheme)")
      ipc.lastReturnScheme = scheme
    }
    if autoStart {
      queryItems.append("autoStart=1")
    }
    let query = queryItems.isEmpty ? "" : "?\(queryItems.joined(separator: "&"))"

    guard let url = URL(string: "typeeasy://activate\(query)") ?? URL(string: "typevoice://activate\(query)") else { return }

    // Walk UIResponder chain up to UIApplication and call modern 3-argument open
    var responder: UIResponder? = delegate as? UIResponder
    var hops = 0
    while let current = responder, hops < 25 {
      hops += 1
      if let application = current as? UIApplication {
        NSLog("[KeyboardMic] 🚀 Found UIApplication in responder chain (hop %d). Dispatching open(%@)", hops, url.absoluteString)
        DispatchQueue.main.async {
          application.open(url, options: [:]) { success in
            if !success {
              SharedIPCManager.shared.engineStatusText = "ERR:SCHEME"
            }
          }
        }
        return
      }
      responder = current.next
    }

    // Dynamic class lookup fallback if responder chain was severed
    if let appClass = NSClassFromString("UIApplication") as? NSObject.Type,
       let application = appClass.value(forKeyPath: "sharedApplication") as? UIApplication {
      DispatchQueue.main.async {
        application.open(url, options: [:]) { success in
          if !success {
            SharedIPCManager.shared.engineStatusText = "ERR:SCHEME"
          }
        }
      }
      return
    }

    SharedIPCManager.shared.engineStatusText = "ERR:NO_APP"
  }
}

/// Delegate protocol for KeyboardViewController to update UI and insert text.
public protocol KeyboardMicControllerDelegate: AnyObject {
  func micController(_ controller: KeyboardMicController, didChangeState state: KeyboardMicController.MicState)
  func micController(_ controller: KeyboardMicController, didProduceTranscription text: String)
  func micController(_ controller: KeyboardMicController, didRequestStatusMessage message: String)
}
