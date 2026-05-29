import UIKit

/// Shared Type Easy keyboard colors and toolbar icon styling (mirrors Android `MyKeyboardService`).
enum KeyboardTheme {
  static let toolbarBackground = UIColor(red: 0x1E / 255.0, green: 0x88 / 255.0, blue: 0xFF / 255.0, alpha: 1)
  static let toolbarText = UIColor.white
  static let primary = toolbarBackground
  static let keyboardBackground = UIColor(red: 0xE8 / 255.0, green: 0xEA / 255.0, blue: 0xF6 / 255.0, alpha: 1)
  static let keyLetterBackground = UIColor.white
  static let keyActionBackground = UIColor(red: 0xC5 / 255.0, green: 0xCA / 255.0, blue: 0xE9 / 255.0, alpha: 1)
  static let keyText = UIColor(red: 0x21 / 255.0, green: 0x21 / 255.0, blue: 0x21 / 255.0, alpha: 1)

  static let translateIcon = "文A"
  static let grammarIcon = "A✓"
  static let settingsIcon = "⚙"

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
