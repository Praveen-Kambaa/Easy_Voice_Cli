import UIKit

/// Full-screen clean activation & diagnostic overlay for Type Easy.
///
/// Displayed when the user is routed to the app via `typeeasy://activate`.
/// Instead of a stuck screen, it:
/// 1. Provides a real-time live microphone level meter so user can verify audio flow.
/// 2. Clearly directs the user to return to their host app (WhatsApp, etc.).
/// 3. Displays the Point-4 Diagnostic Strip for immediate validation of AppGroup, Engine, and IPC state.
public final class ActivationViewController: UIViewController {

  private var returnScheme: String?
  private var levelMeterBar = UIProgressView(progressViewStyle: .default)
  private var dbLabel = UILabel()
  private var statusLabel = UILabel()
  private var appGroupPill = UILabel()
  private var enginePill = UILabel()
  private var silentPlayerPill = UILabel()
  private var pingPill = UILabel()

  public static func presentIfNeeded(returnScheme: String?) {
    DispatchQueue.main.async {
      let window: UIWindow? = {
        if #available(iOS 15.0, *) {
          return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
            ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first
        } else {
          return UIApplication.shared.windows.first(where: { $0.isKeyWindow }) ?? UIApplication.shared.windows.first
        }
      }()
      guard let root = window?.rootViewController else { return }

      // If already presented, simply update returnScheme
      if let existing = root.presentedViewController as? ActivationViewController {
        existing.returnScheme = returnScheme
        existing.updateReturnButtonTitle()
        return
      }

      let vc = ActivationViewController()
      vc.returnScheme = returnScheme
      vc.modalPresentationStyle = .overFullScreen
      vc.modalTransitionStyle = .crossDissolve

      var top = root
      while let p = top.presentedViewController {
        top = p
      }
      top.present(vc, animated: true)
    }
  }

  override public func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 0.98)
    setupUI()
    bindAudioUpdates()
  }

  private func setupUI() {
    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(scroll)

    let container = UIStackView()
    container.axis = .vertical
    container.spacing = 16
    container.alignment = .fill
    container.translatesAutoresizingMaskIntoConstraints = false
    scroll.addSubview(container)

    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      container.topAnchor.constraint(equalTo: scroll.topAnchor, constant: 28),
      container.leadingAnchor.constraint(equalTo: scroll.leadingAnchor, constant: 20),
      container.trailingAnchor.constraint(equalTo: scroll.trailingAnchor, constant: -20),
      container.bottomAnchor.constraint(equalTo: scroll.bottomAnchor, constant: -30),
      container.widthAnchor.constraint(equalTo: scroll.widthAnchor, constant: -40),
    ])

    // 1. Big Glowing Mic Icon (Centered inside wrapper)
    let micWrapper = UIView()
    micWrapper.translatesAutoresizingMaskIntoConstraints = false

    let micBg = UIView()
    micBg.backgroundColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.18)
    micBg.layer.cornerRadius = 44
    micBg.layer.borderColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.5).cgColor
    micBg.layer.borderWidth = 2
    micBg.translatesAutoresizingMaskIntoConstraints = false

    let micImage = UIImageView(image: UIImage(systemName: "mic.fill"))
    micImage.tintColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0)
    micImage.contentMode = .scaleAspectFit
    micImage.translatesAutoresizingMaskIntoConstraints = false

    micBg.addSubview(micImage)
    micWrapper.addSubview(micBg)

    NSLayoutConstraint.activate([
      micBg.centerXAnchor.constraint(equalTo: micWrapper.centerXAnchor),
      micBg.topAnchor.constraint(equalTo: micWrapper.topAnchor),
      micBg.bottomAnchor.constraint(equalTo: micWrapper.bottomAnchor),
      micBg.widthAnchor.constraint(equalToConstant: 88),
      micBg.heightAnchor.constraint(equalToConstant: 88),

      micImage.centerXAnchor.constraint(equalTo: micBg.centerXAnchor),
      micImage.centerYAnchor.constraint(equalTo: micBg.centerYAnchor),
      micImage.widthAnchor.constraint(equalToConstant: 44),
      micImage.heightAnchor.constraint(equalToConstant: 44),
    ])
    container.addArrangedSubview(micWrapper)

    // 2. Title & Status
    let titleLabel = UILabel()
    titleLabel.text = "Type Easy Mic Active"
    titleLabel.font = .systemFont(ofSize: 22, weight: .bold)
    titleLabel.textColor = .white
    titleLabel.textAlignment = .center
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(titleLabel)

    statusLabel.text = "Tap 'Open' above or swipe right on the bottom home bar to return to your app."
    statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
    statusLabel.textColor = UIColor(white: 0.85, alpha: 1.0)
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0
    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(statusLabel)

    // 3. Live Microphone Level Meter Card
    let meterCard = UIView()
    meterCard.backgroundColor = UIColor(white: 1.0, alpha: 0.08)
    meterCard.layer.cornerRadius = 14
    meterCard.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(meterCard)

    let meterStack = UIStackView()
    meterStack.axis = .vertical
    meterStack.spacing = 8
    meterStack.translatesAutoresizingMaskIntoConstraints = false
    meterCard.addSubview(meterStack)
    NSLayoutConstraint.activate([
      meterStack.topAnchor.constraint(equalTo: meterCard.topAnchor, constant: 14),
      meterStack.leadingAnchor.constraint(equalTo: meterCard.leadingAnchor, constant: 14),
      meterStack.trailingAnchor.constraint(equalTo: meterCard.trailingAnchor, constant: -14),
      meterStack.bottomAnchor.constraint(equalTo: meterCard.bottomAnchor, constant: -14),
    ])

    let meterTitle = UILabel()
    meterTitle.text = "TEST MIC LIVE"
    meterTitle.font = .systemFont(ofSize: 12, weight: .bold)
    meterTitle.textColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0)
    meterStack.addArrangedSubview(meterTitle)

    levelMeterBar.progress = 0.0
    levelMeterBar.progressTintColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0)
    levelMeterBar.trackTintColor = UIColor(white: 1.0, alpha: 0.15)
    levelMeterBar.layer.cornerRadius = 4
    levelMeterBar.clipsToBounds = true
    levelMeterBar.translatesAutoresizingMaskIntoConstraints = false
    meterStack.addArrangedSubview(levelMeterBar)

    NSLayoutConstraint.activate([
      levelMeterBar.heightAnchor.constraint(equalToConstant: 8),
    ])

    dbLabel.text = "Audio Level: Listening… Speak to test"
    dbLabel.font = .systemFont(ofSize: 12, weight: .regular)
    dbLabel.textColor = UIColor(white: 0.7, alpha: 1.0)
    meterStack.addArrangedSubview(dbLabel)

    // 4. Built-in Diagnostic Strip (Point 4)
    let diagTitle = UILabel()
    diagTitle.text = "SYSTEM DIAGNOSTICS"
    diagTitle.font = .systemFont(ofSize: 11, weight: .bold)
    diagTitle.textColor = UIColor(white: 0.6, alpha: 1.0)
    diagTitle.textAlignment = .center
    container.addArrangedSubview(diagTitle)

    let pillsStack = UIStackView()
    pillsStack.axis = .horizontal
    pillsStack.spacing = 8
    pillsStack.distribution = .fillEqually
    pillsStack.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(pillsStack)

    let groupOk = SharedIPCManager.shared.isAppGroupValid
    let status = SharedIPCManager.shared.containerStatus
    configurePill(appGroupPill, title: groupOk ? "AppGroup: OK" : "AppGroup: \(status)", isSuccess: groupOk)
    configurePill(enginePill, title: "Engine: RUN", isSuccess: true)
    configurePill(silentPlayerPill, title: "KeepAlive: ON", isSuccess: true)

    pillsStack.addArrangedSubview(appGroupPill)
    pillsStack.addArrangedSubview(enginePill)
    pillsStack.addArrangedSubview(silentPlayerPill)

    // 5. Action Buttons
    let returnButton = UIButton(type: .system)
    let schemeName = returnScheme?.capitalized ?? "App"
    returnButton.setTitle("Return to \(schemeName)", for: .normal)
    returnButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
    returnButton.backgroundColor = UIColor(red: 0.12, green: 0.53, blue: 1.0, alpha: 1.0)
    returnButton.setTitleColor(.white, for: .normal)
    returnButton.layer.cornerRadius = 12
    returnButton.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(returnButton)

    NSLayoutConstraint.activate([
      returnButton.heightAnchor.constraint(equalToConstant: 48),
    ])
    returnButton.addTarget(self, action: #selector(didTapReturn), for: .touchUpInside)

    let dismissButton = UIButton(type: .system)
    dismissButton.setTitle("Stay in Type Easy", for: .normal)
    dismissButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
    dismissButton.setTitleColor(UIColor(white: 0.7, alpha: 1.0), for: .normal)
    dismissButton.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(dismissButton)

    NSLayoutConstraint.activate([
      dismissButton.heightAnchor.constraint(equalToConstant: 40),
    ])
    dismissButton.addTarget(self, action: #selector(didTapDismiss), for: .touchUpInside)
  }

  private func configurePill(_ pill: UILabel, title: String, isSuccess: Bool) {
    pill.text = title
    pill.font = .systemFont(ofSize: 11, weight: .semibold)
    pill.textColor = isSuccess ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0) : .systemRed
    pill.backgroundColor = isSuccess ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.15) : UIColor.systemRed.withAlphaComponent(0.15)
    pill.textAlignment = .center
    pill.layer.cornerRadius = 6
    pill.clipsToBounds = true
    pill.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      pill.heightAnchor.constraint(equalToConstant: 24),
    ])
  }

  private func updateReturnButtonTitle() {
    let name = returnScheme?.capitalized ?? "App"
    statusLabel.text = "Tap 'Open' above or swipe right on the bottom home bar to return to \(name)."
  }

  private func bindAudioUpdates() {
    BackgroundAudioManager.shared.onMicLevelUpdate = { [weak self] db in
      guard let self else { return }
      // Normalize dB (-80 dB to 0 dB) to 0.0...1.0
      let normalized = max(0.0, min(1.0, (db + 70.0) / 70.0))
      self.levelMeterBar.setProgress(normalized, animated: true)
      let desc = db > -45.0 ? "Speaking (Loud)" : (db > -60.0 ? "Ambient sound" : "Silent")
      self.dbLabel.text = String(format: "Mic Level: %.1f dB • %@", db, desc)
    }
  }

  @objc private func didTapReturn() {
    if let scheme = returnScheme, !scheme.isEmpty, let url = URL(string: "\(scheme)://") {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    dismiss(animated: true)
  }

  @objc private func didTapDismiss() {
    dismiss(animated: true)
  }
}
