import UIKit

/// Shared Type Easy keyboard colors (mirrors Android `KeyboardTheme.kt` light/dark palettes).
enum KeyboardTheme {
  private static var isDark = false

  static func setDarkMode(_ dark: Bool) {
    isDark = dark
  }

  static var toolbarBackground: UIColor {
    isDark
      ? UIColor(red: 0x1A / 255.0, green: 0x22 / 255.0, blue: 0x2D / 255.0, alpha: 1)
      : UIColor(red: 0x1E / 255.0, green: 0x88 / 255.0, blue: 0xFF / 255.0, alpha: 1)
  }
  static var toolbarText: UIColor {
    isDark
      ? UIColor(red: 0xF1 / 255.0, green: 0xF5 / 255.0, blue: 0xF9 / 255.0, alpha: 1)
      : .white
  }
  static var primary: UIColor { UIColor(red: 0x1E / 255.0, green: 0x88 / 255.0, blue: 0xFF / 255.0, alpha: 1) }
  static var keyboardBackground: UIColor {
    isDark
      ? UIColor(red: 0x12 / 255.0, green: 0x18 / 255.0, blue: 0x20 / 255.0, alpha: 1)
      : UIColor(red: 0xE8 / 255.0, green: 0xEA / 255.0, blue: 0xF6 / 255.0, alpha: 1)
  }
  static var keyLetterBackground: UIColor {
    isDark ? UIColor(red: 0x1A / 255.0, green: 0x22 / 255.0, blue: 0x2D / 255.0, alpha: 1) : .white
  }
  static var keyActionBackground: UIColor {
    isDark
      ? UIColor(red: 0x2A / 255.0, green: 0x34 / 255.0, blue: 0x41 / 255.0, alpha: 1)
      : UIColor(red: 0xC5 / 255.0, green: 0xCA / 255.0, blue: 0xE9 / 255.0, alpha: 1)
  }
  static var keyText: UIColor {
    isDark
      ? UIColor(red: 0xF1 / 255.0, green: 0xF5 / 255.0, blue: 0xF9 / 255.0, alpha: 1)
      : UIColor(red: 0x21 / 255.0, green: 0x21 / 255.0, blue: 0x21 / 255.0, alpha: 1)
  }
  static var suggestionBackground: UIColor {
    isDark
      ? UIColor(red: 0x12 / 255.0, green: 0x18 / 255.0, blue: 0x20 / 255.0, alpha: 1)
      : UIColor(red: 0xD1 / 255.0, green: 0xD9 / 255.0, blue: 0xE6 / 255.0, alpha: 1)
  }
  static var suggestionDivider: UIColor {
    isDark
      ? UIColor(red: 0x2A / 255.0, green: 0x34 / 255.0, blue: 0x41 / 255.0, alpha: 1)
      : UIColor(red: 0x9C / 255.0, green: 0xA3 / 255.0, blue: 0xAF / 255.0, alpha: 1)
  }
  static var hintText: UIColor {
    isDark
      ? UIColor(red: 0x64 / 255.0, green: 0x74 / 255.0, blue: 0x8B / 255.0, alpha: 1)
      : UIColor(red: 0x75 / 255.0, green: 0x75 / 255.0, blue: 0x75 / 255.0, alpha: 1)
  }
  static var popupBackground: UIColor {
    isDark
      ? UIColor(red: 0x1A / 255.0, green: 0x22 / 255.0, blue: 0x2D / 255.0, alpha: 1)
      : .white
  }
  static var popupStroke: UIColor {
    isDark
      ? UIColor(red: 0x2A / 255.0, green: 0x34 / 255.0, blue: 0x41 / 255.0, alpha: 1)
      : UIColor(red: 0xE5 / 255.0, green: 0xE7 / 255.0, blue: 0xEB / 255.0, alpha: 1)
  }
  static var voiceBarBackground: UIColor {
    isDark
      ? UIColor(red: 0x1A / 255.0, green: 0x22 / 255.0, blue: 0x2D / 255.0, alpha: 1)
      : UIColor(red: 0xEE / 255.0, green: 0xF2 / 255.0, blue: 0xF7 / 255.0, alpha: 1)
  }

  static let translateIcon = "文A"
  static let grammarIcon = "A✓"
  static let settingsIcon = "⚙"

  /// Pill behind the active toolbar control (mirrors Android / design: white circle on blue bar).
  static var toolbarSelectedBackground: UIColor {
    isDark
      ? UIColor(red: 0x2A / 255.0, green: 0x34 / 255.0, blue: 0x41 / 255.0, alpha: 1)
      : .white
  }

  static var toolbarSelectedForeground: UIColor {
    isDark ? toolbarText : primary
  }

  enum ToolbarButtonKind {
    case text
    case mic
    case voiceCommand
    case settings
  }

  static func styleToolbarButton(_ button: UIButton, selected: Bool, kind: ToolbarButtonKind) {
    button.layer.cornerRadius = selected ? 10 : 0
    button.layer.masksToBounds = true
    if selected {
      button.backgroundColor = toolbarSelectedBackground
      switch kind {
      case .text:
        button.setTitleColor(toolbarSelectedForeground, for: .normal)
      case .mic, .settings:
        button.tintColor = toolbarSelectedForeground
      case .voiceCommand:
        button.tintColor = UIColor(red: 0x00 / 255.0, green: 0xCE / 255.0, blue: 0x68 / 255.0, alpha: 1)
      }
    } else {
      button.backgroundColor = .clear
      switch kind {
      case .text:
        button.setTitleColor(toolbarText, for: .normal)
      case .mic, .settings:
        button.tintColor = toolbarText
      case .voiceCommand:
        button.tintColor = UIColor(red: 0x00 / 255.0, green: 0xCE / 255.0, blue: 0x68 / 255.0, alpha: 1)
      }
    }
  }

  static func toolbarSettingsButton() -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .bold)
    let image = UIImage(systemName: "gearshape.fill", withConfiguration: config)
    button.setImage(image, for: .normal)
    button.tintColor = toolbarText
    button.backgroundColor = .clear
    button.accessibilityLabel = "Settings"
    return button
  }

  static func toolbarTextButton(title: String) -> UIButton {
    let button = UIButton(type: .system)
    button.setTitle(title, for: .normal)
    button.setTitleColor(toolbarText, for: .normal)
    button.titleLabel?.font = .boldSystemFont(ofSize: 17)
    button.backgroundColor = .clear
    return button
  }

  static func toolbarVoiceCommandButton() -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
    let image = UIImage(systemName: "bubble.left.and.bubble.right.fill", withConfiguration: config)
    button.setImage(image, for: .normal)
    button.tintColor = UIColor(red: 0x00 / 255.0, green: 0xCE / 255.0, blue: 0x68 / 255.0, alpha: 1)
    button.backgroundColor = .clear
    button.accessibilityLabel = "Voice command"
    return button
  }

  static func toolbarMicButton() -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .bold)
    let image = UIImage(systemName: "mic.fill", withConfiguration: config)
    button.setImage(image, for: .normal)
    button.tintColor = toolbarText
    button.backgroundColor = .clear
    return button
  }

  static func voiceBarMicView() -> UIImageView {
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .bold)
    let image = UIImage(systemName: "mic.fill", withConfiguration: config)
    let view = UIImageView(image: image)
    view.tintColor = primary
    view.contentMode = .scaleAspectFit
    return view
  }
}
