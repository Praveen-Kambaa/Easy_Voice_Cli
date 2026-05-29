import UIKit

/// Type Easy custom keyboard extension — toolbar + QWERTY layout (mirrors Android `MyKeyboardService`).
class KeyboardViewController: UIInputViewController {

  private let toolbar = UIStackView()
  private let keysStack = UIStackView()
  private let voiceBar = UIStackView()
  private let voiceStatusLabel = UILabel()
  private let voiceStopButton = UIButton(type: .system)
  private let resultBar = UIStackView()
  private let resultLabel = UILabel()
  private let resultInsertButton = UIButton(type: .system)
  private var isShifted = false
  private var isWaitingForDictation = false
  private var activeDictationRequestId: String?
  private var dictationPollTimer: Timer?
  private var pendingReplaceSelected = false
  private var pendingReplaceBeforeChars = 0
  private var lastResultIsError = false
  private var activeApiTask: Task<Void, Never>?

  private let panelsStack = UIStackView()
  private let settingsPanel = UIStackView()
  private let emojiPanel = UIView()
  private let fromLangButton = UIButton(type: .system)
  private let toLangButton = UIButton(type: .system)
  private var emojiGridStack = UIStackView()
  private var emojiTabButtons: [UIButton] = []
  private var fromLang = "en"
  private var toLang = "ta"
  private var isEmojiMode = false
  private var isSettingsVisible = false
  private let languagePickerContainer = UIView()
  private let languageTableView = UITableView(frame: .zero, style: .plain)
  private var languagePickerHeightConstraint: NSLayoutConstraint?
  private var languagePickerIsFrom = true
  private var isLanguagePickerVisible = false

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
    setupPanelsStack()
    setupSettingsPanel()
    setupVoiceBar()
    setupResultBar()
    setupEmojiPanel()
    setupKeys()
    reloadLanguagesFromSharedConfig()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reloadLanguagesFromSharedConfig()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    stopVoice()
  }

  deinit {
    dictationPollTimer?.invalidate()
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

    let settingsBtn = KeyboardTheme.toolbarSettingsButton()
    settingsBtn.addTarget(self, action: #selector(toggleSettings), for: .touchUpInside)
    settingsBtn.setContentCompressionResistancePriority(.required, for: .horizontal)

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

  private func setupPanelsStack() {
    panelsStack.axis = .vertical
    panelsStack.spacing = 0
    panelsStack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(panelsStack)
    NSLayoutConstraint.activate([
      panelsStack.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
      panelsStack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      panelsStack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
  }

  private func setupSettingsPanel() {
    settingsPanel.axis = .vertical
    settingsPanel.spacing = 0
    settingsPanel.backgroundColor = KeyboardTheme.keyboardBackground
    settingsPanel.isHidden = true
    settingsPanel.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
    settingsPanel.isLayoutMarginsRelativeArrangement = true

    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 8
    row.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([row.heightAnchor.constraint(equalToConstant: 44)])

    let label = UILabel()
    label.text = "Translation :"
    label.font = .boldSystemFont(ofSize: 14)
    label.textColor = UIColor(red: 0x75 / 255.0, green: 0x75 / 255.0, blue: 0x75 / 255.0, alpha: 1)
    label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

    styleLanguagePill(fromLangButton)
    fromLangButton.addTarget(self, action: #selector(pickFromLanguage), for: .touchUpInside)

    let swapBtn = UIButton(type: .system)
    swapBtn.setTitle("⇄", for: .normal)
    swapBtn.titleLabel?.font = .systemFont(ofSize: 18, weight: .bold)
    swapBtn.tintColor = KeyboardTheme.primary
    swapBtn.backgroundColor = .white
    swapBtn.layer.cornerRadius = 17
    swapBtn.layer.borderWidth = 1
    swapBtn.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    swapBtn.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      swapBtn.widthAnchor.constraint(equalToConstant: 36),
      swapBtn.heightAnchor.constraint(equalToConstant: 34),
    ])
    swapBtn.addTarget(self, action: #selector(swapLanguages), for: .touchUpInside)

    styleLanguagePill(toLangButton)
    toLangButton.addTarget(self, action: #selector(pickToLanguage), for: .touchUpInside)

    row.addArrangedSubview(label)
    row.addArrangedSubview(fromLangButton)
    row.addArrangedSubview(swapBtn)
    row.addArrangedSubview(toLangButton)
    settingsPanel.addArrangedSubview(row)

    languagePickerContainer.isHidden = true
    languagePickerContainer.translatesAutoresizingMaskIntoConstraints = false
    languagePickerContainer.backgroundColor = .white
    languagePickerContainer.layer.cornerRadius = 8
    languagePickerContainer.layer.borderWidth = 1
    languagePickerContainer.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    languagePickerContainer.clipsToBounds = true

    languageTableView.dataSource = self
    languageTableView.delegate = self
    languageTableView.rowHeight = 44
    languageTableView.separatorInset = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
    languageTableView.register(UITableViewCell.self, forCellReuseIdentifier: "LanguageCell")
    languageTableView.translatesAutoresizingMaskIntoConstraints = false
    languagePickerContainer.addSubview(languageTableView)
    languagePickerHeightConstraint = languagePickerContainer.heightAnchor.constraint(equalToConstant: 0)
    NSLayoutConstraint.activate([
      languagePickerHeightConstraint!,
      languageTableView.topAnchor.constraint(equalTo: languagePickerContainer.topAnchor),
      languageTableView.leadingAnchor.constraint(equalTo: languagePickerContainer.leadingAnchor),
      languageTableView.trailingAnchor.constraint(equalTo: languagePickerContainer.trailingAnchor),
      languageTableView.bottomAnchor.constraint(equalTo: languagePickerContainer.bottomAnchor),
    ])
    settingsPanel.addArrangedSubview(languagePickerContainer)
    panelsStack.addArrangedSubview(settingsPanel)
  }

  private func styleLanguagePill(_ button: UIButton) {
    button.titleLabel?.font = .boldSystemFont(ofSize: 13)
    button.setTitleColor(KeyboardTheme.keyText, for: .normal)
    button.backgroundColor = .white
    button.layer.cornerRadius = 18
    button.layer.borderWidth = 1
    button.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    button.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      button.widthAnchor.constraint(equalToConstant: 92),
      button.heightAnchor.constraint(equalToConstant: 34),
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
    voiceStatusLabel.numberOfLines = 1
    voiceStatusLabel.lineBreakMode = .byTruncatingTail
    voiceStatusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    voiceStatusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)

    voiceStopButton.setTitle("■", for: .normal)
    voiceStopButton.setTitleColor(UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1), for: .normal)
    voiceStopButton.titleLabel?.font = .systemFont(ofSize: 20, weight: .bold)
    voiceStopButton.addTarget(self, action: #selector(stopVoice), for: .touchUpInside)
    voiceStopButton.isHidden = true
    voiceStopButton.translatesAutoresizingMaskIntoConstraints = false
    voiceStopButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    voiceStopButton.setContentHuggingPriority(.required, for: .horizontal)
    NSLayoutConstraint.activate([
      voiceStopButton.widthAnchor.constraint(equalToConstant: 44),
      voiceStopButton.heightAnchor.constraint(equalToConstant: 44),
    ])

    voiceBar.addArrangedSubview(micView)
    voiceBar.addArrangedSubview(voiceStatusLabel)
    voiceBar.addArrangedSubview(voiceStopButton)

    NSLayoutConstraint.activate([voiceBar.heightAnchor.constraint(equalToConstant: 52)])
    panelsStack.addArrangedSubview(voiceBar)
  }

  private func setupResultBar() {
    resultBar.axis = .horizontal
    resultBar.alignment = .center
    resultBar.spacing = 8
    resultBar.backgroundColor = KeyboardTheme.keyboardBackground
    resultBar.isHidden = true
    resultBar.translatesAutoresizingMaskIntoConstraints = false
    resultBar.layoutMargins = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 8)
    resultBar.isLayoutMarginsRelativeArrangement = true

    resultLabel.font = .systemFont(ofSize: 14)
    resultLabel.textColor = KeyboardTheme.keyText
    resultLabel.numberOfLines = 2

    resultInsertButton.setTitle("Insert", for: .normal)
    resultInsertButton.setTitleColor(.white, for: .normal)
    resultInsertButton.titleLabel?.font = .boldSystemFont(ofSize: 13)
    resultInsertButton.backgroundColor = KeyboardTheme.primary
    resultInsertButton.layer.cornerRadius = 8
    resultInsertButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    resultInsertButton.addTarget(self, action: #selector(insertResult), for: .touchUpInside)
    resultInsertButton.isHidden = true

    let dismissBtn = UIButton(type: .system)
    dismissBtn.setTitle("✕", for: .normal)
    dismissBtn.setTitleColor(KeyboardTheme.keyText, for: .normal)
    dismissBtn.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    dismissBtn.addTarget(self, action: #selector(hideResult), for: .touchUpInside)

    resultBar.addArrangedSubview(resultLabel)
    resultBar.addArrangedSubview(resultInsertButton)
    resultBar.addArrangedSubview(dismissBtn)

    NSLayoutConstraint.activate([resultBar.heightAnchor.constraint(equalToConstant: 46)])
    panelsStack.addArrangedSubview(resultBar)
  }

  private func setupEmojiPanel() {
    emojiPanel.backgroundColor = KeyboardTheme.keyboardBackground
    emojiPanel.isHidden = true
    emojiPanel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(emojiPanel)

    let tabScroll = UIScrollView()
    tabScroll.showsHorizontalScrollIndicator = false
    tabScroll.backgroundColor = KeyboardTheme.keyActionBackground
    tabScroll.translatesAutoresizingMaskIntoConstraints = false

    let tabRow = UIStackView()
    tabRow.axis = .horizontal
    tabRow.spacing = 0
    tabRow.translatesAutoresizingMaskIntoConstraints = false
    tabScroll.addSubview(tabRow)

    let gridScroll = UIScrollView()
    gridScroll.translatesAutoresizingMaskIntoConstraints = false
    gridScroll.backgroundColor = KeyboardTheme.keyboardBackground

    emojiGridStack.axis = .vertical
    emojiGridStack.spacing = 4
    emojiGridStack.translatesAutoresizingMaskIntoConstraints = false
    gridScroll.addSubview(emojiGridStack)

    let bottomRow = UIStackView()
    bottomRow.axis = .horizontal
    bottomRow.alignment = .center
    bottomRow.backgroundColor = KeyboardTheme.keyActionBackground
    bottomRow.layoutMargins = UIEdgeInsets(top: 0, left: 8, bottom: 0, right: 8)
    bottomRow.isLayoutMarginsRelativeArrangement = true
    bottomRow.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([bottomRow.heightAnchor.constraint(equalToConstant: 40)])

    let keyboardBackBtn = UIButton(type: .system)
    keyboardBackBtn.setTitle("⌨  Keyboard", for: .normal)
    keyboardBackBtn.titleLabel?.font = .boldSystemFont(ofSize: 13)
    keyboardBackBtn.tintColor = KeyboardTheme.keyText
    keyboardBackBtn.addTarget(self, action: #selector(hideEmojiPanel), for: .touchUpInside)

    let backspaceBtn = UIButton(type: .system)
    backspaceBtn.setTitle("⌫", for: .normal)
    backspaceBtn.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    backspaceBtn.tintColor = KeyboardTheme.keyText
    backspaceBtn.addTarget(self, action: #selector(emojiBackspace), for: .touchUpInside)

    bottomRow.addArrangedSubview(keyboardBackBtn)
    bottomRow.addArrangedSubview(UIView())
    bottomRow.addArrangedSubview(backspaceBtn)

    emojiPanel.addSubview(tabScroll)
    emojiPanel.addSubview(gridScroll)
    emojiPanel.addSubview(bottomRow)

    NSLayoutConstraint.activate([
      emojiPanel.topAnchor.constraint(equalTo: panelsStack.bottomAnchor, constant: 4),
      emojiPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
      emojiPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
      emojiPanel.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -6),

      tabScroll.topAnchor.constraint(equalTo: emojiPanel.topAnchor),
      tabScroll.leadingAnchor.constraint(equalTo: emojiPanel.leadingAnchor),
      tabScroll.trailingAnchor.constraint(equalTo: emojiPanel.trailingAnchor),
      tabScroll.heightAnchor.constraint(equalToConstant: 40),

      tabRow.topAnchor.constraint(equalTo: tabScroll.topAnchor),
      tabRow.bottomAnchor.constraint(equalTo: tabScroll.bottomAnchor),
      tabRow.leadingAnchor.constraint(equalTo: tabScroll.leadingAnchor),
      tabRow.trailingAnchor.constraint(equalTo: tabScroll.trailingAnchor),
      tabRow.heightAnchor.constraint(equalTo: tabScroll.heightAnchor),

      gridScroll.topAnchor.constraint(equalTo: tabScroll.bottomAnchor),
      gridScroll.leadingAnchor.constraint(equalTo: emojiPanel.leadingAnchor),
      gridScroll.trailingAnchor.constraint(equalTo: emojiPanel.trailingAnchor),
      gridScroll.bottomAnchor.constraint(equalTo: bottomRow.topAnchor),

      emojiGridStack.topAnchor.constraint(equalTo: gridScroll.topAnchor, constant: 4),
      emojiGridStack.leadingAnchor.constraint(equalTo: gridScroll.leadingAnchor, constant: 4),
      emojiGridStack.trailingAnchor.constraint(equalTo: gridScroll.trailingAnchor, constant: -4),
      emojiGridStack.bottomAnchor.constraint(equalTo: gridScroll.bottomAnchor, constant: -4),
      emojiGridStack.widthAnchor.constraint(equalTo: gridScroll.widthAnchor, constant: -8),

      bottomRow.leadingAnchor.constraint(equalTo: emojiPanel.leadingAnchor),
      bottomRow.trailingAnchor.constraint(equalTo: emojiPanel.trailingAnchor),
      bottomRow.bottomAnchor.constraint(equalTo: emojiPanel.bottomAnchor),
    ])

    emojiTabButtons = KeyboardEmojiData.categories.enumerated().map { index, category in
      let btn = UIButton(type: .system)
      btn.setTitle(category.tab, for: .normal)
      btn.titleLabel?.font = .systemFont(ofSize: 20)
      btn.tintColor = KeyboardTheme.keyText
      btn.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        btn.widthAnchor.constraint(equalToConstant: 44),
        btn.heightAnchor.constraint(equalToConstant: 40),
      ])
      btn.tag = index
      btn.addTarget(self, action: #selector(emojiTabTapped(_:)), for: .touchUpInside)
      tabRow.addArrangedSubview(btn)
      return btn
    }
  }

  private func setupKeys() {
    keysStack.axis = .vertical
    keysStack.spacing = 4
    keysStack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(keysStack)

    NSLayoutConstraint.activate([
      keysStack.topAnchor.constraint(equalTo: panelsStack.bottomAnchor, constant: 4),
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
    case "😊":
      showEmojiPanel()
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
    runKeyboardFeature(.translate)
  }

  @objc private func onGrammar() {
    runKeyboardFeature(.grammar)
  }

  private enum KeyboardFeature {
    case translate
    case grammar
  }

  private func runKeyboardFeature(_ feature: KeyboardFeature) {
    hideResult()
    hideEmojiPanel()
    guard hasFullAccess else {
      showStatusMessage(
        "Turn on \"Allow Full Access\" for Type Easy keyboard (Settings → Keyboard → Keyboards).",
        isError: true
      )
      return
    }
    guard let input = collectInputText() else {
      showStatusMessage("Type or select text first.", isError: true)
      return
    }
    guard KeyboardSharedConfig.hasUserId() else {
      showStatusMessage("Open Type Easy and log in before using this feature.", isError: true)
      return
    }

    pendingReplaceSelected = input.selected
    pendingReplaceBeforeChars = input.beforeChars
    let userId = KeyboardSharedConfig.userId()
    let text = input.text

    switch feature {
    case .translate:
      showStatusMessage("Translating…", isError: false, isLoading: true)
      activeApiTask?.cancel()
      activeApiTask = Task { [weak self] in
        let response = await KeyboardApiClient.translate(
          text: text,
          userId: userId,
          targetLanguage: KeyboardSharedConfig.toLang()
        )
        await MainActor.run {
          guard let self, !Task.isCancelled else { return }
          if let result = response.result {
            self.showResult(result, isError: false)
          } else {
            self.showResult(response.error ?? "Translation failed", isError: true)
          }
        }
      }
    case .grammar:
      showStatusMessage("Checking grammar…", isError: false, isLoading: true)
      activeApiTask?.cancel()
      activeApiTask = Task { [weak self] in
        let response = await KeyboardApiClient.grammarCheck(text: text, userId: userId)
        await MainActor.run {
          guard let self, !Task.isCancelled else { return }
          if let result = response.result {
            self.showResult(result, isError: false)
          } else {
            self.showResult(response.error ?? "Grammar check failed", isError: true)
          }
        }
      }
    }
  }

  private struct CollectedInput {
    let text: String
    let selected: Bool
    let beforeChars: Int
  }

  private func collectInputText() -> CollectedInput? {
    let proxy = textDocumentProxy
    let selected = (proxy.selectedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let before = (proxy.documentContextBeforeInput ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !selected.isEmpty {
      return CollectedInput(text: selected, selected: true, beforeChars: 0)
    }
    if before.isEmpty { return nil }
    return CollectedInput(text: before, selected: false, beforeChars: before.count)
  }

  private func showStatusMessage(_ text: String, isError: Bool, isLoading: Bool = false) {
    hideEmojiPanel()
    voiceStatusLabel.text = text
    voiceStatusLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : (isLoading ? UIColor(red: 0x75 / 255.0, green: 0x75 / 255.0, blue: 0x75 / 255.0, alpha: 1) : KeyboardTheme.primary)
    voiceStopButton.isHidden = !isWaitingForDictation
    resultBar.isHidden = true
    voiceBar.isHidden = false
  }

  private func showResult(_ text: String, isError: Bool) {
    voiceBar.isHidden = true
    resultBar.isHidden = false
    resultLabel.text = text
    resultLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : KeyboardTheme.keyText
    lastResultIsError = isError
    resultInsertButton.isHidden = isError
  }

  @objc private func hideResult() {
    resultBar.isHidden = true
    resultLabel.text = ""
    resultInsertButton.isHidden = true
    pendingReplaceSelected = false
    pendingReplaceBeforeChars = 0
    lastResultIsError = false
  }

  @objc private func insertResult() {
    let text = resultLabel.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !text.isEmpty, !lastResultIsError else { return }
    let proxy = textDocumentProxy
    if !pendingReplaceSelected, pendingReplaceBeforeChars > 0 {
      for _ in 0..<pendingReplaceBeforeChars {
        proxy.deleteBackward()
      }
    }
    proxy.insertText(text)
    hideResult()
  }

  @objc private func onVoice() {
    if isWaitingForDictation {
      stopVoice()
      return
    }
    startVoice()
  }

  @objc private func toggleSettings() {
    hideResult()
    hideEmojiPanel()
    isSettingsVisible.toggle()
    settingsPanel.isHidden = !isSettingsVisible
    if !isSettingsVisible {
      hideLanguagePicker()
    }
    renderSettingsPanel()
  }

  private func reloadLanguagesFromSharedConfig() {
    fromLang = KeyboardSharedConfig.fromLang()
    toLang = KeyboardSharedConfig.toLang()
    renderSettingsPanel()
  }

  private func renderSettingsPanel() {
    fromLangButton.setTitle(KeyboardLanguages.shortLabel(for: fromLang), for: .normal)
    toLangButton.setTitle(KeyboardLanguages.shortLabel(for: toLang), for: .normal)
  }

  @discardableResult
  private func persistLanguages() -> Bool {
    guard hasFullAccess else {
      showStatusMessage(
        "Turn on \"Allow Full Access\" to save keyboard languages.",
        isError: true
      )
      return false
    }
    KeyboardSharedConfig.setLanguages(from: fromLang, to: toLang)
    return true
  }

  @objc private func swapLanguages() {
    let nextFrom = toLang
    let nextTo = fromLang
    fromLang = nextFrom
    toLang = nextTo
    if persistLanguages() {
      renderSettingsPanel()
    } else {
      reloadLanguagesFromSharedConfig()
    }
  }

  @objc private func pickFromLanguage() {
    toggleLanguagePicker(isFrom: true)
  }

  @objc private func pickToLanguage() {
    toggleLanguagePicker(isFrom: false)
  }

  /// Inline list — `UIAlertController` does not present reliably inside keyboard extensions.
  private func toggleLanguagePicker(isFrom: Bool) {
    guard hasFullAccess else {
      showStatusMessage(
        "Turn on \"Allow Full Access\" to change keyboard languages.",
        isError: true
      )
      return
    }
    if isLanguagePickerVisible && languagePickerIsFrom == isFrom {
      hideLanguagePicker()
      return
    }
    languagePickerIsFrom = isFrom
    isLanguagePickerVisible = true
    languagePickerContainer.isHidden = false
    languagePickerHeightConstraint?.constant = 220
    languageTableView.reloadData()
    if languageTableView.numberOfRows(inSection: 0) > 0 {
      let selected = isFrom ? fromLang : toLang
      if let index = KeyboardLanguages.all.firstIndex(where: { $0.code == selected }) {
        languageTableView.scrollToRow(at: IndexPath(row: index, section: 0), at: .middle, animated: false)
      }
    }
  }

  private func hideLanguagePicker() {
    isLanguagePickerVisible = false
    languagePickerContainer.isHidden = true
    languagePickerHeightConstraint?.constant = 0
  }

  private func selectLanguage(code: String) {
    if languagePickerIsFrom {
      fromLang = code
    } else {
      toLang = code
    }
    if persistLanguages() {
      renderSettingsPanel()
    } else {
      reloadLanguagesFromSharedConfig()
    }
    hideLanguagePicker()
  }

  private func showEmojiPanel() {
    hideResult()
    hideLanguagePicker()
    settingsPanel.isHidden = true
    isSettingsVisible = false
    isEmojiMode = true
    keysStack.isHidden = true
    emojiPanel.isHidden = false
    loadEmojiCategory(index: 0)
  }

  @objc private func hideEmojiPanel() {
    isEmojiMode = false
    keysStack.isHidden = false
    emojiPanel.isHidden = true
  }

  @objc private func emojiTabTapped(_ sender: UIButton) {
    loadEmojiCategory(index: sender.tag)
  }

  private func loadEmojiCategory(index: Int) {
    guard index >= 0, index < KeyboardEmojiData.categories.count else { return }
    for (i, btn) in emojiTabButtons.enumerated() {
      btn.backgroundColor = i == index ? KeyboardTheme.primary : .clear
      btn.tintColor = i == index ? .white : KeyboardTheme.keyText
    }
    emojiGridStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    let emojis = KeyboardEmojiData.categories[index].emojis
    let columns = 8
    var row: UIStackView?
    for (i, emoji) in emojis.enumerated() {
      if i % columns == 0 {
        row = UIStackView()
        row?.axis = .horizontal
        row?.distribution = .fillEqually
        row?.spacing = 2
        emojiGridStack.addArrangedSubview(row!)
      }
      let btn = UIButton(type: .system)
      btn.setTitle(emoji, for: .normal)
      btn.titleLabel?.font = .systemFont(ofSize: 22)
      btn.addAction(UIAction { [weak self] _ in
        self?.textDocumentProxy.insertText(emoji)
      }, for: .touchUpInside)
      row?.addArrangedSubview(btn)
    }
  }

  @objc private func emojiBackspace() {
    textDocumentProxy.deleteBackward()
  }

  /// iOS does not allow microphone access inside keyboard extensions — dictation runs in the host app.
  private func startVoice() {
    hideResult()
    guard hasFullAccess else {
      showStatusMessage(
        "Turn on \"Allow Full Access\" for Type Easy keyboard (Settings → Keyboard → Keyboards).",
        isError: true
      )
      return
    }

    let requestId = UUID().uuidString
    activeDictationRequestId = requestId
    isWaitingForDictation = true
    KeyboardDictationStore.shared.begin(requestId: requestId)

    showStatusMessage("Opening Type Easy to listen…", isError: false)

    KeyboardHostLink.openVoice(requestId: requestId, extensionContext: extensionContext) { [weak self] opened in
      DispatchQueue.main.async {
        guard let self else { return }
        self.voiceStopButton.isHidden = false
        self.startDictationPolling()
        if opened {
          self.voiceStatusLabel.text = "Speak in Type Easy, then switch back."
        } else {
          self.voiceStatusLabel.text = "Open Type Easy (app switcher), then speak."
        }
      }
    }
  }

  private func startDictationPolling() {
    dictationPollTimer?.invalidate()
    dictationPollTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
      self?.pollDictationState()
    }
  }

  private func pollDictationState() {
    let snap = KeyboardDictationStore.shared.snapshot()
    guard snap.requestId == activeDictationRequestId || activeDictationRequestId == nil else { return }

    switch snap.state {
    case .listening, .pending:
      if !snap.partialText.isEmpty {
        voiceStatusLabel.text = snap.partialText
      } else if snap.state == .listening {
        voiceStatusLabel.text = "Listening in Type Easy…"
      }
    case .done:
      let text = snap.finalText.trimmingCharacters(in: .whitespacesAndNewlines)
      if !text.isEmpty {
        textDocumentProxy.insertText(text + " ")
      }
      finishDictation(errorMessage: nil)
    case .error:
      finishDictation(errorMessage: snap.error.isEmpty ? "Voice input failed." : snap.error)
    case .cancelled:
      finishDictation(errorMessage: nil)
    case .idle:
      break
    }
  }

  @objc private func stopVoice() {
    if isWaitingForDictation {
      KeyboardDictationStore.shared.requestStop()
      pollDictationState()
      return
    }
    finishDictation(errorMessage: nil)
  }

  private func finishDictation(errorMessage: String?) {
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    isWaitingForDictation = false
    activeDictationRequestId = nil
    voiceStopButton.isHidden = true
    KeyboardDictationStore.shared.reset()

    if let errorMessage, !errorMessage.isEmpty {
      voiceStatusLabel.text = errorMessage
      voiceBar.isHidden = false
    } else {
      voiceBar.isHidden = true
    }
  }
}

// MARK: - Language picker table (inline; action sheets fail in keyboard extensions)

extension KeyboardViewController: UITableViewDataSource, UITableViewDelegate {
  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
    guard tableView === languageTableView else { return 0 }
    return KeyboardLanguages.all.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "LanguageCell", for: indexPath)
    let lang = KeyboardLanguages.all[indexPath.row]
    let selected = languagePickerIsFrom ? fromLang : toLang
    var config = UIListContentConfiguration.cell()
    config.text = lang.name
    config.secondaryText = KeyboardLanguages.shortLabel(for: lang.code).uppercased()
    config.secondaryTextProperties.color = UIColor(red: 0x5F / 255.0, green: 0x63 / 255.0, blue: 0x68 / 255.0, alpha: 1)
    config.textProperties.font = .systemFont(ofSize: 14)
    cell.contentConfiguration = config
    cell.backgroundColor = lang.code == selected
      ? UIColor(red: 0xEE / 255.0, green: 0xF1 / 255.0, blue: 0xFF / 255.0, alpha: 1)
      : .white
    cell.accessoryType = lang.code == selected ? .checkmark : .none
    cell.tintColor = KeyboardTheme.primary
    return cell
  }

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    let lang = KeyboardLanguages.all[indexPath.row]
    selectLanguage(code: lang.code)
  }
}
