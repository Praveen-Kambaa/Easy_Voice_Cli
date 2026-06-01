import Foundation

/// Starts keyboard-requested voice sessions in the main app.
enum KeyboardHostVoiceCoordinator {
  private static var observerHolder: ObserverHolder?

  static func resumePendingSessions() {
    // Keyboard extension records in-process; do not start host services in parallel.
    if KeyboardSharedConfig.extensionOwnsMic() {
      return
    }

    let pendingLink = KeyboardSharedConfig.peekPendingDeepLink() ?? ""

    let dictation = KeyboardDictationStore.shared.snapshot()
    if pendingLink.hasPrefix(KeyboardSharedConfig.deepLinkVoice),
       dictation.state == .pending,
       !dictation.requestId.isEmpty {
      KeyboardDictationService.shared.start(requestId: dictation.requestId)
    }

    let command = KeyboardVoiceCommandStore.shared.snapshot()
    if pendingLink.hasPrefix(KeyboardSharedConfig.deepLinkVoiceCommand),
       command.state == .pending,
       !command.requestId.isEmpty {
      KeyboardVoiceCommandService.shared.start(requestId: command.requestId)
    }
  }

  static func registerDarwinObservers() {
    let holder = ObserverHolder(onWake: { resumePendingSessions() })
    observerHolder = holder
    let observer = Unmanaged.passUnretained(holder).toOpaque()
    let center = CFNotificationCenterGetDarwinNotifyCenter()

    let callback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer else { return }
      let holder = Unmanaged<ObserverHolder>.fromOpaque(observer).takeUnretainedValue()
      DispatchQueue.main.async {
        holder.onWake()
      }
    }

    CFNotificationCenterAddObserver(
      center, observer, callback, KeyboardSharedNotifications.dictationName, nil, .deliverImmediately
    )
    CFNotificationCenterAddObserver(
      center, observer, callback, KeyboardSharedNotifications.commandName, nil, .deliverImmediately
    )
  }

  private final class ObserverHolder: NSObject {
    let onWake: () -> Void
    init(onWake: @escaping () -> Void) {
      self.onWake = onWake
    }
  }
}
