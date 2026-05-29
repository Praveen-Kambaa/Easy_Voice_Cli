import Foundation

/// Language list for the keyboard settings panel (mirrors Android `MyKeyboardService`).
enum KeyboardLanguages {
  static let all: [(code: String, name: String)] = [
    ("en", "English"), ("ta", "Tamil"), ("hi", "Hindi"), ("fr", "French"),
    ("de", "German"), ("es", "Spanish"), ("ar", "Arabic"), ("zh", "Chinese"),
    ("ja", "Japanese"), ("ko", "Korean"), ("ru", "Russian"), ("pt", "Portuguese"),
    ("it", "Italian"), ("bn", "Bengali"), ("te", "Telugu"), ("ml", "Malayalam"),
    ("kn", "Kannada"), ("mr", "Marathi"),
  ]

  static func shortLabel(for code: String) -> String {
    let c = code.lowercased()
    if c == "en" { return "EN" }
    return c.prefix(1).uppercased() + c.dropFirst()
  }

  static func displayName(for code: String) -> String {
    all.first(where: { $0.code == code.lowercased() })?.name ?? code.uppercased()
  }
}
