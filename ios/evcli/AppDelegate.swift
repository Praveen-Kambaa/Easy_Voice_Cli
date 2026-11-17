import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import Speech

#if DEBUG
/// Picks a Metro host the phone can actually reach (USB iproxy → localhost, else Mac LAN IP from ip.txt).
private enum MetroPackagerHost {
  private(set) static var current: String = "localhost"

  static func configure() {
    #if targetEnvironment(simulator)
    current = "localhost"
    #else
    // USB: run `iproxy 8081 8081` so the phone's localhost:8081 forwards to Metro on the Mac.
    if RCTBundleURLProvider.isPackagerRunning("localhost") {
      current = "localhost"
    } else if let ip = readIPFromBundle(), RCTBundleURLProvider.isPackagerRunning(ip) {
      current = ip
    } else if let ip = readIPFromBundle() {
      current = ip
    } else {
      current = "localhost"
    }
    #endif
    RCTBundleURLProvider.sharedSettings().jsLocation = current
  }

  static func debugBundleURL() -> URL? {
    RCTBundleURLProvider.jsBundleURL(
      forBundleRoot: "index",
      packagerHost: current,
      packagerScheme: "http",
      enableDev: true,
      enableMinification: false,
      inlineSourceMap: false,
      modulesOnly: false,
      runModule: true
    )
  }

  private static func readIPFromBundle() -> String? {
    guard let path = Bundle.main.path(forResource: "ip", ofType: "txt"),
          let ip = try? String(contentsOfFile: path, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
          !ip.isEmpty
    else {
      return nil
    }
    return ip
  }
}
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if DEBUG
    MetroPackagerHost.configure()
#endif

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "evcli",
      in: window,
      launchOptions: launchOptions
    )

    KeyboardHostVoiceCoordinator.registerDarwinObservers()

    // Ensure speech recognition permission prompt appears if undetermined
    if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
      SFSpeechRecognizer.requestAuthorization { status in
        NSLog("[TypeEasyApp] 🗣️ Initial Speech authorization: %ld", status.rawValue)
      }
    }

    // Cold-start URL launch from keyboard (e.g. typeeasy://activate)
    if let url = launchOptions?[.url] as? URL {
      NSLog("[TypeEasyApp] 🚀 Cold launch with URL in launchOptions: %@", url.absoluteString)
      _ = self.application(application, open: url, options: [:])
    }

    DispatchQueue.main.async {
      KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
      KeyboardHostVoiceCoordinator.resumePendingSessions()
      BackgroundAudioManager.shared.warmUpIfPermitted()
    }

    return true
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
    KeyboardHostVoiceCoordinator.resumePendingSessions()
    BackgroundAudioManager.shared.ensureActiveBeforeBackground()
    BackgroundAudioManager.shared.warmUpIfPermitted()
  }

  func applicationWillEnterForeground(_ application: UIApplication) {
    KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
    KeyboardHostVoiceCoordinator.resumePendingSessions()
    BackgroundAudioManager.shared.ensureActiveBeforeBackground()
    BackgroundAudioManager.shared.warmUpIfPermitted()
  }

  func applicationWillResignActive(_ application: UIApplication) {
    NSLog("[TypeEasyApp] 📱 applicationWillResignActive (preserving dictation session)")
    BackgroundAudioManager.shared.ensureActiveBeforeBackground()
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    NSLog("[TypeEasyApp] 📱 applicationDidEnterBackground (guaranteeing active background audio keep-alive)")
    BackgroundAudioManager.shared.ensureActiveBeforeBackground()
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    NSLog("[TypeEasyApp] 📥 application:openURL: %@", url.absoluteString)
    guard url.scheme == "typeeasy" || url.scheme == "typevoice" else { return false }
    let host = url.host ?? ""

    if url.scheme == "typevoice" || url.scheme == "typeeasy" {
      if host == "activate" || url.path == "/activate" || url.absoluteString.contains("activate") {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let returnScheme = components?.queryItems?.first(where: { $0.name == "returnScheme" })?.value
          ?? SharedIPCManager.shared.lastReturnScheme
        let autoStartVal = components?.queryItems?.first(where: { $0.name == "autoStart" })?.value
        let autoStart = (autoStartVal == "1" || autoStartVal == "true")

        NSLog("[TypeEasy] 🚀 Received activation request. returnScheme=%@ autoStart=%d", returnScheme ?? "none", autoStart)
        if let returnScheme = returnScheme, !returnScheme.isEmpty {
          SharedIPCManager.shared.lastReturnScheme = returnScheme
        }

        // Guarantee audio session & silent player are active synchronously before returning or moving to background
        BackgroundAudioManager.shared.ensureActiveBeforeBackground()

        DispatchQueue.main.async {
          BackgroundAudioManager.shared.activateAndReturn(returnScheme: returnScheme, autoStart: autoStart)
        }
        return true
      }
    }
    if host == "keyboard-voice" {
      let requestId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?
        .first(where: { $0.name == "requestId" })?
        .value ?? UUID().uuidString
      NSLog("[TypeEasyDictation] [%@] Dictation request received in main app via deep link", requestId)
      KeyboardDictationStore.shared.markAppOpened(requestId: requestId)
      KeyboardDictationService.shared.start(requestId: requestId)
      _ = RCTLinkingManager.application(app, open: url, options: options)
      return true
    }
    if host == "keyboard-voice-command" {
      let requestId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?
        .first(where: { $0.name == "requestId" })?
        .value ?? UUID().uuidString
      NSLog("[TypeEasyApp] ✨ Processing keyboard-voice-command for requestId: %@", requestId)
      KeyboardVoiceCommandService.shared.start(requestId: requestId)
      _ = RCTLinkingManager.application(app, open: url, options: options)
      return true
    }
    KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
    return RCTLinkingManager.application(app, open: url, options: options)
  }
}

/// Forwards app-group pending links when the keyboard could not use `extensionContext.open`.
enum KeyboardHostLinkForwarder {
  static func forwardPendingDeepLinkIfNeeded() {
    guard let action = KeyboardSharedConfig.peekPendingDeepLink() else { return }
    if action.hasPrefix(KeyboardSharedConfig.deepLinkVoiceCommand) {
      let requestId = voiceRequestId(from: action) ?? UUID().uuidString
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      KeyboardVoiceCommandService.shared.start(requestId: requestId)
      return
    }
    if action.hasPrefix(KeyboardSharedConfig.deepLinkVoice) {
      let requestId = voiceRequestId(from: action) ?? UUID().uuidString
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      if !KeyboardDictationService.shared.isActive(requestId: requestId) {
        KeyboardDictationService.shared.start(requestId: requestId)
      }
      return
    }
    guard let consumed = KeyboardSharedConfig.consumePendingDeepLink() else { return }
    guard let url = URL(string: "typeeasy://\(consumed)") else { return }
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      open: url,
      options: [:]
    )
  }

  private static func voiceRequestId(from action: String) -> String? {
    guard let range = action.range(of: "requestId=") else { return nil }
    let value = String(action[range.upperBound...])
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return nil }
    return value.removingPercentEncoding ?? value
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // 1. If Metro packager is active, load live bundle
    if RCTBundleURLProvider.isPackagerRunning(MetroPackagerHost.current) {
      if let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index") {
        return url
      }
    }
    // 2. If an offline/pre-bundled jsbundle is present in the app, fall back to it
    if let embedded = Bundle.main.url(forResource: "main", withExtension: "jsbundle") {
      return embedded
    }
    // 3. Otherwise try standard Metro debug bundle URL
    if let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index") {
      return url
    }
    return MetroPackagerHost.debugBundleURL()
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
