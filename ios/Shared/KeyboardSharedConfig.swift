import Foundation

enum KeyboardSharedConfig {
  static let appGroupIdentifier = "group.com.type.easy"
  static let standardSuite = "TypeEasyKeyboard"

  static let keyUserId = "user_id"
  static let keyFromLang = "from_lang"
  static let keyToLang = "to_lang"
  static let keyPendingDeepLink = "pending_deep_link"

  /// Deep link action when the keyboard could not call `extensionContext.open` (e.g. keyboard-settings).
  static let deepLinkSettings = "keyboard-settings"
  static let deepLinkVoice = "keyboard-voice"

  static func defaults() -> UserDefaults {
    if let shared = UserDefaults(suiteName: appGroupIdentifier) {
      return shared
    }
    return UserDefaults.standard
  }

  static func sync(userId: String, fromLang: String, toLang: String) {
    let d = defaults()
    d.set(userId.trimmingCharacters(in: .whitespacesAndNewlines), forKey: keyUserId)
    setLanguages(from: fromLang, to: toLang)
    d.synchronize()
  }

  static func setLanguages(from fromLang: String, to toLang: String) {
    let d = defaults()
    let from = fromLang.trimmingCharacters(in: .whitespacesAndNewlines)
    let to = toLang.trimmingCharacters(in: .whitespacesAndNewlines)
    d.set(from.isEmpty ? "en" : from, forKey: keyFromLang)
    d.set(to.isEmpty ? "ta" : to, forKey: keyToLang)
    d.synchronize()
  }

  static func userId() -> String {
    (defaults().string(forKey: keyUserId) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func hasUserId() -> Bool {
    let id = userId()
    return !id.isEmpty && id != "0" && id.lowercased() != "undefined"
  }

  static func fromLang() -> String {
    let v = (defaults().string(forKey: keyFromLang) ?? "en").trimmingCharacters(in: .whitespacesAndNewlines)
    return v.isEmpty ? "en" : v
  }

  static func toLang() -> String {
    let v = (defaults().string(forKey: keyToLang) ?? "ta").trimmingCharacters(in: .whitespacesAndNewlines)
    return v.isEmpty ? "ta" : v
  }

  static func setPendingDeepLink(_ action: String) {
    let d = defaults()
    d.set(action, forKey: keyPendingDeepLink)
    d.synchronize()
  }

  /// Returns and clears a pending action, if any.
  static func consumePendingDeepLink() -> String? {
    let d = defaults()
    let action = d.string(forKey: keyPendingDeepLink)?.trimmingCharacters(in: .whitespacesAndNewlines)
    d.removeObject(forKey: keyPendingDeepLink)
    d.synchronize()
    guard let action, !action.isEmpty else { return nil }
    return action
  }

  static func snapshot() -> [String: Any] {
    let d = defaults()
    let hasFromLang = d.object(forKey: keyFromLang) != nil
    let hasToLang = d.object(forKey: keyToLang) != nil
    return [
      "userId": (d.string(forKey: keyUserId) ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
      "fromLang": (d.string(forKey: keyFromLang) ?? "en").trimmingCharacters(in: .whitespacesAndNewlines),
      "toLang": (d.string(forKey: keyToLang) ?? "ta").trimmingCharacters(in: .whitespacesAndNewlines),
      "hasFromLang": hasFromLang,
      "hasToLang": hasToLang,
    ]
  }
}
