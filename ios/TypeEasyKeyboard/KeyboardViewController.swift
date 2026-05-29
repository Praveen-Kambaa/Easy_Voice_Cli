import UIKit
import Speech
import AVFoundation

/// Type Easy custom keyboard extension — toolbar + QWERTY layout (mirrors Android `MyKeyboardService`).
class KeyboardViewController: UIInputViewController {

  private let toolbar = UIStackView()
  private let keysStack = UIStackView()
  private let voiceBar = UIStackView()
  private let voiceStatusLabel = UILabel()
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine = AVAudioEngine()
  private var isListening = false
  private var isShifted = false

  private let alphaRows: [[String]] = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"],
    ["?123", "/", "😊", "space", ".", "↵"],
  ]

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = KeyboardTheme.keyboardBackground
    setupToolbar()
    setupVoiceBar()
    setupKeys()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    stopVoice()
  }

  private func setupToolbar() {
    toolbar.axis = .horizontal
    toolbar.alignment = .center
    toolbar.spacing = 4
    toolbar.backgroundColor = KeyboardTheme.toolbarBackground
    toolbar.layoutMargins = UIEdgeInsets(top: 4, left: 8, bottom: 4, right: 8)
    toolbar.isLayoutMarginsRelativeArrangement = true
    toolbar.translatesAutoresizingMaskIntoConstraints = false

    let translateBtn = KeyboardTheme.toolbarTextButton(title: KeyboardTheme.translateIcon)
    translateBtn.addTarget(self, action: #selector(onTranslate), for: .touchUpInside)

    let grammarBtn = KeyboardTheme.toolbarTextButton(title: KeyboardTheme.grammarIcon)
    grammarBtn.addTarget(self, action: #selector(onGrammar), for: .touchUpInside)

    let micBtn = KeyboardTheme.toolbarMicButton()
    micBtn.addTarget(self, action: #selector(onVoice), for: .touchUpInside)

    let settingsBtn = KeyboardTheme.toolbarTextButton(title: KeyboardTheme.settingsIcon)
    settingsBtn.addTarget(self, action: #selector(openHostAppSettings), for: .touchUpInside)

    [translateBtn, grammarBtn, micBtn, UIView(), settingsBtn].forEach { item in
      if let button = item as? UIButton {
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
          button.widthAnchor.constraint(equalToConstant: 48),
          button.heightAnchor.constraint(equalToConstant: 38),
        ])
      }
      toolbar.addArrangedSubview(item)
    }

    view.addSubview(toolbar)
    NSLayoutConstraint.activate([
      toolbar.topAnchor.constraint(equalTo: view.topAnchor),
      toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      toolbar.heightAnchor.constraint(equalToConstant: 46),
    ])
  }

  private func setupVoiceBar() {
    voiceBar.axis = .horizontal
    voiceBar.alignment = .center
    voiceBar.spacing = 8
    voiceBar.backgroundColor = KeyboardTheme.keyboardBackground
    voiceBar.isHidden = true
    voiceBar.translatesAutoresizingMaskIntoConstraints = false
    voiceBar.layoutMargins = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
    voiceBar.isLayoutMarginsRelativeArrangement = true

    let micView = KeyboardTheme.voiceBarMicView()
    micView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      micView.widthAnchor.constraint(equalToConstant: 24),
      micView.heightAnchor.constraint(equalToConstant: 24),
    ])

    voiceStatusLabel.text = "Listening…"
    voiceStatusLabel.font = .boldSystemFont(ofSize: 14)
    voiceStatusLabel.textColor = KeyboardTheme.primary

    let stopBtn = UIButton(type: .system)
    stopBtn.setTitle("■", for: .normal)
    stopBtn.setTitleColor(UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1), for: .normal)
    stopBtn.titleLabel?.font = .systemFont(ofSize: 20)
    stopBtn.addTarget(self, action: #selector(stopVoice), for: .touchUpInside)

    voiceBar.addArrangedSubview(micView)
    voiceBar.addArrangedSubview(voiceStatusLabel)
    voiceBar.addArrangedSubview(UIView())
    voiceBar.addArrangedSubview(stopBtn)

    view.addSubview(voiceBar)
    NSLayoutConstraint.activate([
      voiceBar.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
      voiceBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      voiceBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      voiceBar.heightAnchor.constraint(equalToConstant: 46),
    ])
  }

  private func setupKeys() {
    keysStack.axis = .vertical
    keysStack.spacing = 4
    keysStack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(keysStack)

    NSLayoutConstraint.activate([
      keysStack.topAnchor.constraint(equalTo: voiceBar.bottomAnchor, constant: 4),
      keysStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
      keysStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
      keysStack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -6),
    ])

    renderKeys()
  }

  private func renderKeys() {
    keysStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    alphaRows.forEach { row in
      let rowStack = UIStackView()
      rowStack.axis = .horizontal
      rowStack.spacing = 4
      rowStack.distribution = .fillEqually
      row.forEach { key in
        rowStack.addArrangedSubview(makeKeyButton(title: key))
      }
      keysStack.addArrangedSubview(rowStack)
    }
  }

  private func makeKeyButton(title: String) -> UIButton {
    let button = UIButton(type: .system)
    let display: String
    switch title {
    case "space":
      display = "space"
    default:
      display = (isShifted && title.count == 1 && title.first?.isLetter == true)
        ? title.uppercased()
        : title
    }

    button.setTitle(display, for: .normal)
    button.setTitleColor(KeyboardTheme.keyText, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: title == "space" ? 13 : 18)
    button.backgroundColor = actionKeys.contains(title) ? KeyboardTheme.keyActionBackground : KeyboardTheme.keyLetterBackground
    button.layer.cornerRadius = 8
    button.heightAnchor.constraint(equalToConstant: 44).isActive = true
    button.addAction(UIAction { [weak self] _ in
      self?.handleKey(title)
    }, for: .touchUpInside)
    return button
  }

  private let actionKeys: Set<String> = ["⇧", "⌫", "?123", "/", "😊", ".", "↵"]

  private func handleKey(_ key: String) {
    guard let proxy = textDocumentProxy as UITextDocumentProxy? else { return }
    switch key {
    case "space":
      proxy.insertText(" ")
      if isShifted { isShifted = false; renderKeys() }
    case "⌫":
      proxy.deleteBackward()
    case "↵":
      proxy.insertText("\n")
    case "⇧":
      isShifted.toggle()
      renderKeys()
    default:
      let out = (isShifted && key.count == 1 && key.first?.isLetter == true) ? key.uppercased() : key
      if out.count == 1 || out == "space" {
        proxy.insertText(out == "space" ? " " : out)
        if isShifted && key.count == 1 && key.first?.isLetter == true {
          isShifted = false
          renderKeys()
        }
      }
    }
  }

  @objc private func onTranslate() {
    showNeedsHostApp("Translate")
  }

  @objc private func onGrammar() {
    showNeedsHostApp("Grammar")
  }

  @objc private func onVoice() {
    if isListening {
      stopVoice()
      return
    }
    startVoice()
  }

  @objc private func openHostAppSettings() {
    if let url = URL(string: "typeeasy://keyboard-settings") {
      extensionContext?.open(url, completionHandler: nil)
    }
  }

  private func showNeedsHostApp(_ feature: String) {
    voiceStatusLabel.text = "Open Type Easy app for \(feature)."
    voiceBar.isHidden = false
  }

  private func startVoice() {
    SFSpeechRecognizer.requestAuthorization { [weak self] status in
      DispatchQueue.main.async {
        guard status == .authorized else {
          self?.voiceStatusLabel.text = "Speech permission required."
          self?.voiceBar.isHidden = false
          return
        }
        self?.beginRecognition()
      }
    }
  }

  private func beginRecognition() {
    stopVoice()
    speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      voiceStatusLabel.text = "Speech recognition unavailable."
      voiceBar.isHidden = false
      return
    }

    do {
      recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
      guard let recognitionRequest else { return }
      recognitionRequest.shouldReportPartialResults = true

      let inputNode = audioEngine.inputNode
      recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
        guard let self else { return }
        if let result {
          DispatchQueue.main.async {
            self.voiceStatusLabel.text = result.bestTranscription.formattedString
          }
          if result.isFinal {
            let text = result.bestTranscription.formattedString
            DispatchQueue.main.async {
              self.textDocumentProxy.insertText(text + " ")
              self.stopVoice()
            }
          }
        }
        if error != nil {
          DispatchQueue.main.async { self.stopVoice() }
        }
      }

      let format = inputNode.outputFormat(forBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        recognitionRequest.append(buffer)
      }
      audioEngine.prepare()
      try audioEngine.start()
      isListening = true
      voiceBar.isHidden = false
      voiceStatusLabel.text = "Listening…"
    } catch {
      voiceStatusLabel.text = "Could not start voice input."
      voiceBar.isHidden = false
    }
  }

  @objc private func stopVoice() {
    if audioEngine.isRunning {
      audioEngine.stop()
      audioEngine.inputNode.removeTap(onBus: 0)
    }
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionRequest = nil
    recognitionTask = nil
    isListening = false
    voiceBar.isHidden = true
  }
}
