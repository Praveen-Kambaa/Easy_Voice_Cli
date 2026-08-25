import AVFoundation
import UIKit

/// Type Easy custom keyboard extension — toolbar + QWERTY layout (mirrors Android `MyKeyboardService`).
class KeyboardViewController: UIInputViewController {

  private let toolbar = UIStackView()
  private enum ToolbarHighlight {
    case translate
    case grammar
    case voice
    case voiceCommand
    case settings
  }
  private var toolbarTranslateButton: UIButton!
  private var toolbarGrammarButton: UIButton!
  private var toolbarMicButton: UIButton!
  private var toolbarVoiceCommandButton: UIButton!
  private var toolbarSettingsButton: UIButton!
  private var toolbarIsReady = false
  /// Which feature produced the current result bar (translate / grammar / voice).
  private var resultToolbarSource: ToolbarHighlight?
  /// Set while translate/grammar API is in flight.
  private var loadingToolbarHighlight: ToolbarHighlight?
  private let keysStack = UIStackView()
  private let voiceBar = UIStackView()
  private let voiceStatusLabel = UILabel()
  private let voiceStopButton = UIButton(type: .system)
  private let resultBar = UIStackView()
  private let resultLabel = UILabel()
  private let resultInsertButton = UIButton(type: .system)
  private let resultDismissButton = UIButton(type: .system)
  private enum KeyboardLayer { case alpha, shift, caps, symbols }
  private var keyboardLayer: KeyboardLayer = .alpha
  private var isWaitingForDictation = false
  private var activeDictationRequestId: String?
  private var dictationPollTimer: Timer?
  private var pendingReplaceSelected = false
  private var pendingReplaceBeforeChars = 0
  private var lastResultIsError = false
  /// When true, `insertResult()` appends a trailing space (voice dictation).
  private var lastResultAppendTrailingSpace = false
  private var activeApiTask: Task<Void, Never>?
  private let voiceCommandPanel = KeyboardVoiceCommandPanel()
  private var activeVoiceCommandRequestId: String?
  private var voiceCommandPollTimer: Timer?
  private var commandVoiceAssetId: String?
  private var commandOriginalTranscript = ""
  /// True while opening the host app for mic / voice command (avoids tearing down sessions in `viewWillDisappear`).
  private var hostAppHandoffActive = false
  private var dictationUsesHostApp = false
  private var voiceCommandUsesHostApp = false
  /// Ignore host `selectionWillChange` briefly after focusing the voice-command transcript.
  private var transcriptEditingGraceUntil: CFAbsoluteTime = 0
  /// Cloud mic recording in the extension (Android `isCloudDictationRecording`).
  private var isCloudDictationRecording = false

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

  private let suggestionScroll = UIScrollView()
  private let suggestionRow = UIStackView()
  private let suggestionDivider = UIView()
  private var suggestionDebounceTimer: Timer?
  private var suggestionsRequestSeq: UInt64 = 0
  private var currentPartialWord = ""
  private var keyPreviewView: UILabel?
  private var alternativesPopup: UIView?
  private let snackbarLabel = UILabel()
  private var snackbarHideTimer: Timer?
  private var contextPollTimer: Timer?
  private var lastDocumentContextSignature = ""
  private var longPressWorkItem: DispatchWorkItem?
  private var suppressNextKeyUp = false

