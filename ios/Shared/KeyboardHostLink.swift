import Foundation
import UIKit

/// Opens deep links to the TypeEasy host application using `extensionContext.open(url)`.
enum KeyboardHostLink {
  static func openURL(_ urlString: String, extensionContext: NSExtensionContext?, completion: ((Bool) -> Void)? = nil) {
    guard let url = URL(string: urlString) else {
      NSLog("[TypeEasyKeyboard] ❌ openURL: Invalid URL string: %@", urlString)
      completion?(false)
      return
    }
    NSLog("[TypeEasyKeyboard] 🔗 openURL: Attempting to open URL: %@ (hasExtensionContext: %d)", urlString, extensionContext != nil)
    if let extensionContext = extensionContext {
      extensionContext.open(url) { success in
        NSLog("[TypeEasyKeyboard] 🔗 extensionContext.open returned: %d for URL: %@", success, urlString)
        DispatchQueue.main.async {
          completion?(success)
        }
      }
      return
    }
    NSLog("[TypeEasyKeyboard] ⚠️ openURL: extensionContext is nil!")
    completion?(false)
  }

  static func openSettings(extensionContext: NSExtensionContext?, completion: ((Bool) -> Void)? = nil) {
    KeyboardSharedConfig.setPendingDeepLink(KeyboardSharedConfig.deepLinkSettings)
    openURL("typeeasy://\(KeyboardSharedConfig.deepLinkSettings)", extensionContext: extensionContext, completion: completion)
  }

  static func openVoiceCommand(requestId: String, extensionContext: NSExtensionContext?, completion: ((Bool) -> Void)? = nil) {
    let action = "\(KeyboardSharedConfig.deepLinkVoiceCommand)?requestId=\(requestId)"
    KeyboardSharedConfig.setPendingDeepLink(action)
    openURL("typeeasy://\(KeyboardSharedConfig.deepLinkVoiceCommand)?requestId=\(requestId)", extensionContext: extensionContext, completion: completion)
  }

  static func openVoice(requestId: String, extensionContext: NSExtensionContext?, completion: ((Bool) -> Void)? = nil) {
    let action = "\(KeyboardSharedConfig.deepLinkVoice)?requestId=\(requestId)"
    KeyboardSharedConfig.setPendingDeepLink(action)
    NSLog("[TypeEasyKeyboard] 🎙️ openVoice: set pending link: %@", action)
    openURL("typeeasy://keyboard-voice?requestId=\(requestId)", extensionContext: extensionContext, completion: completion)
  }
}
