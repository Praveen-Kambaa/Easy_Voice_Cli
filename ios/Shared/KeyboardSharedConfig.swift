import Foundation

enum KeyboardSharedConfig {
  static let appGroupIdentifier = "group.org.reactjs.native.example.evcli"
  static let standardSuite = "TypeEasyKeyboard"

  static let keyUserId = "user_id"
  static let keyFromLang = "from_lang"
  static let keyToLang = "to_lang"

  static func defaults() -> UserDefaults {
    if let shared = UserDefaults(suiteName: appGroupIdentifier) {
      return shared
    }
    return UserDefaults.standard
  }

  static func sync(userId: String, fromLang: String, toLang: String) {
    let d = defaults()
    d.set(userId.trimmingCharacters(in: .whitespacesAndNewlines), forKey: keyUserId)
    d.set(fromLang.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "en" : fromLang, forKey: keyFromLang)
    d.set(toLang.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "ta" : toLang, forKey: keyToLang)
    d.synchronize()
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