  private let alphaRows: [[String]] = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"],
    ["?123", "/", "😊", "space", ".", "↵"],
  ]

  private let symbolRows: [[String]] = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["@", "#", "$", "%", "&", "-", "+", "(", ")", "/"],
    ["=", "*", "\"", "'", ":", ";", "!", "?", "⌫"],
    ["ABC", ",", "😊", "space", ".", "↵"],
  ]

  private let topRowHints: [String: String] = [
    "q": "1", "w": "2", "e": "3", "r": "4", "t": "5",
    "y": "6", "u": "7", "i": "8", "o": "9", "p": "0",
  ]

  override func viewDidLoad() {
    super.viewDidLoad()
    setupSuggestionRow()
    setupToolbar()
    setupPanelsStack()
    setupSettingsPanel()
    setupVoiceBar()
    setupResultBar()
    setupVoiceCommandPanel()
    setupEmojiPanel()
    setupKeys()
    setupSnackbar()
    applyTheme()
    reloadLanguagesFromSharedConfig()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.userInterfaceStyle != previousTraitCollection?.userInterfaceStyle {
      applyTheme()
    }
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    hostAppHandoffActive = false
    applyTheme()
    applyAutoCapIfNewField()
    reloadLanguagesFromSharedConfig()
    updateSuggestions()
    resumeHostAppVoiceSessionsIfNeeded()
    resumeVoiceCommandSessionIfNeeded()
    startContextPolling()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    dismissKeyPreview()
    dismissAlternativesPopup()
    let preserveSession = hostAppHandoffActive || isWaitingForDictation || isCloudDictationRecording
      || isVoiceCommandSessionActive() || KeyboardExtensionCloudDictation.shared.isRecording
      || KeyboardInlineVoiceCommandRecorder.shared.isActive
      || KeyboardInlineSpeechDictation.shared.isActive
    if preserveSession {
      return
    }
    stopContextPolling()
    suggestionDebounceTimer?.invalidate()
    suggestionDebounceTimer = nil
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    voiceCommandPollTimer?.invalidate()
    voiceCommandPollTimer = nil
    KeyboardInlineSpeechDictation.shared.teardown(markCancelled: true)
    KeyboardInlineVoiceCommandRecorder.shared.cancel()
    KeyboardExtensionCloudDictation.shared.cancel()
    stopVoice()
    cancelVoiceCommandFlow()
  }

  deinit {
    dictationPollTimer?.invalidate()
    suggestionDebounceTimer?.invalidate()
  }

  private func setupSuggestionRow() {
    suggestionScroll.translatesAutoresizingMaskIntoConstraints = false
    suggestionScroll.backgroundColor = KeyboardTheme.suggestionBackground
    suggestionScroll.showsHorizontalScrollIndicator = false
    suggestionScroll.alwaysBounceHorizontal = true

    suggestionRow.axis = .horizontal
    suggestionRow.alignment = .center
    suggestionRow.spacing = 0
    suggestionRow.translatesAutoresizingMaskIntoConstraints = false
    suggestionScroll.addSubview(suggestionRow)

    suggestionDivider.backgroundColor = KeyboardTheme.suggestionDivider
    suggestionDivider.translatesAutoresizingMaskIntoConstraints = false

    view.addSubview(suggestionScroll)
    view.addSubview(suggestionDivider)

    NSLayoutConstraint.activate([
      suggestionScroll.topAnchor.constraint(equalTo: view.topAnchor),
      suggestionScroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      suggestionScroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      suggestionScroll.heightAnchor.constraint(equalToConstant: 38),

      suggestionRow.leadingAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.leadingAnchor, constant: 12),
      suggestionRow.trailingAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.trailingAnchor, constant: -12),
      suggestionRow.topAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.topAnchor),
      suggestionRow.bottomAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.bottomAnchor),
      suggestionRow.heightAnchor.constraint(equalTo: suggestionScroll.frameLayoutGuide.heightAnchor),

      suggestionDivider.topAnchor.constraint(equalTo: suggestionScroll.bottomAnchor),
      suggestionDivider.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      suggestionDivider.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      suggestionDivider.heightAnchor.constraint(equalToConstant: 1),
    ])
  }

  private func setupToolbar() {
    toolbar.axis = .horizontal
    toolbar.alignment = .center
    toolbar.spacing = 4
    toolbar.backgroundColor = KeyboardTheme.toolbarBackground
    toolbar.layoutMargins = UIEdgeInsets(top: 4, left: 8, bottom: 4, right: 8)
    toolbar.isLayoutMarginsRelativeArrangement = true
    toolbar.translatesAutoresizingMaskIntoConstraints = false

    toolbarTranslateButton = KeyboardTheme.toolbarTextButton(title: KeyboardTheme.translateIcon)
    toolbarTranslateButton.addTarget(self, action: #selector(onTranslate), for: .touchUpInside)

    toolbarGrammarButton = KeyboardTheme.toolbarTextButton(title: KeyboardTheme.grammarIcon)
    toolbarGrammarButton.addTarget(self, action: #selector(onGrammar), for: .touchUpInside)

    toolbarMicButton = KeyboardTheme.toolbarMicButton()
    toolbarMicButton.addTarget(self, action: #selector(onVoice), for: .touchUpInside)

    toolbarVoiceCommandButton = KeyboardTheme.toolbarVoiceCommandButton()
    toolbarVoiceCommandButton.addTarget(self, action: #selector(onVoiceCommand), for: .touchUpInside)

    toolbarSettingsButton = KeyboardTheme.toolbarSettingsButton()
    toolbarSettingsButton.addTarget(self, action: #selector(toggleSettings), for: .touchUpInside)
    toolbarSettingsButton.setContentCompressionResistancePriority(.required, for: .horizontal)

    [toolbarTranslateButton, toolbarGrammarButton, toolbarMicButton, toolbarVoiceCommandButton, UIView(), toolbarSettingsButton]
      .forEach { item in
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
      toolbar.topAnchor.constraint(equalTo: suggestionDivider.bottomAnchor),
      toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      toolbar.heightAnchor.constraint(equalToConstant: 46),
    ])
    toolbarIsReady = true
    refreshToolbarHighlight()
  }

  private func currentToolbarHighlight() -> ToolbarHighlight? {
    if isSettingsVisible { return .settings }
    if voiceCommandPanel.isActive || isVoiceCommandSessionActive() { return .voiceCommand }
    if isWaitingForDictation || isCloudDictationRecording { return .voice }
    if let loading = loadingToolbarHighlight { return loading }
    if !resultBar.isHidden, let source = resultToolbarSource { return source }
    return nil
  }

  private func refreshToolbarHighlight() {
    guard toolbarIsReady else { return }
    let active = currentToolbarHighlight()
    KeyboardTheme.styleToolbarButton(
      toolbarTranslateButton, selected: active == .translate, kind: .text
    )
    KeyboardTheme.styleToolbarButton(
      toolbarGrammarButton, selected: active == .grammar, kind: .text
    )
    KeyboardTheme.styleToolbarButton(
      toolbarMicButton, selected: active == .voice, kind: .mic
    )
    KeyboardTheme.styleToolbarButton(
      toolbarVoiceCommandButton, selected: active == .voiceCommand, kind: .voiceCommand
    )
    KeyboardTheme.styleToolbarButton(
      toolbarSettingsButton, selected: active == .settings, kind: .settings
    )
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
    voiceBar.spacing = 6
    voiceBar.backgroundColor = KeyboardTheme.voiceBarBackground
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
    voiceStatusLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    voiceStatusLabel.textColor = KeyboardTheme.primary
    voiceStatusLabel.numberOfLines = 3
    voiceStatusLabel.lineBreakMode = .byWordWrapping
    voiceStatusLabel.adjustsFontSizeToFitWidth = true
    voiceStatusLabel.minimumScaleFactor = 0.85
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

    let voiceBarHeight = voiceBar.heightAnchor.constraint(greaterThanOrEqualToConstant: 56)
    voiceBarHeight.priority = .defaultHigh
    NSLayoutConstraint.activate([
      voiceBarHeight,
      voiceBar.heightAnchor.constraint(lessThanOrEqualToConstant: 80),
    ])
    panelsStack.addArrangedSubview(voiceBar)
  }

  private func setupVoiceCommandPanel() {
    voiceCommandPanel.delegate = self
    panelsStack.addArrangedSubview(voiceCommandPanel)
    NSLayoutConstraint.activate([
      voiceCommandPanel.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
    ])
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
    resultLabel.lineBreakMode = .byTruncatingTail
    resultLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    resultLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)

    resultInsertButton.setTitle("↙ Insert", for: .normal)
    resultInsertButton.setTitleColor(.white, for: .normal)
    resultInsertButton.titleLabel?.font = .boldSystemFont(ofSize: 13)
    resultInsertButton.backgroundColor = KeyboardTheme.primary
    resultInsertButton.layer.cornerRadius = 8
    resultInsertButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    resultInsertButton.addTarget(self, action: #selector(insertResult), for: .touchUpInside)
    resultInsertButton.isHidden = true
    resultInsertButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    resultInsertButton.setContentHuggingPriority(.required, for: .horizontal)

    resultDismissButton.setTitle("✕", for: .normal)
    resultDismissButton.setTitleColor(KeyboardTheme.keyText, for: .normal)
    resultDismissButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    resultDismissButton.addTarget(self, action: #selector(hideResult), for: .touchUpInside)
    resultDismissButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    resultDismissButton.setContentHuggingPriority(.required, for: .horizontal)

    resultBar.addArrangedSubview(resultLabel)
    resultBar.addArrangedSubview(resultInsertButton)
    resultBar.addArrangedSubview(resultDismissButton)

    NSLayoutConstraint.activate([
      resultBar.heightAnchor.constraint(greaterThanOrEqualToConstant: 46),
      resultInsertButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 76),
    ])
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
      emojiPanel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),

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
      keysStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
    ])

    renderKeys()
  }

  private var currentKeyRows: [[String]] {
    keyboardLayer == .symbols ? symbolRows : alphaRows
  }

  private var isUppercaseLayer: Bool {
    keyboardLayer == .shift || keyboardLayer == .caps
  }

  private func renderKeys() {
    keysStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    currentKeyRows.enumerated().forEach { rowIndex, row in
      let rowStack = UIStackView()
      rowStack.axis = .horizontal
      rowStack.spacing = 4
      rowStack.distribution = .fillEqually
      if rowIndex == 1 {
        rowStack.layoutMargins = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
        rowStack.isLayoutMarginsRelativeArrangement = true
      }
      row.forEach { logical in
        rowStack.addArrangedSubview(makeKeyView(logical: logical, rowIndex: rowIndex))
      }
      keysStack.addArrangedSubview(rowStack)
    }
  }

  private func isActionKey(_ logical: String) -> Bool {
    if keyboardLayer == .symbols {
      return ["ABC", "⌫", "😊", "space", ".", "↵", ","].contains(logical)
    }
    return ["⇧", "⌫", "?123", "/", "😊", ".", "↵"].contains(logical)
  }

  private func keyDisplay(for logical: String) -> String {
    switch logical {
    case "space":
      return "space"
    case "⇧":
      switch keyboardLayer {
      case .caps: return "⬆"
      case .shift: return "↑"
      default: return "⇧"
      }
    case "↵":
      return "⏎"
    default:
      if isUppercaseLayer, logical.count == 1, logical.first?.isLetter == true {
        return logical.uppercased()
      }
      return logical
    }
  }

  private func keyFontSize(for logical: String) -> CGFloat {
    switch logical {
    case "space", "?123", "ABC":
      return 13
    case "😊":
      return 20
    case "⇧", "↵":
      return 24
    case "⌫":
      return 18
    default:
      return 18
    }
  }

  private func makeKeyView(logical: String, rowIndex: Int) -> UIView {
    let display = keyDisplay(for: logical)
    let showHint = rowIndex == 0
      && keyboardLayer != .symbols
      && logical.count == 1
      && logical.first?.isLetter == true
      && topRowHints[logical] != nil
    if showHint, let hint = topRowHints[logical] {
      return makeTopRowKeyView(logical: logical, display: display, hint: hint)
    }
    return makeKeyButton(logical: logical, display: display)
  }

  private func makeTopRowKeyView(logical: String, display: String, hint: String) -> UIView {
    let container = UIView()
    container.translatesAutoresizingMaskIntoConstraints = false
    let keyView = makeKeyButton(logical: logical, display: display)
    keyView.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(keyView)

    let hintLabel = UILabel()
    hintLabel.text = hint
    hintLabel.font = .systemFont(ofSize: 9)
    hintLabel.textColor = KeyboardTheme.hintText
    hintLabel.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(hintLabel)

    NSLayoutConstraint.activate([
      container.heightAnchor.constraint(equalToConstant: 44),
      keyView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      keyView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      keyView.topAnchor.constraint(equalTo: container.topAnchor),
      keyView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
      hintLabel.topAnchor.constraint(equalTo: container.topAnchor, constant: 3),
      hintLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -5),
    ])
    return container
  }

  private func makeKeyButton(logical: String, display: String) -> UIView {
    let wrapper = UIControl()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    let button = UIButton(type: .system)
    let isShiftOn = logical == "⇧" && (keyboardLayer == .shift || keyboardLayer == .caps)
    button.setTitle(display, for: .normal)
    button.setTitleColor(isShiftOn ? .white : KeyboardTheme.keyText, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: keyFontSize(for: logical))
    button.backgroundColor = isShiftOn
      ? KeyboardTheme.primary
      : (isActionKey(logical) ? KeyboardTheme.keyActionBackground : KeyboardTheme.keyLetterBackground)
    button.layer.cornerRadius = 8
    button.isUserInteractionEnabled = false
    button.translatesAutoresizingMaskIntoConstraints = false
    wrapper.addSubview(button)
    NSLayoutConstraint.activate([
      wrapper.heightAnchor.constraint(equalToConstant: 44),
      button.topAnchor.constraint(equalTo: wrapper.topAnchor),
      button.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
      button.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
      button.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
    ])
    attachKeyTouchHandlers(to: wrapper, button: button, logical: logical, previewLabel: display)
    return wrapper
  }

  private func attachKeyTouchHandlers(to wrapper: UIControl, button: UIButton, logical: String, previewLabel: String) {
    let isLetter = logical.count == 1 && logical.first?.isLetter == true

    let touchDown = UIAction { [weak self, weak wrapper, weak button] _ in
      guard let self, let wrapper, let button else { return }
      self.dismissAlternativesPopup()
      self.showKeyPreview(previewLabel, anchor: button)
      self.longPressWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self, weak wrapper] in
        guard let self, let wrapper else { return }
        self.suppressNextKeyUp = true
        self.dismissKeyPreview(immediate: true)
        if logical == "⌫" {
          self.clearAllInputText()
        } else if isLetter, KeyboardKeyAlternatives.map[logical] != nil {
          self.showAlternativesPopup(for: logical, anchor: wrapper)
        }
      }
      self.longPressWorkItem = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    let touchUp = UIAction { [weak self] _ in
      guard let self else { return }
      self.longPressWorkItem?.cancel()
      self.longPressWorkItem = nil
      self.dismissKeyPreview()
      if self.suppressNextKeyUp {
        self.suppressNextKeyUp = false
        return
      }
      self.handleKey(logical)
    }

    let touchCancel = UIAction { [weak self] _ in
      self?.longPressWorkItem?.cancel()
      self?.longPressWorkItem = nil
      self?.dismissKeyPreview()
    }

    wrapper.addAction(touchDown, for: .touchDown)
    wrapper.addAction(touchUp, for: .touchUpInside)
    wrapper.addAction(touchUp, for: .touchUpOutside)
    wrapper.addAction(touchCancel, for: .touchCancel)
  }

  private func handleKey(_ key: String) {
    if voiceCommandPanel.routeKey(key, shiftOn: keyboardLayer == .shift, capsOn: keyboardLayer == .caps) {
      return
    }
    guard let proxy = textDocumentProxy as UITextDocumentProxy? else { return }
    switch key {
    case "space":
      recordCompletedWordFromContext()
      proxy.insertText(" ")
      checkAutoCap()
      if keyboardLayer == .shift {
        keyboardLayer = .alpha
        renderKeys()
      }
    case "⌫":
      if let selected = proxy.selectedText, !selected.isEmpty {
        proxy.insertText("")
      } else {
        proxy.deleteBackward()
      }
    case "↵":
      recordCompletedWordFromContext()
      proxy.insertText("\n")
    case ".":
      recordCompletedWordFromContext()
      proxy.insertText(".")
      checkAutoCap()
    case ",":
      recordCompletedWordFromContext()
      proxy.insertText(",")
      checkAutoCap()
    case "⇧":
      switch keyboardLayer {
      case .alpha: keyboardLayer = .shift
      case .shift: keyboardLayer = .caps
      case .caps, .symbols: keyboardLayer = .alpha
      }
      renderKeys()
    case "?123":
      keyboardLayer = .symbols
      renderKeys()
    case "ABC":
      keyboardLayer = .alpha
      renderKeys()
    case "😊":
      showEmojiPanel()
    default:
      let out: String
      if isUppercaseLayer, key.count == 1, key.first?.isLetter == true {
        out = key.uppercased()
      } else {
        out = key
      }
      proxy.insertText(out)
      if keyboardLayer == .shift, key.count == 1, key.first?.isLetter == true {
        keyboardLayer = .alpha
        renderKeys()
      }
    }
    updateSuggestions()
  }

  // MARK: - Theme, auto-cap, key preview, snackbar

  private func applyTheme() {
    let dark = traitCollection.userInterfaceStyle == .dark
    KeyboardTheme.setDarkMode(dark)
    view.backgroundColor = KeyboardTheme.keyboardBackground
    toolbar.backgroundColor = KeyboardTheme.toolbarBackground
    suggestionScroll.backgroundColor = KeyboardTheme.suggestionBackground
    suggestionDivider.backgroundColor = KeyboardTheme.suggestionDivider
    voiceBar.backgroundColor = KeyboardTheme.voiceBarBackground
    resultBar.backgroundColor = KeyboardTheme.keyboardBackground
    settingsPanel.backgroundColor = KeyboardTheme.keyActionBackground
    emojiPanel.backgroundColor = KeyboardTheme.keyboardBackground
    panelsStack.arrangedSubviews.forEach { $0.backgroundColor = KeyboardTheme.keyboardBackground }
    renderKeys()
    renderSettingsPanel()
    refreshToolbarHighlight()
  }

  private func applyAutoCapIfNewField() {
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    let after = textDocumentProxy.documentContextAfterInput ?? ""
    guard before.isEmpty, after.isEmpty, keyboardLayer == .alpha else { return }
    keyboardLayer = .shift
    renderKeys()
  }

  private func checkAutoCap() {
    guard keyboardLayer == .alpha else { return }
    guard let before = textDocumentProxy.documentContextBeforeInput, before.count >= 2 else { return }
    let tail = String(before.suffix(2))
    if tail == ". " || tail == "! " || tail == "? " {
      keyboardLayer = .shift
      renderKeys()
    }
  }

  private func clearAllInputText() {
    if voiceCommandPanel.clearTranscript() { return }
    guard let proxy = textDocumentProxy as UITextDocumentProxy? else { return }
    if let selected = proxy.selectedText, !selected.isEmpty {
      proxy.insertText("")
      updateSuggestions()
      return
    }
    for _ in 0..<4096 {
      let before = proxy.documentContextBeforeInput ?? ""
      let after = proxy.documentContextAfterInput ?? ""
      if before.isEmpty, after.isEmpty { break }
      proxy.deleteBackward()
    }
    currentPartialWord = ""
    renderSuggestionChips(words: [], loading: false)
  }

  private func showKeyPreview(_ label: String, anchor: UIView) {
    dismissKeyPreview(immediate: true)
    let preview = UILabel()
    preview.text = label
    preview.font = .systemFont(ofSize: 22, weight: .medium)
    preview.textAlignment = .center
    preview.textColor = KeyboardTheme.keyText
    preview.backgroundColor = KeyboardTheme.popupBackground
    preview.layer.cornerRadius = 8
    preview.layer.borderWidth = 1
    preview.layer.borderColor = KeyboardTheme.popupStroke.cgColor
    preview.layer.shadowOpacity = 0.15
    preview.layer.shadowRadius = 4
    preview.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(preview)
    let anchorFrame = anchor.convert(anchor.bounds, to: view)
    NSLayoutConstraint.activate([
      preview.centerXAnchor.constraint(equalTo: view.leadingAnchor, constant: anchorFrame.midX),
      preview.bottomAnchor.constraint(equalTo: view.topAnchor, constant: anchorFrame.minY - 6),
      preview.widthAnchor.constraint(greaterThanOrEqualToConstant: 36),
      preview.heightAnchor.constraint(equalToConstant: 44),
    ])
    keyPreviewView = preview
  }

  private func dismissKeyPreview(immediate: Bool = false) {
    keyPreviewView?.removeFromSuperview()
    keyPreviewView = nil
  }

  private func showAlternativesPopup(for logical: String, anchor: UIView) {
    dismissAlternativesPopup()
    guard let alts = KeyboardKeyAlternatives.map[logical], !alts.isEmpty else { return }
    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 4
    row.backgroundColor = KeyboardTheme.popupBackground
    row.layer.cornerRadius = 10
    row.layer.borderWidth = 1
    row.layer.borderColor = KeyboardTheme.popupStroke.cgColor
    row.layoutMargins = UIEdgeInsets(top: 4, left: 4, bottom: 4, right: 4)
    row.isLayoutMarginsRelativeArrangement = true
    for alt in alts {
      let btn = UIButton(type: .system)
      btn.setTitle(alt, for: .normal)
      btn.titleLabel?.font = .systemFont(ofSize: 16)
      btn.setTitleColor(KeyboardTheme.keyText, for: .normal)
      btn.backgroundColor = KeyboardTheme.keyActionBackground
      btn.layer.cornerRadius = 6
      btn.widthAnchor.constraint(equalToConstant: 38).isActive = true
      btn.heightAnchor.constraint(equalToConstant: 40).isActive = true
      btn.addAction(UIAction { [weak self] _ in
        if self?.voiceCommandPanel.insertTranscriptText(alt) != true {
          self?.textDocumentProxy.insertText(alt)
        }
        self?.dismissAlternativesPopup()
        self?.updateSuggestions()
      }, for: .touchUpInside)
      row.addArrangedSubview(btn)
    }
    row.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(row)
    let frame = anchor.convert(anchor.bounds, to: view)
    NSLayoutConstraint.activate([
      row.centerXAnchor.constraint(equalTo: view.leadingAnchor, constant: frame.midX),
      row.bottomAnchor.constraint(equalTo: view.topAnchor, constant: frame.minY - 4),
    ])
    alternativesPopup = row
  }

  private func dismissAlternativesPopup() {
    alternativesPopup?.removeFromSuperview()
    alternativesPopup = nil
  }

  private func setupSnackbar() {
    snackbarLabel.font = .systemFont(ofSize: 13, weight: .medium)
    snackbarLabel.textColor = .white
    snackbarLabel.textAlignment = .center
    snackbarLabel.backgroundColor = UIColor(red: 0x32 / 255.0, green: 0x32 / 255.0, blue: 0x32 / 255.0, alpha: 0.92)
    snackbarLabel.layer.cornerRadius = 8
    snackbarLabel.clipsToBounds = true
    snackbarLabel.numberOfLines = 2
    snackbarLabel.isHidden = true
    snackbarLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(snackbarLabel)
    NSLayoutConstraint.activate([
      snackbarLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
      snackbarLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
      snackbarLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      snackbarLabel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
    ])
  }

  private func showSnackbar(_ message: String, duration: TimeInterval = 2.2) {
    snackbarHideTimer?.invalidate()
    snackbarLabel.text = "  \(message)  "
    snackbarLabel.isHidden = false
    snackbarLabel.alpha = 0
    UIView.animate(withDuration: 0.2) { self.snackbarLabel.alpha = 1 }
    snackbarHideTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
      UIView.animate(withDuration: 0.2, animations: {
        self?.snackbarLabel.alpha = 0
      }, completion: { _ in
        self?.snackbarLabel.isHidden = true
      })
    }
  }

  private func startContextPolling() {
    contextPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.35, repeats: true) { [weak self] _ in
      self?.pollDocumentContextIfChanged()
    }
    RunLoop.main.add(timer, forMode: .common)
    contextPollTimer = timer
  }

  private func stopContextPolling() {
    contextPollTimer?.invalidate()
    contextPollTimer = nil
  }

  private func captureDocumentContextSignature() {
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    let after = textDocumentProxy.documentContextAfterInput ?? ""
    lastDocumentContextSignature = "\(before)|\(after)"
  }

  private func pollDocumentContextIfChanged() {
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    let after = textDocumentProxy.documentContextAfterInput ?? ""
    let signature = "\(before)|\(after)"
    guard signature != lastDocumentContextSignature else { return }
    lastDocumentContextSignature = signature
    updateSuggestions()
  }

  /// When the host app's caret moves, stop routing keys into the voice-command transcript (Android `onUpdateSelection`).
  override func selectionWillChange(_ textInput: UITextInput?) {
    super.selectionWillChange(textInput)
    guard CFAbsoluteTimeGetCurrent() >= transcriptEditingGraceUntil else { return }
    if voiceCommandPanel.shouldRouteKeysToTranscript() {
      voiceCommandPanel.releaseTranscriptRouting()
    }
  }

  // MARK: - Word suggestions (Datamuse)

  private func recordCompletedWordFromContext() {
    guard let word = partialWordFromContext(), word.count >= 2 else { return }
    KeyboardRecentWordsStore.record(word)
  }

  private func partialWordFromContext() -> String? {
    guard let before = textDocumentProxy.documentContextBeforeInput, !before.isEmpty else {
      return nil
    }
    let tail = String(before.suffix(40))
    guard let match = tail.range(of: "[A-Za-z']+$", options: .regularExpression) else {
      return nil
    }
    return String(tail[match])
  }

  private func updateSuggestions() {
    guard !isEmojiMode else {
      renderSuggestionChips(words: [], loading: false)
      return
    }
    let partial = partialWordFromContext()?.lowercased() ?? ""
    if partial.isEmpty {
      currentPartialWord = ""
      renderSuggestionChips(words: [], loading: false)
      return
    }
    scheduleDatamuseFetch(query: partial)
  }

  private func scheduleDatamuseFetch(query: String) {
    suggestionDebounceTimer?.invalidate()
    guard !query.isEmpty else {
      currentPartialWord = ""
      renderSuggestionChips(words: [], loading: false)
      return
    }
    renderSuggestionChips(words: [], loading: true)
    let seq = suggestionsRequestSeq + 1
    suggestionsRequestSeq = seq
    suggestionDebounceTimer = Timer.scheduledTimer(withTimeInterval: 0.28, repeats: false) { [weak self] _ in
      self?.fetchDatamuseSuggestions(query: query, seq: seq)
    }
  }

  private func fetchDatamuseSuggestions(query: String, seq: UInt64) {
    Task { [weak self] in
      let words = await KeyboardDatamuseClient.fetchSuggestions(query: query)
      await MainActor.run {
        guard let self, seq == self.suggestionsRequestSeq else { return }
        self.currentPartialWord = query
        self.renderSuggestionChips(words: words, loading: false)
      }
    }
  }

  private func renderSuggestionChips(words: [String], loading: Bool) {
    suggestionRow.arrangedSubviews.forEach { $0.removeFromSuperview() }
    if loading {
      let label = UILabel()
      label.text = "…"
      label.font = .systemFont(ofSize: 15)
      label.textColor = KeyboardTheme.hintText
      suggestionRow.addArrangedSubview(label)
      return
    }
    if words.isEmpty { return }

    let partialLen = currentPartialWord.count
    for (index, word) in words.enumerated() {
      if index > 0 {
        let dot = UILabel()
        dot.text = "·"
        dot.font = .systemFont(ofSize: 15)
        dot.textColor = KeyboardTheme.hintText
        suggestionRow.addArrangedSubview(dot)
      }
      let chip = UIButton(type: .system)
      chip.setTitle(word, for: .normal)
      chip.titleLabel?.font = index == 0 ? .boldSystemFont(ofSize: 15) : .systemFont(ofSize: 15)
      chip.setTitleColor(index == 0 ? KeyboardTheme.primary : KeyboardTheme.keyText, for: .normal)
      chip.contentEdgeInsets = UIEdgeInsets(top: 2, left: 4, bottom: 2, right: 4)
      chip.addAction(UIAction { [weak self] _ in
        self?.applySuggestionWord(word, partialLength: partialLen)
      }, for: .touchUpInside)
      suggestionRow.addArrangedSubview(chip)
    }
  }

  private func applySuggestionWord(_ word: String, partialLength: Int) {
    if partialLength > 0 {
      for _ in 0..<partialLength {
        textDocumentProxy.deleteBackward()
      }
    }
    textDocumentProxy.insertText(word + " ")
    KeyboardRecentWordsStore.record(word)
    currentPartialWord = ""
    suggestionsRequestSeq += 1
    renderSuggestionChips(words: [], loading: false)
    updateSuggestions()
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
    isSettingsVisible = false
    settingsPanel.isHidden = true
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
      loadingToolbarHighlight = .translate
      refreshToolbarHighlight()
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
          self.loadingToolbarHighlight = nil
          if let result = response.result {
            self.showResult(result, isError: false, toolbarSource: .translate)
          } else {
            self.showResult(response.error ?? "Translation failed", isError: true, toolbarSource: .translate)
          }
        }
      }
    case .grammar:
      loadingToolbarHighlight = .grammar
      refreshToolbarHighlight()
      showStatusMessage("Checking grammar…", isError: false, isLoading: true)
      activeApiTask?.cancel()
      activeApiTask = Task { [weak self] in
        let response = await KeyboardApiClient.grammarCheck(text: text, userId: userId)
        await MainActor.run {
          guard let self, !Task.isCancelled else { return }
          self.loadingToolbarHighlight = nil
          if let result = response.result {
            self.showResult(result, isError: false, toolbarSource: .grammar)
          } else {
            self.showResult(response.error ?? "Grammar check failed", isError: true, toolbarSource: .grammar)
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
    if !isWaitingForDictation, !isCloudDictationRecording {
      refreshToolbarHighlight()
    }
    voiceStatusLabel.text = text
    voiceStatusLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : (isLoading ? UIColor(red: 0x75 / 255.0, green: 0x75 / 255.0, blue: 0x75 / 255.0, alpha: 1) : KeyboardTheme.primary)
    voiceStopButton.isHidden = !isWaitingForDictation
    resultBar.isHidden = true
    voiceBar.isHidden = false
  }

  private func showResult(
    _ text: String,
    isError: Bool,
    isLoading: Bool = false,
    toolbarSource: ToolbarHighlight? = nil
  ) {
    if let toolbarSource {
      resultToolbarSource = toolbarSource
    } else if lastResultAppendTrailingSpace {
      resultToolbarSource = .voice
    }
    voiceBar.isHidden = true
    resultBar.isHidden = false
    resultLabel.text = text
    resultLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : (isLoading
        ? UIColor(red: 0x75 / 255.0, green: 0x75 / 255.0, blue: 0x75 / 255.0, alpha: 1)
        : KeyboardTheme.keyText)
    lastResultIsError = isError
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let showInsert = !isError && !isLoading && !trimmed.isEmpty
    resultInsertButton.isHidden = !showInsert
    resultInsertButton.isEnabled = showInsert
    refreshToolbarHighlight()
  }

  @objc private func hideResult() {
    resultBar.isHidden = true
    resultLabel.text = ""
    resultInsertButton.isHidden = true
    pendingReplaceSelected = false
    pendingReplaceBeforeChars = 0
    lastResultIsError = false
    lastResultAppendTrailingSpace = false
    resultToolbarSource = nil
    refreshToolbarHighlight()
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
    let toInsert = lastResultAppendTrailingSpace ? text + " " : text
    proxy.insertText(toInsert)
    hideResult()
    updateSuggestions()
  }

  @objc private func onVoice() {
    reloadLanguagesFromSharedConfig()
    hideEmojiPanel()
    isSettingsVisible = false
    settingsPanel.isHidden = true
    if voiceCommandPanel.isActive {
      cancelVoiceCommandFlow()
    }
    if isCloudDictationRecording {
      stopCloudDictationAndUpload()
      return
    }
    if isWaitingForDictation {
      stopVoice()
      return
    }
    startVoice()
  }

  @objc private func onVoiceCommand() {
    reloadLanguagesFromSharedConfig()
    // Match Android `onVoiceCommandPress`: toggle only when the panel is already open.
    if voiceCommandPanel.isActive {
      if voiceCommandPanel.isRecording {
        KeyboardVoiceCommandStore.shared.requestStop()
      } else {
        cancelVoiceCommandFlow()
      }
      return
    }
    stopVoice()
    hideResult()
    hideEmojiPanel()
    isSettingsVisible = false
    settingsPanel.isHidden = true
    guard hasFullAccess else {
      showStatusMessage(
        "Turn on \"Allow Full Access\" for Type Easy keyboard (Settings → Keyboard → Keyboards).",
        isError: true
      )
      return
    }
    guard KeyboardSharedConfig.hasUserId() else {
      showResult("Open Type Easy and log in before using Voice Command.", isError: true)
      return
    }
    startVoiceCommandFlow()
  }

  private func startVoiceCommandFlow() {
    hideEmojiPanel()
    isSettingsVisible = false
    settingsPanel.isHidden = true
    let requestId = UUID().uuidString
    activeVoiceCommandRequestId = requestId
    voiceCommandUsesHostApp = false
    voiceBar.isHidden = true
    resultBar.isHidden = true
    voiceCommandPanel.showRecording()
    voiceCommandPanel.setRecordingStatus("Listening…")
    refreshToolbarHighlight()

    ensureMicrophoneForVoice { [weak self] granted in
      DispatchQueue.main.async {
        guard let self else { return }
        guard granted else {
          self.voiceCommandPanel.showReviewError(
            "Microphone permission denied. Enable mic for Type Easy in Settings → Privacy → Microphone."
          )
          self.activeVoiceCommandRequestId = nil
          return
        }
        KeyboardInlineVoiceCommandRecorder.shared.start(requestId: requestId) { [weak self] outcome in
          DispatchQueue.main.async {
            guard let self else { return }
            switch outcome {
            case .started:
              self.voiceCommandPanel.setRecordingStatus("Speak now, then tap Stop")
              self.startVoiceCommandPolling()
            case .failed(let message):
              if self.shouldFallbackVoiceCommandToHostApp(message: message) {
                self.startHostAppVoiceCommandHandoff(requestId: requestId)
              } else {
                self.voiceCommandPanel.showReviewError(message)
                self.activeVoiceCommandRequestId = nil
              }
            }
          }
        }
      }
    }
  }

  /// True when an in-flight voice-command session should survive a brief keyboard hide (mirrors Android IME behavior).
  private func isVoiceCommandSessionActive() -> Bool {
    if voiceCommandPanel.isActive { return true }
    guard let requestId = activeVoiceCommandRequestId, !requestId.isEmpty else { return false }
    let snap = KeyboardVoiceCommandStore.shared.snapshot()
    guard snap.requestId == requestId else { return false }
    switch snap.state {
    case .pending, .recording, .transcribing, .review:
      return true
    case .idle, .error, .cancelled:
      return false
    }
  }

  private func resumeVoiceCommandSessionIfNeeded() {
    guard isVoiceCommandSessionActive() else { return }
    voiceBar.isHidden = true
    resultBar.isHidden = true
    let snap = KeyboardVoiceCommandStore.shared.snapshot()
    switch snap.state {
    case .pending, .recording:
      voiceCommandPanel.showRecording()
      if snap.state == .recording {
        voiceCommandPanel.setRecordingStatus(
          voiceCommandUsesHostApp
            ? "Recording in Type Easy — speak, then tap Stop"
            : "Speak now, then tap Stop"
        )
      }
      startVoiceCommandPolling()
    case .transcribing:
      voiceCommandPanel.showReviewLoading("Transcribing your recording…")
      startVoiceCommandPolling()
    case .review:
      commandVoiceAssetId = snap.voiceAssetId.isEmpty ? nil : snap.voiceAssetId
      commandOriginalTranscript = snap.transcript
      voiceCommandPanel.showReview(snap.transcript)
      captureDocumentContextSignature()
    case .error:
      voiceCommandPanel.showReviewError(snap.error.isEmpty ? "Voice command failed" : snap.error)
    case .idle, .cancelled:
      break
    }
  }

  private func ensureMicrophoneForVoice(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        completion(true)
      case .denied:
        completion(false)
      case .undetermined:
        AVAudioApplication.requestRecordPermission { granted in
          DispatchQueue.main.async { completion(granted) }
        }
      @unknown default:
        completion(false)
      }
      return
    }
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      completion(true)
    case .denied:
      completion(false)
    case .undetermined:
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        DispatchQueue.main.async { completion(granted) }
      }
    @unknown default:
      completion(false)
    }
  }

  private func shouldFallbackVoiceCommandToHostApp(message: String) -> Bool {
    let lower = message.lowercased()
    if lower.contains("permission") || lower.contains("denied") { return false }
    return true
  }

  private func startHostAppVoiceCommandHandoff(requestId: String) {
    voiceCommandUsesHostApp = true
    KeyboardInlineVoiceCommandRecorder.shared.cancel()
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    KeyboardVoiceCommandStore.shared.begin(requestId: requestId)
    KeyboardSharedConfig.setPendingDeepLink(
      "\(KeyboardSharedConfig.deepLinkVoiceCommand)?requestId=\(requestId)"
    )
    KeyboardSharedNotifications.postVoiceCommandStart()
    voiceCommandPanel.setRecordingStatus("Opening Type Easy…")
    openHostAppForVoice {
      KeyboardHostLink.openVoiceCommand(requestId: requestId, extensionContext: self.extensionContext) { [weak self] opened in
        DispatchQueue.main.async {
          guard let self else { return }
          if !opened {
            self.hostAppHandoffActive = false
          }
          if opened {
            self.voiceCommandPanel.setRecordingStatus("Recording in Type Easy — speak, then tap Stop")
          } else {
            self.voiceCommandPanel.setRecordingStatus("Open Type Easy from the app switcher, then speak")
          }
          self.startVoiceCommandPolling()
        }
      }
    }
  }

  private func openHostAppForVoice(_ open: () -> Void) {
    hostAppHandoffActive = true
    open()
  }

  private func resumeHostAppVoiceSessionsIfNeeded() {
    if isWaitingForDictation || isCloudDictationRecording {
      voiceBar.isHidden = false
      voiceStopButton.isHidden = !isCloudDictationRecording && !dictationUsesHostApp
      if KeyboardExtensionCloudDictation.shared.isRecording {
        isCloudDictationRecording = true
        voiceStatusLabel.text = "Recording… tap mic to stop"
      }
      startDictationPolling()
    }
  }

  private func startVoiceCommandPolling() {
    voiceCommandPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.3, repeats: true) { [weak self] _ in
      self?.pollVoiceCommandState()
    }
    RunLoop.main.add(timer, forMode: .common)
    voiceCommandPollTimer = timer
  }

  private func pollVoiceCommandState() {
    let snap = KeyboardVoiceCommandStore.shared.snapshot()
    guard let activeId = activeVoiceCommandRequestId, !activeId.isEmpty, snap.requestId == activeId else { return }

    switch snap.state {
    case .pending:
      break
    case .recording:
      voiceCommandPanel.showRecording()
      refreshToolbarHighlight()
      if let start = snap.recordingStartedAt {
        let elapsed = Int(Date().timeIntervalSince(start))
        voiceCommandPanel.updateRecordingTimer(String(format: "%d:%02d", elapsed / 60, elapsed % 60))
      }
    case .transcribing:
      voiceCommandPanel.showReviewLoading("Transcribing your recording…")
    case .review:
      commandVoiceAssetId = snap.voiceAssetId.isEmpty ? nil : snap.voiceAssetId
      commandOriginalTranscript = snap.transcript
      voiceCommandPanel.showReview(snap.transcript)
      captureDocumentContextSignature()
      refreshToolbarHighlight()
      stopVoiceCommandPolling()
    case .error:
      voiceCommandPanel.showReviewError(snap.error.isEmpty ? "Voice command failed" : snap.error)
      stopVoiceCommandPolling()
    case .cancelled:
      stopVoiceCommandPolling()
      voiceCommandPanel.dismiss()
      activeVoiceCommandRequestId = nil
      commandVoiceAssetId = nil
      commandOriginalTranscript = ""
      KeyboardVoiceCommandStore.shared.reset()
    case .idle:
      break
    }
  }

  private func stopVoiceCommandPolling() {
    voiceCommandPollTimer?.invalidate()
    voiceCommandPollTimer = nil
  }

  private func executeVoiceCommandFromReview(_ editedText: String) {
    voiceCommandPanel.setLoading(true, message: "Sending command…")
    let original = commandOriginalTranscript
    Task { [weak self] in
      guard let self else { return }
      var assetId = self.commandVoiceAssetId ?? ""
      if assetId.isEmpty {
        await MainActor.run {
          self.voiceCommandPanel.showReviewError("Missing voice asset ID — re-record and try again.")
        }
        return
      }
      if editedText != original {
        let update = await KeyboardVoiceApiClient.updateTranscript(voiceAssetId: assetId, finalTranscript: editedText)
        switch update {
        case .success(let newId):
          assetId = newId
        case .failure(let error):
          await MainActor.run {
            self.voiceCommandPanel.showReviewError(error.localizedDescription)
          }
          return
        }
      }
      let exec = await KeyboardVoiceApiClient.executeVoiceCommand(voiceAssetId: assetId)
      await MainActor.run {
        switch exec {
        case .success(let payload):
          self.completeVoiceCommandSuccess(payload)
        case .failure(let error):
          self.voiceCommandPanel.showReviewError(error.localizedDescription)
        }
      }
    }
  }

  private func completeVoiceCommandSuccess(_ payload: KeyboardVoiceApiClient.ExecuteResult?) {
    let trimmedResult = payload?.result?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let message = trimmedResult.isEmpty ? (payload?.status ?? "Command sent") : trimmedResult
    stopVoiceCommandPolling()
    activeVoiceCommandRequestId = nil
    commandVoiceAssetId = nil
    commandOriginalTranscript = ""
    voiceCommandPanel.dismiss()
    KeyboardVoiceCommandStore.shared.reset()
    showSnackbar(message)
  }

  private func cancelVoiceCommandFlow() {
    stopVoiceCommandPolling()
    activeVoiceCommandRequestId = nil
    commandVoiceAssetId = nil
    commandOriginalTranscript = ""
    voiceCommandPanel.dismiss()
    if voiceCommandUsesHostApp {
      KeyboardVoiceCommandStore.shared.requestCancel()
    } else {
      KeyboardInlineVoiceCommandRecorder.shared.cancel()
      KeyboardVoiceCommandStore.shared.reset()
    }
    voiceCommandUsesHostApp = false
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    refreshToolbarHighlight()
  }

  @objc private func toggleSettings() {
    hideResult()
    cancelVoiceCommandFlow()
    hideEmojiPanel()
    isSettingsVisible.toggle()
    settingsPanel.isHidden = !isSettingsVisible
    if !isSettingsVisible {
      hideLanguagePicker()
    }
    renderSettingsPanel()
    refreshToolbarHighlight()
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
    updateSuggestions()
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
        self?.updateSuggestions()
      }, for: .touchUpInside)
      row?.addArrangedSubview(btn)
    }
  }

  @objc private func emojiBackspace() {
    textDocumentProxy.deleteBackward()
  }

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
    dictationUsesHostApp = false
    isCloudDictationRecording = false

    ensureMicrophoneForVoice { [weak self] granted in
      DispatchQueue.main.async {
        guard let self else { return }
        guard granted else {
          self.showResult(
            "Allow microphone access for Type Easy in Settings → Privacy → Microphone.",
            isError: true
          )
          self.finishDictation()
          return
        }
        self.startCloudDictationInKeyboard(requestId: requestId)
        self.refreshToolbarHighlight()
      }
    }
  }

  private func startInlineSpeechDictation(requestId: String) {
    KeyboardInlineSpeechDictation.shared.start(requestId: requestId) { [weak self] outcome in
      DispatchQueue.main.async {
        guard let self else { return }
        switch outcome {
        case .started:
          self.isCloudDictationRecording = false
          self.showStatusMessage("Listening… tap mic to stop", isError: false, isLoading: false)
          self.voiceStopButton.isHidden = false
          self.startDictationPolling()
          self.refreshToolbarHighlight()
        case .failed:
          if self.hasFullAccess {
            self.startHostAppDictationHandoff(requestId: requestId)
          } else {
            self.showResult(
              "Voice input failed. Enable Allow Full Access for the Type Easy keyboard.",
              isError: true
            )
            self.finishDictation()
          }
        }
      }
    }
  }

  /// Android cloud dictation path — record m4a in the keyboard, then transcribe (works in any app).
  private func startCloudDictationInKeyboard(requestId: String) {
    switch KeyboardExtensionCloudDictation.shared.start(requestId: requestId) {
    case .success:
      isCloudDictationRecording = true
      dictationUsesHostApp = false
      showStatusMessage("Recording… tap mic to stop", isError: false, isLoading: false)
      voiceStopButton.isHidden = false
      startDictationPolling()
      refreshToolbarHighlight()
    case .failure:
      self.startInlineSpeechDictation(requestId: requestId)
    }
  }

  private func stopCloudDictationAndUpload() {
    guard isCloudDictationRecording else { return }
    isCloudDictationRecording = false
    voiceStatusLabel.text = "Transcribing…"
    voiceStopButton.isHidden = true
    KeyboardExtensionCloudDictation.shared.stopAndTranscribe()
    startDictationPolling()
  }

  private func startHostAppDictationHandoff(requestId: String) {
    dictationUsesHostApp = true
    isCloudDictationRecording = false
    KeyboardExtensionCloudDictation.shared.cancel()
    KeyboardInlineSpeechDictation.shared.teardown(markCancelled: true)
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    KeyboardDictationStore.shared.begin(requestId: requestId)
    KeyboardSharedConfig.setPendingDeepLink(
      "\(KeyboardSharedConfig.deepLinkVoice)?requestId=\(requestId)"
    )
    KeyboardSharedNotifications.postDictationStart()
    showStatusMessage("Opening Type Easy to listen…", isError: false)

    openHostAppForVoice {
      KeyboardHostLink.openVoice(requestId: requestId, extensionContext: self.extensionContext) { [weak self] opened in
        DispatchQueue.main.async {
          guard let self else { return }
          if !opened {
            self.hostAppHandoffActive = false
          }
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
  }

  private func startDictationPolling() {
    dictationPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.3, repeats: true) { [weak self] _ in
      self?.pollDictationState()
    }
    RunLoop.main.add(timer, forMode: .common)
    dictationPollTimer = timer
  }

  private func pollDictationState() {
    let snap = KeyboardDictationStore.shared.snapshot()
    guard let activeId = activeDictationRequestId, !activeId.isEmpty, snap.requestId == activeId else { return }

    switch snap.state {
    case .listening, .pending:
      if isCloudDictationRecording {
        voiceStatusLabel.text = "Recording… tap mic to stop"
      } else if !snap.partialText.isEmpty {
        voiceStatusLabel.text = snap.partialText
      } else if snap.state == .listening {
        voiceStatusLabel.text = dictationUsesHostApp
          ? "Listening in Type Easy…"
          : "Listening… speak now"
      }
    case .done:
      let text = snap.finalText.trimmingCharacters(in: .whitespacesAndNewlines)
      finishDictation()
      if text.isEmpty {
        showResult("No speech detected.", isError: true, toolbarSource: .voice)
      } else {
        lastResultAppendTrailingSpace = true
        showResult(text, isError: false, toolbarSource: .voice)
      }
    case .error:
      finishDictation()
      showResult(
        snap.error.isEmpty ? "Voice input failed." : snap.error,
        isError: true,
        toolbarSource: .voice
      )
    case .cancelled:
      finishDictation()
    case .idle:
      break
    }
  }

  @objc private func stopVoice() {
    if isCloudDictationRecording {
      stopCloudDictationAndUpload()
      return
    }
    if isWaitingForDictation {
      if dictationUsesHostApp {
        KeyboardDictationStore.shared.requestStop()
      } else {
        KeyboardInlineSpeechDictation.shared.requestStop()
      }
      pollDictationState()
      return
    }
    finishDictation()
  }

  private func finishDictation() {
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    isWaitingForDictation = false
    isCloudDictationRecording = false
    activeDictationRequestId = nil
    dictationUsesHostApp = false
    voiceStopButton.isHidden = true
    KeyboardExtensionCloudDictation.shared.cancel()
    KeyboardInlineSpeechDictation.shared.teardown(markCancelled: false)
    KeyboardDictationStore.shared.reset()
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    voiceBar.isHidden = true
    refreshToolbarHighlight()
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

extension KeyboardViewController: KeyboardVoiceCommandPanelDelegate {
  func voiceCommandPanelDidActivateTranscriptEditing() {
    transcriptEditingGraceUntil = CFAbsoluteTimeGetCurrent() + 0.35
  }

  func voiceCommandPanelDidTapStopRecording() {
    KeyboardVoiceCommandStore.shared.requestStop()
  }

  func voiceCommandPanelDidTapCancelRecording() {
    cancelVoiceCommandFlow()
  }

  func voiceCommandPanelDidTapCancelReview() {
    cancelVoiceCommandFlow()
  }

  func voiceCommandPanelDidTapSend(editedText: String) {
    executeVoiceCommandFromReview(editedText)
  }
}
