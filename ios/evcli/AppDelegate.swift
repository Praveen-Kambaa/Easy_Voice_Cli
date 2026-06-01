import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

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

    DispatchQueue.main.async {
      KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
      KeyboardHostVoiceCoordinator.resumePendingSessions()
    }

    return true
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
    KeyboardHostVoiceCoordinator.resumePendingSessions()
  }

  func applicationWillEnterForeground(_ application: UIApplication) {
    KeyboardHostLinkForwarder.forwardPendingDeepLinkIfNeeded()
    KeyboardHostVoiceCoordinator.resumePendingSessions()
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    guard url.scheme == "typeeasy" else { return false }
    let host = url.host ?? ""
    if host == "keyboard-voice" {
      let requestId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?
        .first(where: { $0.name == "requestId" })?
        .value ?? UUID().uuidString
      KeyboardDictationService.shared.start(requestId: requestId)
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      KeyboardHostVoiceCoordinator.resumePendingSessions()
      return true
    }
    if host == "keyboard-voice-command" {
      let requestId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?
        .first(where: { $0.name == "requestId" })?
        .value ?? UUID().uuidString
      KeyboardVoiceCommandService.shared.start(requestId: requestId)
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      KeyboardHostVoiceCoordinator.resumePendingSessions()
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
      KeyboardHostVoiceCoordinator.resumePendingSessions()
      return
    }
    if action.hasPrefix(KeyboardSharedConfig.deepLinkVoice) {
      let requestId = voiceRequestId(from: action) ?? UUID().uuidString
      _ = KeyboardSharedConfig.consumePendingDeepLink()
      KeyboardDictationService.shared.start(requestId: requestId)
      KeyboardHostVoiceCoordinator.resumePendingSessions()
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
    if let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index") {
      return url
    }
    return MetroPackagerHost.debugBundleURL()
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
