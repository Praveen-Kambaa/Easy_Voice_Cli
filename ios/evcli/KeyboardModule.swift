import Foundation
import UIKit

/// iOS native module for Type Easy Keyboard settings.
///
/// On iOS, third-party keyboards are enabled via:
///   Settings → General → Keyboard → Keyboards → Add New Keyboard
/// There is no public API to open the system keyboard picker programmatically,
/// so we deep-link to the app's own Settings page (which is the closest iOS allows).
@objc(KeyboardModule)
class KeyboardModule: NSObject {

  /// Opens the app's entry in iOS Settings so the user can enable the keyboard extension.
  /// (Settings → General → Keyboard → Keyboards → Add New Keyboard → Type Easy)
  @objc
  func openKeyboardSettings() {
    DispatchQueue.main.async {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
  }

  /// On iOS there is no programmatic keyboard picker.
  /// We open Settings so the user can switch keyboards from there.
  @objc
  func showKeyboardPicker() {
    DispatchQueue.main.async {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
  }

  @objc
  func syncKeyboardSettings(
    _ userId: String?,
    fromLang: String?,
    toLang: String?,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    KeyboardSharedConfig.sync(
      userId: userId ?? "",
      fromLang: fromLang ?? "en",
      toLang: toLang ?? "ta"
    )
    resolve(true)
  }

  @objc
  func peekPendingDeepLink(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(KeyboardSharedConfig.peekPendingDeepLink() as Any? ?? NSNull())
  }

  @objc
  func consumePendingDeepLink(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(KeyboardSharedConfig.consumePendingDeepLink() as Any? ?? NSNull())
  }

  @objc
  func forwardPendingKeyboardLink(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
      KeyboardHostVoiceCoordinator.resumePendingSessions()
      resolve(true)
    }
  }

  @objc
  func warmUpVoiceEngine(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      BackgroundAudioManager.shared.warmUpIfPermitted()
      resolve(true)
    }
  }

  @objc
  func getKeyboardSettings(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(KeyboardSharedConfig.snapshot())
  }

