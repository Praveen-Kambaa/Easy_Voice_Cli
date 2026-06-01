import Foundation

/// Darwin notifications from the keyboard extension to the containing app (works while app is running).
enum KeyboardSharedNotifications {
  static let dictationName = "com.type.easy.keyboard.voice.dictation" as CFString
  static let commandName = "com.type.easy.keyboard.voice.command" as CFString

  static func postDictationStart() {
    post(dictationName)
  }

  static func postVoiceCommandStart() {
    post(commandName)
  }

  private static func post(_ name: CFString) {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(name),
      nil,
      nil,
      true
    )
  }
}
