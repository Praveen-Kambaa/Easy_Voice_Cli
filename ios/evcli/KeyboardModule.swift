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
  func getKeyboardSettings(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(KeyboardSharedConfig.snapshot())
  }

  @objc
  func isKeyboardEnabled(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    // iOS does not expose a public API to inspect enabled third-party keyboards.
    resolve(false)
  }

  @objc
  func isKeyboardSelected(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    // iOS does not expose a public API for the current active keyboard.
    resolve(false)
  }

  /// Required by React Native — marks methods as available on the main queue.
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
