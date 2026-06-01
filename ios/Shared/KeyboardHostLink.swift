import Foundation

/// Opens the containing Type Easy app from the keyboard extension.
enum KeyboardHostLink {
  private static let schemeCandidates = [
    "typeeasy://keyboard-settings",
    "typeeasy://",
  ]

  static func openSettings(extensionContext: NSExtensionContext?, completion: @escaping (Bool) -> Void) {
    KeyboardSharedConfig.setPendingDeepLink(KeyboardSharedConfig.deepLinkSettings)
    openFirstMatchingURL(extensionContext: extensionContext, completion: completion)
  }

  static func openVoiceCommand(requestId: String, extensionContext: NSExtensionContext?, completion: @escaping (Bool) -> Void) {
    let action = "\(KeyboardSharedConfig.deepLinkVoiceCommand)?requestId=\(requestId)"
    KeyboardSharedConfig.setPendingDeepLink(action)
    let encoded = requestId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? requestId
    let candidates = [
      "typeeasy://keyboard-voice-command?requestId=\(encoded)",
      "typeeasy://\(action)",
      "typeeasy://",
    ]
    guard let extensionContext else {
      completion(false)
      return
    }
    let urls = candidates.compactMap { URL(string: $0) }
    tryOpen(urls: urls, index: 0, extensionContext: extensionContext, completion: completion)
  }

  static func openVoice(requestId: String, extensionContext: NSExtensionContext?, completion: @escaping (Bool) -> Void) {
    KeyboardSharedConfig.setPendingDeepLink("\(KeyboardSharedConfig.deepLinkVoice)?requestId=\(requestId)")
    let encoded = requestId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? requestId
    let action = "\(KeyboardSharedConfig.deepLinkVoice)?requestId=\(requestId)"
    let voiceCandidates = [
      "typeeasy://keyboard-voice?requestId=\(encoded)",
      "typeeasy://\(action)",
      "typeeasy://",
    ]
    guard let extensionContext else {
      completion(false)
      return
    }
    let urls = voiceCandidates.compactMap { URL(string: $0) }
    tryOpen(urls: urls, index: 0, extensionContext: extensionContext, completion: completion)
  }

  private static func openFirstMatchingURL(extensionContext: NSExtensionContext?, completion: @escaping (Bool) -> Void) {
    guard let extensionContext else {
      completion(false)
      return
    }
    let urls = schemeCandidates.compactMap { URL(string: $0) }
    tryOpen(urls: urls, index: 0, extensionContext: extensionContext, completion: completion)
  }

  private static func tryOpen(
    urls: [URL],
    index: Int,
    extensionContext: NSExtensionContext,
    completion: @escaping (Bool) -> Void
  ) {
    guard index < urls.count else {
      completion(false)
      return
    }
    openURL(urls[index], extensionContext: extensionContext) { opened in
      if opened {
        completion(true)
      } else {
        tryOpen(urls: urls, index: index + 1, extensionContext: extensionContext, completion: completion)
      }
    }
  }

  private static func openURL(
    _ url: URL,
    extensionContext: NSExtensionContext?,
    completion: @escaping (Bool) -> Void
  ) {
    guard let extensionContext else {
      completion(false)
      return
    }
    DispatchQueue.main.async {
      extensionContext.open(url, completionHandler: completion)
    }
  }
}
