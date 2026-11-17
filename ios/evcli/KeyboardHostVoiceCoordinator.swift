import Foundation

/// Starts keyboard-requested voice sessions in the main app.
enum KeyboardHostVoiceCoordinator {
  private static var observerHolder: ObserverHolder?

  static func resumePendingSessions() {
    let pendingLink = KeyboardSharedConfig.peekPendingDeepLink() ?? ""

    let dictation = KeyboardDictationStore.shared.snapshot()
    let isDictationPending = (dictation.state == .requested || dictation.state == .appOpened || dictation.state == .recording || dictation.state == .pending || dictation.state == .listening) && !dictation.requestId.isEmpty
    let isDeepLinkVoice = pendingLink.hasPrefix(KeyboardSharedConfig.deepLinkVoice)
    var dictationRequestId = dictation.requestId
    if dictationRequestId.isEmpty, let query = URLComponents(string: "typeeasy://\(pendingLink)")?.queryItems {
      dictationRequestId = query.first(where: { $0.name == "requestId" })?.value ?? ""
    }
    if (isDictationPending || isDeepLinkVoice), !dictationRequestId.isEmpty {
      if !KeyboardDictationService.shared.isActive(requestId: dictationRequestId) {
        KeyboardDictationService.shared.start(requestId: dictationRequestId)
      }
    }

    let command = KeyboardVoiceCommandStore.shared.snapshot()
    let isCommandPending = (command.state == .pending || command.state == .recording) && !command.requestId.isEmpty
    let isDeepLinkCommand = pendingLink.hasPrefix(KeyboardSharedConfig.deepLinkVoiceCommand)
    if (isCommandPending || isDeepLinkCommand), !command.requestId.isEmpty {
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
