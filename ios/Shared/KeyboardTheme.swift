import UIKit

/// Shared Type Easy keyboard colors & styles (native Apple iOS system palette).
enum KeyboardTheme {
  private static var isDark = false

  static func setDarkMode(_ dark: Bool) {
    isDark = dark
  }

  static var isDarkMode: Bool {
    isDark
  }

  // Completely transparent keyboard backdrop: allows keyboard to blend seamlessly with zero background layer
  static var keyboardBackground: UIColor {
    .clear
  }

  static var toolbarBackground: UIColor {
    .clear
  }

  static var toolbarText: UIColor {
    isDark
      ? UIColor(red: 0xF1 / 255.0, green: 0xF5 / 255.0, blue: 0xF9 / 255.0, alpha: 1)
      : UIColor(red: 0x1E / 255.0, green: 0x29 / 255.0, blue: 0x3B / 255.0, alpha: 1)
  }

  // iOS System Blue
  static var primary: UIColor {
    UIColor(red: 0x00 / 255.0, green: 0x7A / 255.0, blue: 0xFF / 255.0, alpha: 1)
  }

  // Key letter background: Pure white on light, #6D6D72 on dark
  static var keyLetterBackground: UIColor {
    isDark
      ? UIColor(red: 0x6D / 255.0, green: 0x6D / 255.0, blue: 0x72 / 255.0, alpha: 1)
      : .white
  }

  // Action key background: #ACB0B8 on light, #48484A on dark
  static var keyActionBackground: UIColor {
    isDark
      ? UIColor(red: 0x48 / 255.0, green: 0x48 / 255.0, blue: 0x4A / 255.0, alpha: 1)
      : UIColor(red: 0xAC / 255.0, green: 0xB0 / 255.0, blue: 0xB8 / 255.0, alpha: 1)
  }

  static var keyText: UIColor {
    isDark ? .white : .black
  }

  static var suggestionBackground: UIColor {
    .clear
  }

  static var suggestionDivider: UIColor {
    isDark
      ? UIColor(red: 0x3E / 255.0, green: 0x3E / 255.0, blue: 0x40 / 255.0, alpha: 1)
      : UIColor(red: 0xBF / 255.0, green: 0xC3 / 255.0, blue: 0xCC / 255.0, alpha: 1)
  }

  static var hintText: UIColor {
    isDark
      ? UIColor(red: 0x98 / 255.0, green: 0x98 / 255.0, blue: 0x9E / 255.0, alpha: 1)
      : UIColor(red: 0x8E / 255.0, green: 0x8E / 255.0, blue: 0x93 / 255.0, alpha: 1)
  }

  static var keyShadowColor: UIColor {
    isDark
      ? UIColor(red: 0x14 / 255.0, green: 0x14 / 255.0, blue: 0x14 / 255.0, alpha: 1)
      : UIColor.black
  }

  static var keyShadowOpacity: Float {
    isDark ? 0.5 : 0.35
  }

  static var popupBackground: UIColor {
    isDark
      ? UIColor(red: 0x3A / 255.0, green: 0x3A / 255.0, blue: 0x3C / 255.0, alpha: 1)
      : .white
  }

  static var popupStroke: UIColor {
    isDark
      ? UIColor(red: 0x46 / 255.0, green: 0x46 / 255.0, blue: 0x48 / 255.0, alpha: 1)
      : UIColor(red: 0xCC / 255.0, green: 0xCF / 255.0, blue: 0xD6 / 255.0, alpha: 1)
  }

  static var voiceBarBackground: UIColor {
    keyboardBackground
  }

  static let translateIcon = "文A"
  static let grammarIcon = "A~"
  static let settingsIcon = "⚙"

  /// Pill behind the active toolbar control.
  static var toolbarSelectedBackground: UIColor {
    primary
  }

  static var toolbarSelectedForeground: UIColor {
    .white
  }

  static var micRed: UIColor {
    UIColor(red: 0xFF / 255.0, green: 0x3B / 255.0, blue: 0x30 / 255.0, alpha: 1)
  }

  static var micRecordingRed: UIColor {
    UIColor(red: 0xDC / 255.0, green: 0x26 / 255.0, blue: 0x26 / 255.0, alpha: 1)
  }

  enum ToolbarButtonKind {
    case text
    case mic
    case voiceCommand
    case settings
  }