  @objc
  func isKeyboardEnabled(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      resolve(self.checkIsKeyboardEnabled())
    }
  }

  @objc
  func isKeyboardSelected(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      resolve(self.checkIsKeyboardEnabled())
    }
  }

  @objc
  func setKeyboardEnabled(
    _ enabled: Bool,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let d = KeyboardSharedConfig.defaults()
    d.set(enabled, forKey: KeyboardSharedConfig.keyKeyboardActive)
    if enabled {
      d.set(Date().timeIntervalSince1970, forKey: KeyboardSharedConfig.keyKeyboardLastActiveTime)
    }
    d.synchronize()
    resolve(enabled)
  }

  // MARK: - Voice Dictation Bridge (App Group)

  @objc
  func getPendingVoiceRequest(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let snap = KeyboardDictationStore.shared.snapshot()
    let pendingLink = KeyboardSharedConfig.peekPendingDeepLink() ?? ""
    let isPending = (snap.state == .requested || snap.state == .recording || snap.state == .appOpened) && !snap.requestId.isEmpty
    let hasVoiceLink = pendingLink.hasPrefix(KeyboardSharedConfig.deepLinkVoice)
    NSLog("[TypeEasyModule] 🔍 getPendingVoiceRequest: isPending=%d, hasVoiceLink=%d, requestId=%@, state=%@", isPending, hasVoiceLink, snap.requestId, snap.state.rawValue)

    if isPending || hasVoiceLink {
      resolve([
        "hasPending": true,
        "requestId": snap.requestId,
        "state": snap.state.rawValue,
        "partialText": snap.partialText,
        "finalText": snap.finalText
      ])
    } else {
      resolve(["hasPending": false])
    }
  }

  @objc
  func startDictationSession(
    _ requestId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      let id = (requestId != nil && !requestId!.isEmpty) ? requestId! : UUID().uuidString
      NSLog("[TypeEasyModule] 🎙️ startDictationSession for requestId: %@", id)
      if KeyboardDictationService.shared.isActive(requestId: id) {
        NSLog("[TypeEasyModule] ℹ️ Dictation session %@ already active and running.", id)
        resolve(true)
        return
      }
      KeyboardDictationStore.shared.markAppOpened(requestId: id)
      KeyboardDictationService.shared.start(requestId: id)
      resolve(true)
    }
  }

  @objc
  func pauseDictationSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      KeyboardDictationService.shared.pause()
      resolve(true)
    }
  }

  @objc
  func resumeDictationSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      KeyboardDictationService.shared.resume()
      resolve(true)
    }
  }

  @objc
  func stopDictationSession(
    _ finalText: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      KeyboardDictationService.shared.stop(finalText: finalText)
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      resolve(true)
    }
  }

  @objc
  func cancelDictationSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      KeyboardDictationService.shared.cancel()
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      resolve(true)
    }
  }

  @objc
  func getDictationSnapshot(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let snap = KeyboardDictationStore.shared.snapshot()
    resolve([
      "requestId": snap.requestId,
      "state": snap.state.rawValue,
      "partialText": snap.partialText,
      "finalText": snap.finalText,
      "error": snap.error,
      "consumed": snap.consumed,
      "timestamp": snap.timestamp
    ])
  }

  private func checkIsKeyboardEnabled() -> Bool {
    // 1. Check shared App Group flag set when keyboard extension runs or was marked active
    if KeyboardSharedConfig.isKeyboardActive() {
      return true
    }

    // 2. Check App Group defaults directly
    let groupDefaults = KeyboardSharedConfig.defaults()
    if groupDefaults.bool(forKey: KeyboardSharedConfig.keyKeyboardActive) {
      return true
    }

    // 3. Check AppleKeyboards in UserDefaults
    if let keyboards = UserDefaults.standard.object(forKey: "AppleKeyboards") as? [String] {
      for kb in keyboards {
        let lower = kb.lowercased()
        if lower.contains("com.type.easy") || lower.contains("typeeasy") || lower.contains("type_easy") || lower.contains("type easy") {
          return true
        }
      }
    }

    // 4. Check activeInputModes
    let inputModes = UITextInputMode.activeInputModes
    let idSel = NSSelectorFromString("identifier")
    let normSel = NSSelectorFromString("normalizedIdentifier")
    let extSel = NSSelectorFromString("extension")

    for mode in inputModes {
      let desc = String(describing: mode).lowercased()
      if desc.contains("com.type.easy") || desc.contains("typeeasy") || desc.contains("type_easy") || desc.contains("type easy") {
        return true
      }

      if mode.responds(to: idSel), let id = mode.value(forKey: "identifier") as? String {
        let lower = id.lowercased()
        if lower.contains("com.type.easy") || lower.contains("typeeasy") || lower.contains("type_easy") || lower.contains("type easy") {
          return true
        }
      }

      if mode.responds(to: normSel), let norm = mode.value(forKey: "normalizedIdentifier") as? String {
        let lower = norm.lowercased()
        if lower.contains("com.type.easy") || lower.contains("typeeasy") || lower.contains("type_easy") || lower.contains("type easy") {
          return true
        }
      }

      if mode.responds(to: extSel), let ext = mode.value(forKey: "extension") as? NSObject {
        let extDesc = String(describing: ext).lowercased()
        if extDesc.contains("com.type.easy") || extDesc.contains("typeeasy") || extDesc.contains("type easy") {
          return true
        }
        if ext.responds(to: idSel), let extId = ext.value(forKey: "identifier") as? String {
          let lower = extId.lowercased()
          if lower.contains("com.type.easy") || lower.contains("typeeasy") || lower.contains("type easy") {
            return true
          }
        }
      }

      if let lang = mode.primaryLanguage?.lowercased() {
        if lang.contains("typeeasy") || lang.contains("com.type.easy") {
          return true
        }
      }
    }

    return false
  }

  /// Required by React Native — marks methods as available on the main queue.
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