  static func styleToolbarButton(_ button: UIButton, selected: Bool, kind: ToolbarButtonKind) {
    if kind == .mic {
      updateMicButton(button, isRecording: selected)
      return
    }

    let defaultBg = isDark
      ? UIColor(red: 0x3A / 255.0, green: 0x3A / 255.0, blue: 0x3C / 255.0, alpha: 1)
      : .white

    if selected {
      button.backgroundColor = primary
      if kind == .settings {
        button.tintColor = .white
      }
    } else {
      button.backgroundColor = defaultBg
      if kind == .settings {
        button.tintColor = keyText
      }
    }
  }

  static func toolbarPillButton(icon: String, title: String, iconColor: UIColor = primary) -> UIButton {
    let button = UIButton(type: .system)
    let fullText = "\(icon) \(title)"
    let attributed = NSMutableAttributedString(
      string: fullText,
      attributes: [
        .font: UIFont.systemFont(ofSize: 12.0, weight: .semibold),
        .foregroundColor: keyText
      ]
    )
    if let range = fullText.range(of: icon) {
      let nsRange = NSRange(range, in: fullText)
      attributed.addAttribute(.foregroundColor, value: iconColor, range: nsRange)
      attributed.addAttribute(.font, value: UIFont.systemFont(ofSize: 12.5, weight: .bold), range: nsRange)
    }
    button.setAttributedTitle(attributed, for: .normal)
    button.titleLabel?.adjustsFontSizeToFitWidth = true
    button.titleLabel?.minimumScaleFactor = 0.85
    button.backgroundColor = isDark
      ? UIColor(red: 0x3A / 255.0, green: 0x3A / 255.0, blue: 0x3C / 255.0, alpha: 1)
      : .white
    button.layer.borderColor = isDark
      ? UIColor(white: 1.0, alpha: 0.12).cgColor
      : UIColor(white: 0.0, alpha: 0.06).cgColor
    button.layer.borderWidth = 0.5
    button.layer.cornerRadius = 8.5
    button.layer.shadowColor = UIColor.black.cgColor
    button.layer.shadowOffset = CGSize(width: 0, height: 1)
    button.layer.shadowOpacity = isDark ? 0.3 : 0.10
    button.layer.shadowRadius = 1
    button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 7, bottom: 0, right: 7)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.heightAnchor.constraint(equalToConstant: 32).isActive = true
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
    return button
  }

  static func toolbarRightMicButton() -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .bold)
    let image = UIImage(systemName: "mic.fill", withConfiguration: config)
    button.setImage(image, for: .normal)
    button.tintColor = .white
    button.backgroundColor = micRed
    button.layer.cornerRadius = 17
    button.layer.shadowColor = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 0.4).cgColor
    button.layer.shadowOffset = CGSize(width: 0, height: 2)
    button.layer.shadowOpacity = 0.5
    button.layer.shadowRadius = 2
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(equalToConstant: 34).isActive = true
    button.heightAnchor.constraint(equalToConstant: 34).isActive = true
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
    button.accessibilityLabel = "Voice dictation"
    return button
  }

  static func toolbarCenterMicButton() -> UIButton {
    return toolbarRightMicButton()
  }

  static func updateMicButton(_ button: UIButton, isRecording: Bool) {
    let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .bold)
    if isRecording {
      button.setImage(UIImage(systemName: "stop.fill", withConfiguration: config), for: .normal)
      button.backgroundColor = micRecordingRed
    } else {
      button.setImage(UIImage(systemName: "mic.fill", withConfiguration: config), for: .normal)
      button.backgroundColor = micRed
    }
  }

  static func toolbarSettingsButton() -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
    let image = UIImage(systemName: "gearshape", withConfiguration: config)
    button.setImage(image, for: .normal)
    button.tintColor = keyText
    button.backgroundColor = isDark
      ? UIColor(red: 0x3A / 255.0, green: 0x3A / 255.0, blue: 0x3C / 255.0, alpha: 1)
      : .white
    button.layer.borderColor = isDark
      ? UIColor(white: 1.0, alpha: 0.12).cgColor
      : UIColor(white: 0.0, alpha: 0.06).cgColor
    button.layer.borderWidth = 0.5
    button.layer.cornerRadius = 8.5
    button.layer.shadowColor = UIColor.black.cgColor
    button.layer.shadowOffset = CGSize(width: 0, height: 1)
    button.layer.shadowOpacity = isDark ? 0.3 : 0.10
    button.layer.shadowRadius = 1
    button.accessibilityLabel = "Settings"
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(equalToConstant: 32).isActive = true
    button.heightAnchor.constraint(equalToConstant: 32).isActive = true
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
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
    return toolbarPillButton(icon: "✨", title: "Ask AI")
  }

  static func toolbarMicButton() -> UIButton {
    return toolbarCenterMicButton()
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
