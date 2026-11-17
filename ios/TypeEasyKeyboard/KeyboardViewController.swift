import AVFoundation
import UIKit

/// Type Easy custom keyboard extension — toolbar + QWERTY layout (mirrors Android `MyKeyboardService`).
class KeyboardViewController: UIInputViewController {

  private let rootContainerView = UIView()
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
  private let micController = KeyboardMicController()
  private let diagnosticBar = UIStackView()
  private let diagAppGroupPill = UILabel()
  private let diagAccessPill = UILabel()
  private let diagEnginePill = UILabel()
  private let diagMicPill = UILabel()
  private var dualDeliveryTimer: Timer?
  private var lastInsertedTranscriptionId: String?
  private static let lastConsumedTranscriptionIdKey = "com.typeeasy.lastConsumedTranscriptionId"
  private var persistedLastConsumedTranscriptionId: String? {
    get {
      return UserDefaults.standard.string(forKey: Self.lastConsumedTranscriptionIdKey)
    }
    set {
      if let newValue = newValue, !newValue.isEmpty {
        UserDefaults.standard.set(newValue, forKey: Self.lastConsumedTranscriptionIdKey)
      } else {
        UserDefaults.standard.removeObject(forKey: Self.lastConsumedTranscriptionIdKey)
      }
      UserDefaults.standard.synchronize()
    }
  }
  private var transcriptionReadyTokens: [DarwinObserverToken] = []
  // Ask AI button (commented out per request)
  private var toolbarVoiceCommandButton: UIButton?
  private var toolbarSettingsButton: UIButton!
  private var toolbarIsReady = false
  /// Which feature produced the current result bar (translate / grammar / voice).
  private var resultToolbarSource: ToolbarHighlight?
  /// Set while translate/grammar API is in flight.
  private var loadingToolbarHighlight: ToolbarHighlight?

  // MARK: - Mutually Exclusive Lower Container Mode
  private enum KeyboardLowerMode {
    case keys
    case translatePanel
    case grammarPanel
    case settingsPanel
  }
  private var lowerMode: KeyboardLowerMode = .keys

  private let keyGridStackView = UIStackView()
  private var keysStack: UIStackView { keyGridStackView }

  private let translatePanel = UIView()
  private let translateResultLabel = UILabel()
  private let translateInsertButton = UIButton(type: .system)

  private let grammarPanel = UIView()
  private let grammarResultLabel = UILabel()
  private let grammarInsertButton = UIButton(type: .system)

  private let voiceBar = UIStackView()
  private let voiceStatusLabel = UILabel()
  private let voiceStopButton = UIButton(type: .system)
  private let resultBar = UIStackView()
  private let resultLabel = UILabel()
  private let resultInsertButton = UIButton(type: .system)
  private let resultDismissButton = UIButton(type: .system)
  private enum KeyboardLayer { case alpha, shift, caps, symbols, moreSymbols }
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

  private class KeyboardLowerContainerView: UIView {
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
      if bounds.contains(point) { return true }
      for subview in subviews where !subview.isHidden && subview.isUserInteractionEnabled && subview.alpha > 0.01 {
        let subPoint = convert(point, to: subview)
        if subview.point(inside: subPoint, with: event) {
          return true
        }
      }
      return false
    }
  }

  private let lowerContainer = KeyboardLowerContainerView()
  private let panelsStack = UIStackView()
  private let settingsPanel = UIView()
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

  private let defaultStarterWords = ["I", "The", "Hi"]
  private let suggestionScroll = UIScrollView()
  private let suggestionRow = UIStackView()
  private let suggestionDivider = UIView()
  private var suggestionScrollHeightConstraint: NSLayoutConstraint?
  private var suggestionDividerHeightConstraint: NSLayoutConstraint?
  private var keyboardHeightConstraint: NSLayoutConstraint?
  private var isViewVisible = false
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
    ["123", "space", "↵"],
  ]

  private let symbolRows: [[String]] = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
    ["#+=", ".", ",", "?", "!", "'", "⌫"],
    ["ABC", "space", "↵"],
  ]

  private let moreSymbolRows: [[String]] = [
    ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="],
    ["_", "\\", "|", "~", "<", ">", "€", "£", "¥", "•"],
    ["123", ".", ",", "?", "!", "'", "⌫"],
    ["ABC", "space", "↵"],
  ]

  override func viewDidLoad() {
    super.viewDidLoad()
    // Apple UIKit: When hasDictationKey is false, the system dictation key (mic) at bottom-right is enabled.
    hasDictationKey = false
    // Lock self.inputView?.allowsSelfSizing to false
    inputView?.allowsSelfSizing = false

    // Make the entire keyboard extension view completely transparent
    view.backgroundColor = .clear
    inputView?.backgroundColor = .clear
    view.clipsToBounds = false
    inputView?.clipsToBounds = false
    view.isUserInteractionEnabled = true
    inputView?.isUserInteractionEnabled = true
    micController.delegate = self

    setupRootContainer()
    setupToolbar()
    setupSuggestionRow()
    setupLowerContainer()
    setupKeys()
    setupTranslatePanel()
    setupGrammarPanel()
    setupSettingsPanel()
    setupPanelsStack()
    // setupDiagnosticBar() // Hidden for clean production UI
    setupVoiceBar()
    setupResultBar()
    setupVoiceCommandPanel()
    setupEmojiPanel()
    setupSnackbar()
    applyTheme()
    reloadLanguagesFromSharedConfig()
    setLowerMode(.keys)
    KeyboardSharedConfig.markKeyboardActive()

    // Observe Darwin transcriptionReady notifications directly once
    let token = SharedIPCManager.shared.observeDarwinNotification(SharedIPCManager.notifyTranscriptionReady) { [weak self] in
      DispatchQueue.main.async {
        self?.consumeAndInsertPendingText()
      }
    }
    transcriptionReadyTokens = [token]
  }

  // MARK: - Single Static Total Height (292pt)
  //
  // Locked to a single permanent static total height across all states:
  //   • Top Action Bar: 44pt (Translate, Grammar, Settings ⚙️, Mic)
  //   • Predictive Suggestion Strip: 38pt (permanently visible starter/word chips)
  //   • Lower Area: 210pt (Key Grid 4 equal rows / Settings Overlay / Emoji Panel)
  // Total: 44 + 38 + 210 = 292pt
  //
  // Prevents keyboard bouncing up/down and ensures bottom spacebar row is never clipped.

  private static let staticKeyboardHeight: CGFloat = 292.0

  private func desiredKeyboardHeight() -> CGFloat {
    return Self.staticKeyboardHeight
  }

  override func updateViewConstraints() {
    super.updateViewConstraints()
    guard view.frame.width > 0 else { return }
    if keyboardHeightConstraint == nil {
      let c = view.heightAnchor.constraint(equalToConstant: Self.staticKeyboardHeight)
      c.priority = .required
      c.isActive = true
      keyboardHeightConstraint = c
    }
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.userInterfaceStyle != previousTraitCollection?.userInterfaceStyle {
      applyTheme()
    }
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    isViewVisible = true
    hostAppHandoffActive = false
    KeyboardSharedConfig.markKeyboardActive()
    applyTheme()
    applyAutoCapIfNewField()
    reloadLanguagesFromSharedConfig()
    updateSuggestions()

    // Consume pending background dictation transcription idempotently if available
    consumeAndInsertPendingText()
    updateDiagnosticBar()

    // Check for pending transcription or active dictation session only if waiting
    if isWaitingForDictation {
      let snap = KeyboardDictationStore.shared.snapshot()
      if snap.state == .completed || KeyboardDictationStore.shared.hasUnconsumedTranscription(maxAgeSeconds: 15) {
        consumePendingTranscriptionIfAvailable()
      } else if snap.state.isListeningOrRecording || snap.state == .requested || snap.state == .appOpened || snap.state == .transcribing {
        activeDictationRequestId = snap.requestId
        if let btn = toolbarMicButton {
          KeyboardTheme.updateMicButton(btn, isRecording: true)
        }
        startDictationPolling()
      } else {
        finishDictation()
      }
    } else {
      finishDictation()
    }

    resumeHostAppVoiceSessionsIfNeeded()
    resumeVoiceCommandSessionIfNeeded()
    startContextPolling()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    isViewVisible = true
    consumeAndInsertPendingText()
    updateDiagnosticBar()
    if isWaitingForDictation {
      consumePendingTranscriptionIfAvailable()
    }
    // Force a height re-evaluation once the view has its real frame.
    view.setNeedsUpdateConstraints()
    view.updateConstraintsIfNeeded()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    NSLog("[TypeEasyKeyboard] 👁️ viewWillDisappear. hostAppHandoffActive: %d", hostAppHandoffActive)
    isViewVisible = false
    dismissKeyPreview(immediate: true)
    dismissAlternativesPopup()

    // Always stop background timers when keyboard disappears to prevent sandbox crashes / signal 9 Jetsam kills
    stopContextPolling()
    suggestionDebounceTimer?.invalidate()
    suggestionDebounceTimer = nil
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    voiceCommandPollTimer?.invalidate()
    voiceCommandPollTimer = nil
    dualDeliveryTimer?.invalidate()
    dualDeliveryTimer = nil

    if !hostAppHandoffActive {
      KeyboardInlineSpeechDictation.shared.teardown(markCancelled: false)
      KeyboardInlineVoiceCommandRecorder.shared.cancel()
      KeyboardExtensionCloudDictation.shared.cancel()
    } else {
      NSLog("[TypeEasyKeyboard] ℹ️ Host app handoff is active; keeping dictation session alive.")
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    isViewVisible = false
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    contextPollTimer?.invalidate()
    contextPollTimer = nil
    dualDeliveryTimer?.invalidate()
    dualDeliveryTimer = nil
  }

  deinit {
    dictationPollTimer?.invalidate()
    suggestionDebounceTimer?.invalidate()
    contextPollTimer?.invalidate()
    voiceCommandPollTimer?.invalidate()
    dualDeliveryTimer?.invalidate()
    dualDeliveryTimer = nil
    transcriptionReadyTokens.removeAll()
  }

  private func setupRootContainer() {
    rootContainerView.translatesAutoresizingMaskIntoConstraints = false
    rootContainerView.backgroundColor = KeyboardTheme.keyboardBackground
    rootContainerView.isUserInteractionEnabled = true
    rootContainerView.clipsToBounds = false
    view.addSubview(rootContainerView)

    // Height constraint on view (once) + pin rootContainerView to all 4 edges of view
    let hc = view.heightAnchor.constraint(equalToConstant: Self.staticKeyboardHeight)
    hc.priority = .required
    hc.isActive = true
    keyboardHeightConstraint = hc

    NSLayoutConstraint.activate([
      rootContainerView.topAnchor.constraint(equalTo: view.topAnchor),
      rootContainerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      rootContainerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      rootContainerView.heightAnchor.constraint(equalToConstant: Self.staticKeyboardHeight),
    ])
  }

  private func setupToolbar() {
    toolbar.axis = .horizontal
    toolbar.alignment = .center
    toolbar.spacing = 4
    toolbar.distribution = .fill
    toolbar.backgroundColor = KeyboardTheme.toolbarBackground
    toolbar.layoutMargins = UIEdgeInsets(top: 2, left: 4, bottom: 2, right: 4)
    toolbar.isLayoutMarginsRelativeArrangement = true
    toolbar.translatesAutoresizingMaskIntoConstraints = false

    toolbarTranslateButton = KeyboardTheme.toolbarPillButton(
      icon: "文A",
      title: "Translate",
      iconColor: KeyboardTheme.primary
    )
    toolbarTranslateButton.addTarget(self, action: #selector(onTranslate), for: .touchUpInside)

    toolbarGrammarButton = KeyboardTheme.toolbarPillButton(
      icon: "A~",
      title: "Grammar",
      iconColor: KeyboardTheme.primary
    )
    toolbarGrammarButton.addTarget(self, action: #selector(onGrammar), for: .touchUpInside)

    // Ask AI (commented out per request)
    // toolbarVoiceCommandButton = KeyboardTheme.toolbarPillButton(
    //   icon: "✦",
    //   title: "Ask AI",
    //   iconColor: UIColor(red: 0xF5 / 255.0, green: 0x9E / 255.0, blue: 0x0B / 255.0, alpha: 1)
    // )
    // toolbarVoiceCommandButton?.addTarget(self, action: #selector(onVoiceCommand), for: .touchUpInside)

    toolbarSettingsButton = KeyboardTheme.toolbarSettingsButton()
    toolbarSettingsButton.addTarget(self, action: #selector(toggleSettings), for: .touchUpInside)

    toolbarMicButton = KeyboardTheme.toolbarRightMicButton()
    toolbarMicButton.addTarget(self, action: #selector(onVoice), for: .touchUpInside)

    var leftSubviews: [UIView] = [
      toolbarTranslateButton,
      toolbarGrammarButton,
    ]
    // Ask AI
    if let btn = toolbarVoiceCommandButton {
      leftSubviews.append(btn)
    }
    leftSubviews.append(toolbarSettingsButton)

    let leftGroup = UIStackView(arrangedSubviews: leftSubviews)
    leftGroup.axis = .horizontal
    leftGroup.spacing = 4
    leftGroup.alignment = .center
    leftGroup.translatesAutoresizingMaskIntoConstraints = false

    let spacer = UIView()
    spacer.translatesAutoresizingMaskIntoConstraints = false
    spacer.setContentHuggingPriority(UILayoutPriority(240), for: .horizontal)
    spacer.setContentCompressionResistancePriority(UILayoutPriority(240), for: .horizontal)

    toolbar.addArrangedSubview(leftGroup)
    toolbar.addArrangedSubview(spacer)
    toolbar.addArrangedSubview(toolbarMicButton)

    rootContainerView.addSubview(toolbar)
    toolbar.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      toolbar.topAnchor.constraint(equalTo: rootContainerView.topAnchor),
      toolbar.leadingAnchor.constraint(equalTo: rootContainerView.leadingAnchor),
      toolbar.trailingAnchor.constraint(equalTo: rootContainerView.trailingAnchor),
      toolbar.heightAnchor.constraint(equalToConstant: 44),
    ])
    toolbarIsReady = true
    refreshToolbarHighlight()
  }

  private func setupSuggestionRow() {
    suggestionScroll.translatesAutoresizingMaskIntoConstraints = false
    suggestionScroll.backgroundColor = KeyboardTheme.suggestionBackground
    suggestionScroll.showsHorizontalScrollIndicator = false
    suggestionScroll.alwaysBounceHorizontal = false
    suggestionScroll.isHidden = false
    suggestionScroll.clipsToBounds = true

    suggestionRow.axis = .horizontal
    suggestionRow.alignment = .center
    suggestionRow.spacing = 0
    suggestionRow.clipsToBounds = true
    suggestionRow.translatesAutoresizingMaskIntoConstraints = false
    suggestionScroll.addSubview(suggestionRow)

    suggestionDivider.backgroundColor = KeyboardTheme.suggestionDivider
    suggestionDivider.translatesAutoresizingMaskIntoConstraints = false
    suggestionDivider.isHidden = false
    suggestionScroll.addSubview(suggestionDivider)

    rootContainerView.addSubview(suggestionScroll)

    let scrollHeight = suggestionScroll.heightAnchor.constraint(equalToConstant: 38)
    scrollHeight.priority = .required
    scrollHeight.isActive = true
    suggestionScrollHeightConstraint = scrollHeight

    NSLayoutConstraint.activate([
      scrollHeight,
      suggestionScroll.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
      suggestionScroll.leadingAnchor.constraint(equalTo: rootContainerView.leadingAnchor),
      suggestionScroll.trailingAnchor.constraint(equalTo: rootContainerView.trailingAnchor),

      suggestionRow.leadingAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.leadingAnchor, constant: 8),
      suggestionRow.trailingAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.trailingAnchor, constant: -8),
      suggestionRow.topAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.topAnchor),
      suggestionRow.bottomAnchor.constraint(equalTo: suggestionScroll.contentLayoutGuide.bottomAnchor),
      suggestionRow.heightAnchor.constraint(equalTo: suggestionScroll.frameLayoutGuide.heightAnchor),

      suggestionDivider.leadingAnchor.constraint(equalTo: suggestionScroll.leadingAnchor),
      suggestionDivider.trailingAnchor.constraint(equalTo: suggestionScroll.trailingAnchor),
      suggestionDivider.bottomAnchor.constraint(equalTo: suggestionScroll.bottomAnchor),
      suggestionDivider.heightAnchor.constraint(equalToConstant: 0.5),
    ])
  }

  private func setupLowerContainer() {
    lowerContainer.translatesAutoresizingMaskIntoConstraints = false
    lowerContainer.backgroundColor = KeyboardTheme.keyboardBackground
    lowerContainer.clipsToBounds = false
    lowerContainer.isUserInteractionEnabled = true
    rootContainerView.addSubview(lowerContainer)

    NSLayoutConstraint.activate([
      lowerContainer.topAnchor.constraint(equalTo: suggestionScroll.bottomAnchor),
      lowerContainer.leadingAnchor.constraint(equalTo: rootContainerView.leadingAnchor),
      lowerContainer.trailingAnchor.constraint(equalTo: rootContainerView.trailingAnchor),
      lowerContainer.bottomAnchor.constraint(equalTo: rootContainerView.bottomAnchor),
    ])
  }

  // MARK: - Mutually Exclusive Mode Switching
  private func setLowerMode(_ mode: KeyboardLowerMode) {
    lowerMode = mode

    switch mode {
    case .keys:
      // Show ONLY keyGridStackView
      keyGridStackView.isHidden = isEmojiMode
      keyGridStackView.isUserInteractionEnabled = !isEmojiMode
      if !isEmojiMode {
        lowerContainer.bringSubviewToFront(keyGridStackView)
      }

      // Explicitly hide & disable all other panels
      translatePanel.isHidden = true
      translatePanel.isUserInteractionEnabled = false

      grammarPanel.isHidden = true
      grammarPanel.isUserInteractionEnabled = false

      settingsPanel.isHidden = true
      settingsPanel.isUserInteractionEnabled = false

      isSettingsVisible = false

      if isEmojiMode {
        emojiPanel.isHidden = false
        emojiPanel.isUserInteractionEnabled = true
        lowerContainer.bringSubviewToFront(emojiPanel)
      } else {
        emojiPanel.isHidden = true
        emojiPanel.isUserInteractionEnabled = false
      }

      let voiceActive = isWaitingForDictation || isCloudDictationRecording || voiceCommandPanel.isActive
      panelsStack.isHidden = !voiceActive
      panelsStack.isUserInteractionEnabled = voiceActive

    case .translatePanel:
      keyGridStackView.isHidden = true
      keyGridStackView.isUserInteractionEnabled = false

      translatePanel.isHidden = false
      translatePanel.isUserInteractionEnabled = true
      lowerContainer.bringSubviewToFront(translatePanel)

      grammarPanel.isHidden = true
      grammarPanel.isUserInteractionEnabled = false

      settingsPanel.isHidden = true
      settingsPanel.isUserInteractionEnabled = false

      emojiPanel.isHidden = true
      emojiPanel.isUserInteractionEnabled = false

      panelsStack.isHidden = true
      panelsStack.isUserInteractionEnabled = false
      isSettingsVisible = false

    case .grammarPanel:
      keyGridStackView.isHidden = true
      keyGridStackView.isUserInteractionEnabled = false

      grammarPanel.isHidden = false
      grammarPanel.isUserInteractionEnabled = true
      lowerContainer.bringSubviewToFront(grammarPanel)

      translatePanel.isHidden = true
      translatePanel.isUserInteractionEnabled = false

      settingsPanel.isHidden = true
      settingsPanel.isUserInteractionEnabled = false

      emojiPanel.isHidden = true
      emojiPanel.isUserInteractionEnabled = false

      panelsStack.isHidden = true
      panelsStack.isUserInteractionEnabled = false
      isSettingsVisible = false

    case .settingsPanel:
      keyGridStackView.isHidden = true
      keyGridStackView.isUserInteractionEnabled = false

      settingsPanel.isHidden = false
      settingsPanel.isUserInteractionEnabled = true
      lowerContainer.bringSubviewToFront(settingsPanel)

      translatePanel.isHidden = true
      translatePanel.isUserInteractionEnabled = false

      grammarPanel.isHidden = true
      grammarPanel.isUserInteractionEnabled = false

      emojiPanel.isHidden = true
      emojiPanel.isUserInteractionEnabled = false

      panelsStack.isHidden = true
      panelsStack.isUserInteractionEnabled = false
      isSettingsVisible = true
    }

    refreshToolbarHighlight()
    view.setNeedsLayout()
    view.layoutIfNeeded()
  }

  private func currentToolbarHighlight() -> ToolbarHighlight? {
    if lowerMode == .settingsPanel { return .settings }
    if lowerMode == .translatePanel { return .translate }
    if lowerMode == .grammarPanel { return .grammar }
    if voiceCommandPanel.isActive || isVoiceCommandSessionActive() { return .voiceCommand }
    if isWaitingForDictation || isCloudDictationRecording { return .voice }
    if let loading = loadingToolbarHighlight { return loading }
    return nil
  }

  private func refreshToolbarHighlight() {
    guard toolbarIsReady else { return }
    let active = currentToolbarHighlight()
    if let toolbarTranslateButton {
      KeyboardTheme.styleToolbarButton(
        toolbarTranslateButton, selected: active == .translate, kind: .text
      )
    }
    if let toolbarGrammarButton {
      KeyboardTheme.styleToolbarButton(
        toolbarGrammarButton, selected: active == .grammar, kind: .text
      )
    }
    if let toolbarMicButton {
      KeyboardTheme.styleToolbarButton(
        toolbarMicButton, selected: active == .voice, kind: .mic
      )
    }
    if let toolbarVoiceCommandButton {
      KeyboardTheme.styleToolbarButton(
        toolbarVoiceCommandButton, selected: active == .voiceCommand, kind: .voiceCommand
      )
    }
    if let toolbarSettingsButton {
      KeyboardTheme.styleToolbarButton(
        toolbarSettingsButton, selected: active == .settings, kind: .settings
      )
    }
  }

  private func setupPanelsStack() {
    panelsStack.axis = .vertical
    panelsStack.spacing = 0
    panelsStack.isHidden = true
    panelsStack.isUserInteractionEnabled = false
    panelsStack.translatesAutoresizingMaskIntoConstraints = false
    lowerContainer.addSubview(panelsStack)
    NSLayoutConstraint.activate([
      panelsStack.topAnchor.constraint(equalTo: lowerContainer.topAnchor),
      panelsStack.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor),
      panelsStack.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor),
    ])
  }

  // MARK: - Point 4 Diagnostic Status Strip (Hidden for Production)

  private func setupDiagnosticBar() {
    // Diagnostic debug pill bar commented out / removed from hierarchy for clean production UI
    diagnosticBar.isHidden = true
    /*
    diagnosticBar.axis = .horizontal
    diagnosticBar.spacing = 6
    diagnosticBar.distribution = .fillEqually
    diagnosticBar.alignment = .center
    diagnosticBar.translatesAutoresizingMaskIntoConstraints = false
    diagnosticBar.layoutMargins = UIEdgeInsets(top: 1, left: 6, bottom: 1, right: 6)
    diagnosticBar.isLayoutMarginsRelativeArrangement = true

    configureDiagPill(diagAppGroupPill)
    configureDiagPill(diagAccessPill)
    configureDiagPill(diagEnginePill)
    configureDiagPill(diagMicPill)

    diagnosticBar.addArrangedSubview(diagAppGroupPill)
    diagnosticBar.addArrangedSubview(diagAccessPill)
    diagnosticBar.addArrangedSubview(diagEnginePill)
    diagnosticBar.addArrangedSubview(diagMicPill)

    let tap = UITapGestureRecognizer(target: self, action: #selector(onDiagnosticBarTapped))
    diagnosticBar.addGestureRecognizer(tap)
    diagnosticBar.isUserInteractionEnabled = true

    panelsStack.addArrangedSubview(diagnosticBar)
    NSLayoutConstraint.activate([
      diagnosticBar.heightAnchor.constraint(equalToConstant: 18),
    ])

    updateDiagnosticBar()
    */
  }

  private func configureDiagPill(_ label: UILabel) {
    label.font = .systemFont(ofSize: 9, weight: .bold)
    label.textAlignment = .center
    label.layer.cornerRadius = 3
    label.clipsToBounds = true
  }

  @objc private func onDiagnosticBarTapped() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    SharedIPCManager.shared.sendPing(from: "keyboard")
    updateDiagnosticBar()
    let status = SharedIPCManager.shared.containerStatus
    showSnackbar("AppGroup: \(status) (\(SharedIPCManager.shared.activeSuiteName))")
  }

  public func updateDiagnosticBar() {
    guard !diagnosticBar.isHidden, diagnosticBar.superview != nil else { return }
    let groupOk = SharedIPCManager.shared.isAppGroupValid
    let status = SharedIPCManager.shared.containerStatus
    diagAppGroupPill.text = groupOk ? "GRP:OK" : (status == "NO_ENTITLEMENT" ? "GRP:NO_ENT" : "GRP:ERR")
    diagAppGroupPill.textColor = groupOk ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0) : .systemRed
    diagAppGroupPill.backgroundColor = groupOk ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.15) : UIColor.systemRed.withAlphaComponent(0.15)

    let accessOk = hasFullAccess
    diagAccessPill.text = accessOk ? "ACC:ON" : "ACC:OFF"
    diagAccessPill.textColor = accessOk ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0) : .systemOrange
    diagAccessPill.backgroundColor = accessOk ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.15) : UIColor.systemOrange.withAlphaComponent(0.15)

    let engineStatus = SharedIPCManager.shared.engineStatusText
    let engineOk = SharedIPCManager.shared.isAudioSessionReady || engineStatus == "RUN"
    diagEnginePill.text = "ENG:\(engineStatus)"
    if engineOk {
      diagEnginePill.textColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0)
      diagEnginePill.backgroundColor = UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 0.15)
    } else if engineStatus.hasPrefix("ERR") {
      diagEnginePill.textColor = .systemRed
      diagEnginePill.backgroundColor = UIColor.systemRed.withAlphaComponent(0.15)
    } else {
      diagEnginePill.textColor = UIColor(white: 0.5, alpha: 1.0)
      diagEnginePill.backgroundColor = UIColor(white: 1.0, alpha: 0.08)
    }

    let db = SharedIPCManager.shared.micLevelDb
    if engineOk && db > -100.0 {
      diagMicPill.text = String(format: "MIC:%.0fdB", db)
      diagMicPill.textColor = db > -50.0 ? UIColor(red: 0.13, green: 0.77, blue: 0.36, alpha: 1.0) : UIColor(white: 0.7, alpha: 1.0)
      diagMicPill.backgroundColor = UIColor(white: 1.0, alpha: 0.10)
    } else {
      let pingTime = SharedIPCManager.shared.lastPingTimestamp
      if pingTime > 0 {
        let age = Int(Date().timeIntervalSince1970 - pingTime)
        diagMicPill.text = "PNG:\(age)s"
      } else {
        diagMicPill.text = "MIC:IDLE"
      }
      diagMicPill.textColor = UIColor(white: 0.6, alpha: 1.0)
      diagMicPill.backgroundColor = UIColor(white: 1.0, alpha: 0.06)
    }
  }

  // MARK: - Point 1 Host App Detection & Return Handoff

  private func detectHostAppScheme() -> String? {
    let bundleID: String? = {
      if let parent = self.parent, parent.responds(to: Selector(("_hostBundleID"))) {
        return parent.value(forKey: "_hostBundleID") as? String
      }
      if self.responds(to: Selector(("_hostBundleID"))) {
        return self.value(forKey: "_hostBundleID") as? String
      }
      return nil
    }()

    guard let bundleID = bundleID?.lowercased() else { return nil }
    NSLog("[KeyboardViewController] 🔍 Detected hostBundleID: %@", bundleID)

    if bundleID.contains("whatsapp") { return "whatsapp" }
    if bundleID.contains("mobilesms") { return "sms" }
    if bundleID.contains("mobilenotes") { return "mobilenotes" }
    if bundleID.contains("gmail") { return "googlegmail" }
    if bundleID.contains("tweetie") || bundleID.contains("twitter") { return "twitter" }
    if bundleID.contains("instagram") { return "instagram" }
    if bundleID.contains("telegram") { return "tg" }
    if bundleID.contains("youtube") { return "youtube" }
    if bundleID.contains("chrome") { return "googlechrome" }
    if bundleID.contains("slack") { return "slack" }
    if bundleID.contains("preferences") { return "app-settings" }
    return nil
  }

  /// Walks the UIResponder chain up to UIApplication and calls open(_:options:completionHandler:)
  public func openContainingApp(_ url: URL) {
    var responder: UIResponder? = self
    var hops = 0
    while let current = responder, hops < 25 {
      hops += 1
      if let application = current as? UIApplication {
        NSLog("[KeyboardViewController] 🚀 Found UIApplication in responder chain (hop %d). Dispatching open(%@)", hops, url.absoluteString)
        DispatchQueue.main.async {
          application.open(url, options: [:]) { success in
            NSLog("[KeyboardViewController] 🔗 application.open result: %d", success)
            if !success {
              SharedIPCManager.shared.engineStatusText = "ERR:SCHEME"
            }
          }
        }
        return
      }
      responder = current.next
    }

    if let window = self.view.window, let application = window.next as? UIApplication {
      NSLog("[KeyboardViewController] 🚀 Found UIApplication via window.next. Dispatching open(%@)", url.absoluteString)
      DispatchQueue.main.async {
        application.open(url, options: [:]) { success in
          if !success {
            SharedIPCManager.shared.engineStatusText = "ERR:SCHEME"
          }
        }
      }
      return
    }

    if let appClass = NSClassFromString("UIApplication") as? NSObject.Type,
       let application = appClass.value(forKeyPath: "sharedApplication") as? UIApplication {
      NSLog("[KeyboardViewController] 🚀 Found UIApplication via reflection. Dispatching open(%@)", url.absoluteString)
      DispatchQueue.main.async {
        application.open(url, options: [:]) { success in
          if !success {
            SharedIPCManager.shared.engineStatusText = "ERR:SCHEME"
          }
        }
      }
      return
    }

    NSLog("[KeyboardViewController] ❌ Could not find UIApplication in responder chain (hops: %d).", hops)
    SharedIPCManager.shared.engineStatusText = "ERR:NO_APP"
    updateDiagnosticBar()
  }

  // MARK: - Idempotent Transcription Insertion

  /// Idempotently consumes any pending transcription from typeeasy_ipc.json.
  /// Deduplicates across apps via UserDefaults.standard and shared storage with strict 15s TTL.
  @discardableResult
  public func consumeAndInsertPendingText() -> Bool {
    assert(Thread.isMainThread, "consumeAndInsertPendingText must be executed on the main thread")

    let state = SharedIPCManager.shared.readState()
    var text = state.pendingText.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty {
      text = state.pendingTranscription.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // 1. If pendingText is empty, abort immediately
    guard !text.isEmpty else { return false }

    let transcriptionId = state.transcriptionId
    let persistedId = persistedLastConsumedTranscriptionId ?? ""
    let sharedId = state.lastConsumedTranscriptionId

    // 2. Safeguard 1: If transcriptionId was already consumed in RAM, in UserDefaults.standard,
    //    or in shared storage, abort immediately and ensure IPC storage is wiped.
    if !transcriptionId.isEmpty {
      let alreadyConsumed = (transcriptionId == lastInsertedTranscriptionId) ||
                            (transcriptionId == persistedId) ||
                            (transcriptionId == sharedId)
      if alreadyConsumed {
        NSLog("[KeyboardViewController] ⚠️ Skipping already-consumed transcription across apps (id: %@, persisted: %@, shared: %@)", transcriptionId, persistedId, sharedId)
        SharedIPCManager.shared.writeState {
          $0.pendingText = ""
          $0.pendingTranscription = ""
          $0.transcriptionId = ""
          $0.lastConsumedTranscriptionId = transcriptionId
          $0.isConsumed = true
        }
        return false
      }
    }

    // 3. Safeguard 2: Strict TTL expiration (maxAge = 15 seconds)
    let now = Date().timeIntervalSince1970
    let recordTime = state.createdAt > 0 ? state.createdAt : state.timestamp
    let age = (recordTime > 0) ? (now - recordTime) : 999.0
    if age > 15.0 {
      NSLog("[KeyboardViewController] ⏱️ Stale transcription discarded (age: %.1fs > 15s, text: '%@')", age, text)
      SharedIPCManager.shared.writeState {
        $0.pendingText = ""
        $0.pendingTranscription = ""
        $0.transcriptionId = ""
        $0.isConsumed = true
      }
      return false
    }

    // 4. Before calling textDocumentProxy.insertText, immediately save
    //    lastConsumedTranscriptionId to UserDefaults.standard AND overwrite
    //    typeeasy_ipc.json with pendingText = "" and transcriptionId = ""
    lastInsertedTranscriptionId = transcriptionId
    if !transcriptionId.isEmpty {
      persistedLastConsumedTranscriptionId = transcriptionId
    }

    SharedIPCManager.shared.writeState {
      $0.pendingText = ""
      $0.pendingTranscription = ""
      $0.transcriptionId = ""
      $0.lastConsumedTranscriptionId = transcriptionId
      $0.isConsumed = true
    }

    // 5. Only then call textDocumentProxy.insertText(text + " ")
    NSLog("[KeyboardViewController] 📥 Inserting transcription: '%@' (id: %@, age: %.2fs)", text, transcriptionId, age)
    textDocumentProxy.insertText(text + " ")
    showSnackbar("✓ Voice text inserted!")
    updateSuggestions()
    micController.updateState(.idle)
    dualDeliveryTimer?.invalidate()
    dualDeliveryTimer = nil
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    return true
  }

  // MARK: - Point 3 Dual Delivery Watchdog Timer

  private func startDualDeliveryWatchdog() {
    dualDeliveryTimer?.invalidate()
    dualDeliveryTimer = Timer.scheduledTimer(withTimeInterval: 0.20, repeats: true) { [weak self] timer in
      guard let self else {
        timer.invalidate()
        return
      }

      // Safeguard 3: Only poll while actively recording or waiting
      guard self.micController.currentState != .idle else {
        timer.invalidate()
        self.dualDeliveryTimer = nil
        return
      }

      if self.consumeAndInsertPendingText() {
        timer.invalidate()
        self.dualDeliveryTimer = nil
        return
      }
    }
  }

  private func makeKeyboardReturnButton(action: Selector) -> UIButton {
    let button = UIButton(type: .system)
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)
    let icon = UIImage(systemName: "keyboard.chevron.compact.down", withConfiguration: config)
      ?? UIImage(systemName: "keyboard", withConfiguration: config)
    button.setImage(icon, for: .normal)
    button.tintColor = KeyboardTheme.primary
    button.backgroundColor = .white
    button.layer.cornerRadius = 8
    button.layer.borderWidth = 1
    button.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    button.translatesAutoresizingMaskIntoConstraints = false
    button.isUserInteractionEnabled = true
    button.clipsToBounds = false
    NSLayoutConstraint.activate([
      button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
      button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
    button.addTarget(self, action: action, for: .touchUpInside)
    return button
  }

  private func setupTranslatePanel() {
    translatePanel.translatesAutoresizingMaskIntoConstraints = false
    translatePanel.backgroundColor = KeyboardTheme.keyboardBackground
    translatePanel.clipsToBounds = false
    translatePanel.isHidden = true
    translatePanel.isUserInteractionEnabled = false
    lowerContainer.addSubview(translatePanel)

    NSLayoutConstraint.activate([
      translatePanel.topAnchor.constraint(equalTo: lowerContainer.topAnchor),
      translatePanel.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor),
      translatePanel.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor),
      translatePanel.bottomAnchor.constraint(equalTo: lowerContainer.bottomAnchor),
    ])

    let mainStack = UIStackView()
    mainStack.axis = .vertical
    mainStack.spacing = 6
    mainStack.isUserInteractionEnabled = true
    mainStack.clipsToBounds = false
    mainStack.translatesAutoresizingMaskIntoConstraints = false
    mainStack.layoutMargins = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    mainStack.isLayoutMarginsRelativeArrangement = true
    translatePanel.addSubview(mainStack)

    NSLayoutConstraint.activate([
      mainStack.topAnchor.constraint(equalTo: translatePanel.topAnchor),
      mainStack.leadingAnchor.constraint(equalTo: translatePanel.leadingAnchor),
      mainStack.trailingAnchor.constraint(equalTo: translatePanel.trailingAnchor),
      mainStack.bottomAnchor.constraint(equalTo: translatePanel.bottomAnchor),
    ])

    // Top Header: "文A Translation" + Keyboard Return Button
    let headerBar = UIStackView()
    headerBar.axis = .horizontal
    headerBar.alignment = .center
    headerBar.spacing = 8
    headerBar.isUserInteractionEnabled = true
    headerBar.translatesAutoresizingMaskIntoConstraints = false
    headerBar.heightAnchor.constraint(equalToConstant: 44).isActive = true

    let titleLabel = UILabel()
    titleLabel.text = "文A  Translation"
    titleLabel.font = .systemFont(ofSize: 13.5, weight: .bold)
    titleLabel.textColor = KeyboardTheme.primary

    let backButton = makeKeyboardReturnButton(action: #selector(backToKeysTapped))

    headerBar.addArrangedSubview(titleLabel)
    headerBar.addArrangedSubview(UIView())
    headerBar.addArrangedSubview(backButton)

    // Result Card
    let cardView = UIView()
    cardView.backgroundColor = .white
    cardView.layer.cornerRadius = 8
    cardView.layer.borderWidth = 1
    cardView.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    cardView.translatesAutoresizingMaskIntoConstraints = false
    cardView.clipsToBounds = true

    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.showsVerticalScrollIndicator = true

    translateResultLabel.font = .systemFont(ofSize: 15, weight: .medium)
    translateResultLabel.textColor = KeyboardTheme.keyText
    translateResultLabel.numberOfLines = 0
    translateResultLabel.translatesAutoresizingMaskIntoConstraints = false

    scroll.addSubview(translateResultLabel)
    cardView.addSubview(scroll)

    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 6),
      scroll.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
      scroll.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),
      scroll.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -6),

      translateResultLabel.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      translateResultLabel.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      translateResultLabel.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      translateResultLabel.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      translateResultLabel.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
    ])

    // Bottom Action Row
    let actionBar = UIStackView()
    actionBar.axis = .horizontal
    actionBar.alignment = .center
    actionBar.spacing = 8
    actionBar.translatesAutoresizingMaskIntoConstraints = false
    actionBar.heightAnchor.constraint(equalToConstant: 38).isActive = true

    translateInsertButton.setTitle("↙ Insert Translation", for: .normal)
    translateInsertButton.setTitleColor(.white, for: .normal)
    translateInsertButton.titleLabel?.font = .systemFont(ofSize: 13.5, weight: .bold)
    translateInsertButton.backgroundColor = KeyboardTheme.primary
    translateInsertButton.layer.cornerRadius = 8
    translateInsertButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 14, bottom: 6, right: 14)
    translateInsertButton.translatesAutoresizingMaskIntoConstraints = false
    translateInsertButton.heightAnchor.constraint(equalToConstant: 36).isActive = true
    translateInsertButton.addTarget(self, action: #selector(insertTranslateResult), for: .touchUpInside)

    let dismissBtn = UIButton(type: .system)
    dismissBtn.setTitle("Dismiss", for: .normal)
    dismissBtn.setTitleColor(KeyboardTheme.hintText, for: .normal)
    dismissBtn.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    dismissBtn.translatesAutoresizingMaskIntoConstraints = false
    dismissBtn.addTarget(self, action: #selector(backToKeysTapped), for: .touchUpInside)

    actionBar.addArrangedSubview(translateInsertButton)
    actionBar.addArrangedSubview(UIView())
    actionBar.addArrangedSubview(dismissBtn)

    mainStack.addArrangedSubview(headerBar)
    mainStack.addArrangedSubview(cardView)
    mainStack.addArrangedSubview(actionBar)
    mainStack.bringSubviewToFront(headerBar)
  }

  private func setupGrammarPanel() {
    grammarPanel.translatesAutoresizingMaskIntoConstraints = false
    grammarPanel.backgroundColor = KeyboardTheme.keyboardBackground
    grammarPanel.clipsToBounds = false
    grammarPanel.isHidden = true
    grammarPanel.isUserInteractionEnabled = false
    lowerContainer.addSubview(grammarPanel)

    NSLayoutConstraint.activate([
      grammarPanel.topAnchor.constraint(equalTo: lowerContainer.topAnchor),
      grammarPanel.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor),
      grammarPanel.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor),
      grammarPanel.bottomAnchor.constraint(equalTo: lowerContainer.bottomAnchor),
    ])

    let mainStack = UIStackView()
    mainStack.axis = .vertical
    mainStack.spacing = 6
    mainStack.isUserInteractionEnabled = true
    mainStack.clipsToBounds = false
    mainStack.translatesAutoresizingMaskIntoConstraints = false
    mainStack.layoutMargins = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    mainStack.isLayoutMarginsRelativeArrangement = true
    grammarPanel.addSubview(mainStack)

    NSLayoutConstraint.activate([
      mainStack.topAnchor.constraint(equalTo: grammarPanel.topAnchor),
      mainStack.leadingAnchor.constraint(equalTo: grammarPanel.leadingAnchor),
      mainStack.trailingAnchor.constraint(equalTo: grammarPanel.trailingAnchor),
      mainStack.bottomAnchor.constraint(equalTo: grammarPanel.bottomAnchor),
    ])

    // Top Header: "A~ Grammar Check" + Keyboard Return Button
    let headerBar = UIStackView()
    headerBar.axis = .horizontal
    headerBar.alignment = .center
    headerBar.spacing = 8
    headerBar.isUserInteractionEnabled = true
    headerBar.translatesAutoresizingMaskIntoConstraints = false
    headerBar.heightAnchor.constraint(equalToConstant: 44).isActive = true

    let titleLabel = UILabel()
    titleLabel.text = "A~  Grammar Check"
    titleLabel.font = .systemFont(ofSize: 13.5, weight: .bold)
    titleLabel.textColor = KeyboardTheme.primary

    let backButton = makeKeyboardReturnButton(action: #selector(backToKeysTapped))

    headerBar.addArrangedSubview(titleLabel)
    headerBar.addArrangedSubview(UIView())
    headerBar.addArrangedSubview(backButton)

    // Result Card
    let cardView = UIView()
    cardView.backgroundColor = .white
    cardView.layer.cornerRadius = 8
    cardView.layer.borderWidth = 1
    cardView.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    cardView.translatesAutoresizingMaskIntoConstraints = false
    cardView.clipsToBounds = true

    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.showsVerticalScrollIndicator = true

    grammarResultLabel.font = .systemFont(ofSize: 15, weight: .medium)
    grammarResultLabel.textColor = KeyboardTheme.keyText
    grammarResultLabel.numberOfLines = 0
    grammarResultLabel.translatesAutoresizingMaskIntoConstraints = false

    scroll.addSubview(grammarResultLabel)
    cardView.addSubview(scroll)

    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 6),
      scroll.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
      scroll.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),
      scroll.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -6),

      grammarResultLabel.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      grammarResultLabel.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      grammarResultLabel.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      grammarResultLabel.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      grammarResultLabel.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
    ])

    // Bottom Action Row
    let actionBar = UIStackView()
    actionBar.axis = .horizontal
    actionBar.alignment = .center
    actionBar.spacing = 8
    actionBar.translatesAutoresizingMaskIntoConstraints = false
    actionBar.heightAnchor.constraint(equalToConstant: 38).isActive = true

    grammarInsertButton.setTitle("↙ Insert Correction", for: .normal)
    grammarInsertButton.setTitleColor(.white, for: .normal)
    grammarInsertButton.titleLabel?.font = .systemFont(ofSize: 13.5, weight: .bold)
    grammarInsertButton.backgroundColor = KeyboardTheme.primary
    grammarInsertButton.layer.cornerRadius = 8
    grammarInsertButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 14, bottom: 6, right: 14)
    grammarInsertButton.translatesAutoresizingMaskIntoConstraints = false
    grammarInsertButton.heightAnchor.constraint(equalToConstant: 36).isActive = true
    grammarInsertButton.addTarget(self, action: #selector(insertGrammarResult), for: .touchUpInside)

    let dismissBtn = UIButton(type: .system)
    dismissBtn.setTitle("Dismiss", for: .normal)
    dismissBtn.setTitleColor(KeyboardTheme.hintText, for: .normal)
    dismissBtn.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    dismissBtn.translatesAutoresizingMaskIntoConstraints = false
    dismissBtn.addTarget(self, action: #selector(backToKeysTapped), for: .touchUpInside)

    actionBar.addArrangedSubview(grammarInsertButton)
    actionBar.addArrangedSubview(UIView())
    actionBar.addArrangedSubview(dismissBtn)

    mainStack.addArrangedSubview(headerBar)
    mainStack.addArrangedSubview(cardView)
    mainStack.addArrangedSubview(actionBar)
    mainStack.bringSubviewToFront(headerBar)
  }

  private func setupSettingsPanel() {
    settingsPanel.translatesAutoresizingMaskIntoConstraints = false
    settingsPanel.backgroundColor = KeyboardTheme.keyboardBackground
    settingsPanel.clipsToBounds = false
    settingsPanel.isHidden = true
    settingsPanel.isUserInteractionEnabled = true
    lowerContainer.addSubview(settingsPanel)

    NSLayoutConstraint.activate([
      settingsPanel.topAnchor.constraint(equalTo: lowerContainer.topAnchor),
      settingsPanel.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor),
      settingsPanel.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor),
      settingsPanel.bottomAnchor.constraint(equalTo: lowerContainer.bottomAnchor),
    ])

    // Top Header: Title + Keyboard Return Button
    let headerBar = UIStackView()
    headerBar.axis = .horizontal
    headerBar.alignment = .center
    headerBar.spacing = 8
    headerBar.isUserInteractionEnabled = true
    headerBar.translatesAutoresizingMaskIntoConstraints = false
    headerBar.layoutMargins = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
    headerBar.isLayoutMarginsRelativeArrangement = true

    let titleLabel = UILabel()
    titleLabel.text = "Language Settings"
    titleLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    titleLabel.textColor = KeyboardTheme.keyText

    let doneButton = makeKeyboardReturnButton(action: #selector(backToKeysTapped))

    headerBar.addArrangedSubview(titleLabel)
    headerBar.addArrangedSubview(UIView())
    headerBar.addArrangedSubview(doneButton)

    // Translation Selector row: "Translation:" [From] [⇄] [To]
    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 8
    row.translatesAutoresizingMaskIntoConstraints = false
    row.layoutMargins = UIEdgeInsets(top: 2, left: 12, bottom: 2, right: 12)
    row.isLayoutMarginsRelativeArrangement = true

    let label = UILabel()
    label.text = "Translation :"
    label.font = .boldSystemFont(ofSize: 13)
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

    // Language picker table container
    languagePickerContainer.isHidden = true
    languagePickerContainer.translatesAutoresizingMaskIntoConstraints = false
    languagePickerContainer.backgroundColor = .white
    languagePickerContainer.layer.cornerRadius = 8
    languagePickerContainer.layer.borderWidth = 1
    languagePickerContainer.layer.borderColor = UIColor(red: 0xDA / 255.0, green: 0xDD / 255.0, blue: 0xE8 / 255.0, alpha: 1).cgColor
    languagePickerContainer.clipsToBounds = true

    languageTableView.dataSource = self
    languageTableView.delegate = self
    languageTableView.rowHeight = 38
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

    let settingsStack = UIStackView(arrangedSubviews: [headerBar, row, languagePickerContainer])
    settingsStack.axis = .vertical
    settingsStack.spacing = 4
    settingsStack.isUserInteractionEnabled = true
    settingsStack.clipsToBounds = false
    settingsStack.translatesAutoresizingMaskIntoConstraints = false
    settingsPanel.addSubview(settingsStack)

    NSLayoutConstraint.activate([
      headerBar.heightAnchor.constraint(equalToConstant: 44),
      row.heightAnchor.constraint(equalToConstant: 36),

      settingsStack.topAnchor.constraint(equalTo: settingsPanel.topAnchor, constant: 4),
      settingsStack.leadingAnchor.constraint(equalTo: settingsPanel.leadingAnchor, constant: 6),
      settingsStack.trailingAnchor.constraint(equalTo: settingsPanel.trailingAnchor, constant: -6),
      settingsStack.bottomAnchor.constraint(lessThanOrEqualTo: settingsPanel.bottomAnchor, constant: -4),
    ])

    settingsPanel.bringSubviewToFront(settingsStack)
    settingsStack.bringSubviewToFront(headerBar)
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
    voiceBar.backgroundColor = KeyboardTheme.voiceBarBackground
    voiceBar.isHidden = true
    voiceBar.translatesAutoresizingMaskIntoConstraints = false
    voiceBar.layoutMargins = UIEdgeInsets(top: 4, left: 12, bottom: 4, right: 12)
    voiceBar.isLayoutMarginsRelativeArrangement = true

    let tap = UITapGestureRecognizer(target: self, action: #selector(onVoiceBarTapped))
    voiceBar.addGestureRecognizer(tap)

    let micView = KeyboardTheme.voiceBarMicView()
    micView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      micView.widthAnchor.constraint(equalToConstant: 22),
      micView.heightAnchor.constraint(equalToConstant: 22),
    ])

    voiceStatusLabel.text = "Listening…"
    voiceStatusLabel.font = .systemFont(ofSize: 12.5, weight: .medium)
    voiceStatusLabel.textColor = KeyboardTheme.keyText
    voiceStatusLabel.numberOfLines = 2
    voiceStatusLabel.lineBreakMode = .byWordWrapping
    voiceStatusLabel.adjustsFontSizeToFitWidth = true
    voiceStatusLabel.minimumScaleFactor = 0.85
    voiceStatusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    voiceStatusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)

    voiceStopButton.setTitle("✕", for: .normal)
    voiceStopButton.setTitleColor(KeyboardTheme.hintText, for: .normal)
    voiceStopButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    voiceStopButton.addTarget(self, action: #selector(stopVoice), for: .touchUpInside)
    voiceStopButton.isHidden = true
    voiceStopButton.translatesAutoresizingMaskIntoConstraints = false
    voiceStopButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    voiceStopButton.setContentHuggingPriority(.required, for: .horizontal)
    NSLayoutConstraint.activate([
      voiceStopButton.widthAnchor.constraint(equalToConstant: 32),
      voiceStopButton.heightAnchor.constraint(equalToConstant: 32),
    ])

    voiceBar.addArrangedSubview(micView)
    voiceBar.addArrangedSubview(voiceStatusLabel)
    voiceBar.addArrangedSubview(voiceStopButton)

    let voiceBarHeight = voiceBar.heightAnchor.constraint(greaterThanOrEqualToConstant: 50)
    voiceBarHeight.priority = UILayoutPriority(999)
    voiceBarHeight.isActive = true
    panelsStack.addArrangedSubview(voiceBar)
  }

  @objc private func onVoiceBarTapped() {
    guard let requestId = activeDictationRequestId else { return }
    hostAppHandoffActive = true
    KeyboardHostLink.openVoice(requestId: requestId, extensionContext: extensionContext)
  }

  private func setupVoiceCommandPanel() {
    voiceCommandPanel.delegate = self
    panelsStack.addArrangedSubview(voiceCommandPanel)
    let vcpHeight = voiceCommandPanel.heightAnchor.constraint(greaterThanOrEqualToConstant: 52)
    vcpHeight.priority = UILayoutPriority(999)
    vcpHeight.isActive = true
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

    resultLabel.font = .systemFont(ofSize: 13, weight: .medium)
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
    resultDismissButton.setTitleColor(KeyboardTheme.hintText, for: .normal)
    resultDismissButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    resultDismissButton.addTarget(self, action: #selector(hideResult), for: .touchUpInside)
    resultDismissButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    resultDismissButton.setContentHuggingPriority(.required, for: .horizontal)

    resultBar.addArrangedSubview(resultLabel)
    resultBar.addArrangedSubview(resultInsertButton)
    resultBar.addArrangedSubview(resultDismissButton)

    let resHeight = resultBar.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
    resHeight.priority = UILayoutPriority(999)
    resHeight.isActive = true
    resultInsertButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 76).isActive = true
    panelsStack.addArrangedSubview(resultBar)
  }

  private func setupEmojiPanel() {
    emojiPanel.backgroundColor = KeyboardTheme.keyboardBackground
    emojiPanel.isHidden = true
    emojiPanel.translatesAutoresizingMaskIntoConstraints = false
    lowerContainer.addSubview(emojiPanel)

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
    NSLayoutConstraint.activate([bottomRow.heightAnchor.constraint(equalToConstant: 36)])

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
      emojiPanel.topAnchor.constraint(equalTo: lowerContainer.topAnchor),
      emojiPanel.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor),
      emojiPanel.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor),
      emojiPanel.bottomAnchor.constraint(equalTo: lowerContainer.bottomAnchor),

      tabScroll.topAnchor.constraint(equalTo: emojiPanel.topAnchor),
      tabScroll.leadingAnchor.constraint(equalTo: emojiPanel.leadingAnchor),
      tabScroll.trailingAnchor.constraint(equalTo: emojiPanel.trailingAnchor),
      tabScroll.heightAnchor.constraint(equalToConstant: 36),

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
      btn.titleLabel?.font = .systemFont(ofSize: 18)
      btn.tintColor = KeyboardTheme.keyText
      btn.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        btn.widthAnchor.constraint(equalToConstant: 40),
        btn.heightAnchor.constraint(equalToConstant: 36),
      ])
      btn.tag = index
      btn.addTarget(self, action: #selector(emojiTabTapped(_:)), for: .touchUpInside)
      tabRow.addArrangedSubview(btn)
      return btn
    }
  }

  private func setupKeys() {
    keyGridStackView.axis = .vertical
    keyGridStackView.spacing = 6
    keyGridStackView.distribution = .fillEqually
    keyGridStackView.isUserInteractionEnabled = true
    keyGridStackView.clipsToBounds = false
    keyGridStackView.translatesAutoresizingMaskIntoConstraints = false
    lowerContainer.addSubview(keyGridStackView)

    let top = keyGridStackView.topAnchor.constraint(equalTo: lowerContainer.topAnchor, constant: 2)
    let lead = keyGridStackView.leadingAnchor.constraint(equalTo: lowerContainer.leadingAnchor, constant: 3)
    let trail = keyGridStackView.trailingAnchor.constraint(equalTo: lowerContainer.trailingAnchor, constant: -3)
    let bot = keyGridStackView.bottomAnchor.constraint(equalTo: lowerContainer.bottomAnchor, constant: -2)
    top.priority = .required
    lead.priority = .required
    trail.priority = .required
    bot.priority = .required

    NSLayoutConstraint.activate([top, lead, trail, bot])

    renderKeys()
  }

  private var currentKeyRows: [[String]] {
    switch keyboardLayer {
    case .symbols:
      return symbolRows
    case .moreSymbols:
      return moreSymbolRows
    default:
      return alphaRows
    }
  }

  private var isUppercaseLayer: Bool {
    keyboardLayer == .shift || keyboardLayer == .caps
  }

  private func renderKeys() {
    keyGridStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }
    let rows = currentKeyRows

    rows.enumerated().forEach { rowIndex, row in
      let rowStack = UIStackView()
      rowStack.axis = .horizontal
      rowStack.spacing = 6
      rowStack.isUserInteractionEnabled = true
      rowStack.clipsToBounds = false
      rowStack.translatesAutoresizingMaskIntoConstraints = false

      if rowIndex == 0 {
        rowStack.distribution = .fillEqually
        row.forEach { logical in
          rowStack.addArrangedSubview(makeKeyView(logical: logical, rowIndex: rowIndex))
        }
      } else if rowIndex == 1 {
        rowStack.distribution = .fillEqually
        if row.count == 9 {
          rowStack.layoutMargins = UIEdgeInsets(top: 0, left: 19, bottom: 0, right: 19)
          rowStack.isLayoutMarginsRelativeArrangement = true
        }
        row.forEach { logical in
          rowStack.addArrangedSubview(makeKeyView(logical: logical, rowIndex: rowIndex))
        }
      } else if rowIndex == 2 {
        rowStack.distribution = .fill
        var middleViews: [UIView] = []
        var leftActionView: UIView?
        var rightActionView: UIView?

        row.forEach { logical in
          let keyView = makeKeyView(logical: logical, rowIndex: rowIndex)
          rowStack.addArrangedSubview(keyView)
          if logical == "⇧" || (logical == "#+=" && rowIndex == 2) || (logical == "123" && rowIndex == 2) {
            leftActionView = keyView
          } else if logical == "⌫" {
            rightActionView = keyView
          } else {
            middleViews.append(keyView)
          }
        }

        // All 7 middle keys in Row 2 have equal width
        for i in 1..<middleViews.count {
          middleViews[i].widthAnchor.constraint(equalTo: middleViews[0].widthAnchor).isActive = true
        }
        // Shift and Delete have equal width and are 1.35x of middle letter keys
        if let leftActionView = leftActionView, let rightActionView = rightActionView, let firstMiddle = middleViews.first {
          leftActionView.widthAnchor.constraint(equalTo: rightActionView.widthAnchor).isActive = true
          leftActionView.widthAnchor.constraint(equalTo: firstMiddle.widthAnchor, multiplier: 1.35).isActive = true
        }
      } else {
        // Row 3 (Bottom): [123/ABC] [Space: "TypeEasy"] [Search / return]
        rowStack.distribution = .fill
        var numView: UIView?
        var spaceView: UIView?
        var returnView: UIView?

        row.forEach { logical in
          let keyView = makeKeyView(logical: logical, rowIndex: rowIndex)
          rowStack.addArrangedSubview(keyView)
          if logical == "123" || logical == "ABC" || logical == "?123" {
            numView = keyView
          } else if logical == "space" {
            spaceView = keyView
          } else if logical == "↵" {
            returnView = keyView
          }
        }

        if let numView = numView, let returnView = returnView {
          numView.widthAnchor.constraint(equalToConstant: 86).isActive = true
          returnView.widthAnchor.constraint(equalTo: numView.widthAnchor).isActive = true
        } else {
          numView?.widthAnchor.constraint(equalToConstant: 86).isActive = true
          returnView?.widthAnchor.constraint(equalToConstant: 86).isActive = true
        }
        spaceView?.setContentHuggingPriority(UILayoutPriority(249), for: .horizontal)
        spaceView?.setContentCompressionResistancePriority(UILayoutPriority(249), for: .horizontal)
      }

      keysStack.addArrangedSubview(rowStack)
    }
  }

  private func isActionKey(_ logical: String) -> Bool {
    return ["⇧", "⌫", "123", "?123", "ABC", "#+=", "😊", "🌐"].contains(logical)
  }

  private func returnKeyTitle() -> String {
    guard let returnType = textDocumentProxy.returnKeyType else {
      return "Search"
    }
    switch returnType {
    case .go: return "Go"
    case .google, .yahoo, .search: return "Search"
    case .join: return "Join"
    case .next: return "Next"
    case .route: return "Route"
    case .send: return "Send"
    case .done: return "Done"
    case .emergencyCall: return "SOS"
    case .continue: return "Continue"
    default: return "Search"
    }
  }

  private func isReturnKeyPrimary() -> Bool {
    return true
  }

  private func keyDisplay(for logical: String) -> String {
    switch logical {
    case "space":
      return "TypeEasy"
    case "↵":
      return returnKeyTitle()
    default:
      if isUppercaseLayer, logical.count == 1, logical.first?.isLetter == true {
        return logical.uppercased()
      }
      return logical.lowercased()
    }
  }

  private func keyFontSize(for logical: String) -> CGFloat {
    switch logical {
    case "space":
      return 15
    case "123", "?123", "ABC", "#+=":
      return 16
    case "😊":
      return 18
    case "↵":
      return 16
    case "⇧", "⌫":
      return 18
    default:
      return 24
    }
  }

  private func makeKeyView(logical: String, rowIndex: Int) -> UIView {
    let display = keyDisplay(for: logical)
    return makeKeyButton(logical: logical, display: display)
  }

  private func makeKeyButton(logical: String, display: String) -> UIView {
    let wrapper = UIControl()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.isUserInteractionEnabled = true
    wrapper.clipsToBounds = false
    let button = UIButton(type: .custom)
    let isEnter = logical == "↵"
    let isSpace = logical == "space"
    let isShift = logical == "⇧"
    let isBksp = logical == "⌫"
    let isShiftOn = isShift && keyboardLayer == .shift
    let isCapsOn = isShift && keyboardLayer == .caps

    let bgColor: UIColor
    let fgColor: UIColor

    if isEnter {
      bgColor = KeyboardTheme.primary
      fgColor = .white
    } else if isShiftOn || isCapsOn {
      bgColor = KeyboardTheme.keyLetterBackground
      fgColor = KeyboardTheme.keyText
    } else if isSpace {
      bgColor = KeyboardTheme.keyLetterBackground
      fgColor = KeyboardTheme.hintText
    } else if isActionKey(logical) {
      bgColor = KeyboardTheme.keyActionBackground
      fgColor = KeyboardTheme.keyText
    } else {
      bgColor = KeyboardTheme.keyLetterBackground
      fgColor = KeyboardTheme.keyText
    }

    button.backgroundColor = bgColor
    button.layer.cornerRadius = 5.0
    button.layer.shadowColor = KeyboardTheme.keyShadowColor.cgColor
    button.layer.shadowOpacity = KeyboardTheme.keyShadowOpacity
    button.layer.shadowRadius = 0
    button.layer.shadowOffset = CGSize(width: 0, height: 1)
    button.layer.masksToBounds = false
    button.isUserInteractionEnabled = false
    button.translatesAutoresizingMaskIntoConstraints = false

    if isShift {
      let iconName: String
      if isCapsOn {
        iconName = "capslock.fill"
      } else {
        iconName = "arrow.up"
      }
      let config = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
      let image = UIImage(systemName: iconName, withConfiguration: config)
      button.setImage(image, for: .normal)
      button.tintColor = fgColor
    } else if isBksp {
      let config = UIImage.SymbolConfiguration(pointSize: 17, weight: .regular)
      let image = UIImage(systemName: "delete.backward", withConfiguration: config)
      button.setImage(image, for: .normal)
      button.tintColor = fgColor
    } else if isEnter {
      button.setTitle(display, for: .normal)
      button.setTitleColor(.white, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
    } else if logical == "🌐" {
      let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
      let image = UIImage(systemName: "globe", withConfiguration: config)
      button.setImage(image, for: .normal)
      button.tintColor = fgColor
      wrapper.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
    } else {
      button.setTitle(display, for: .normal)
      button.setTitleColor(fgColor, for: .normal)
      button.titleLabel?.font = .systemFont(
        ofSize: keyFontSize(for: logical),
        weight: isSpace ? .regular : (isActionKey(logical) ? .regular : .regular)
      )
    }

    wrapper.addSubview(button)
    NSLayoutConstraint.activate([
      button.topAnchor.constraint(equalTo: wrapper.topAnchor),
      button.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
      button.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
      button.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
    ])
    attachKeyTouchHandlers(to: wrapper, button: button, logical: logical, previewLabel: display)
    return wrapper
  }

  private func attachKeyTouchHandlers(to wrapper: UIControl, button: UIButton, logical: String, previewLabel: String) {
    let isLetterOrChar = logical.count == 1 && !isActionKey(logical) && logical != "space" && logical != "↵"

    let touchDown = UIAction { [weak self, weak wrapper, weak button] _ in
      guard let self, let wrapper, let button else { return }
      self.dismissAlternativesPopup()
      if isLetterOrChar {
        self.showKeyPreview(previewLabel, anchor: button)
      }
      self.longPressWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self, weak wrapper] in
        guard let self, let wrapper else { return }
        self.suppressNextKeyUp = true
        self.dismissKeyPreview(immediate: true)
        if logical == "⌫" {
          self.clearAllInputText()
        } else if isLetterOrChar, KeyboardKeyAlternatives.map[logical] != nil {
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
      if let before = proxy.documentContextBeforeInput, before.hasSuffix(" ") && !before.hasSuffix("  ") && before.count >= 2 {
        let prevChar = before[before.index(before.endIndex, offsetBy: -2)]
        if prevChar.isLetter || prevChar.isNumber {
          proxy.deleteBackward()
          proxy.insertText(". ")
          checkAutoCap()
          if keyboardLayer == .shift {
            keyboardLayer = .alpha
            renderKeys()
          }
          break
        }
      }
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
      case .caps, .symbols, .moreSymbols: keyboardLayer = .alpha
      }
      renderKeys()
    case "123", "?123":
      if keyboardLayer == .moreSymbols {
        keyboardLayer = .symbols
      } else if keyboardLayer == .symbols {
        keyboardLayer = .alpha
      } else {
        keyboardLayer = .symbols
      }
      renderKeys()
    case "#+=":
      keyboardLayer = .moreSymbols
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
    rootContainerView.backgroundColor = KeyboardTheme.keyboardBackground
    toolbar.backgroundColor = KeyboardTheme.toolbarBackground
    suggestionScroll.backgroundColor = KeyboardTheme.suggestionBackground
    suggestionDivider.backgroundColor = KeyboardTheme.suggestionDivider
    voiceBar.backgroundColor = KeyboardTheme.voiceBarBackground
    resultBar.backgroundColor = KeyboardTheme.keyboardBackground
    translatePanel.backgroundColor = KeyboardTheme.keyboardBackground
    grammarPanel.backgroundColor = KeyboardTheme.keyboardBackground
    settingsPanel.backgroundColor = KeyboardTheme.keyboardBackground
    emojiPanel.backgroundColor = KeyboardTheme.keyboardBackground
    lowerContainer.backgroundColor = KeyboardTheme.keyboardBackground
    panelsStack.arrangedSubviews.forEach { $0.backgroundColor = KeyboardTheme.keyboardBackground }
    renderKeys()
    renderSettingsPanel()
    refreshToolbarHighlight()
  }

  private func applyAutoCapIfNewField() {
    if let autocap = textDocumentProxy.autocapitalizationType, autocap == .none {
      keyboardLayer = .alpha
      renderKeys()
      return
    }
    if let type = textDocumentProxy.keyboardType,
       type == .webSearch || type == .URL || type == .emailAddress || type == .twitter {
      keyboardLayer = .alpha
      renderKeys()
      return
    }
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    let after = textDocumentProxy.documentContextAfterInput ?? ""
    guard before.isEmpty, after.isEmpty, keyboardLayer == .alpha else { return }
    if let autocap = textDocumentProxy.autocapitalizationType, autocap != UITextAutocapitalizationType.none {
      keyboardLayer = .shift
      renderKeys()
    }
  }

  private func checkAutoCap() {
    if let autocap = textDocumentProxy.autocapitalizationType, autocap == UITextAutocapitalizationType.none { return }
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
    consumePendingTranscriptionIfAvailable()
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
      renderSuggestionChips(words: defaultStarterWords, loading: false)
      return
    }
    let partial = partialWordFromContext()?.lowercased() ?? ""
    if partial.isEmpty {
      currentPartialWord = ""
      renderSuggestionChips(words: defaultStarterWords, loading: false)
      return
    }
    scheduleDatamuseFetch(query: partial)
  }

  private func scheduleDatamuseFetch(query: String) {
    suggestionDebounceTimer?.invalidate()
    guard !query.isEmpty else {
      currentPartialWord = ""
      renderSuggestionChips(words: defaultStarterWords, loading: false)
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
        let displayWords = words.isEmpty ? self.defaultStarterWords : words
        self.renderSuggestionChips(words: displayWords, loading: false)
      }
    }
  }

  private func renderSuggestionChips(words: [String], loading: Bool) {
    suggestionRow.arrangedSubviews.forEach { $0.removeFromSuperview() }
    if loading {
      let label = UILabel()
      label.text = "…"
      label.font = .systemFont(ofSize: 14)
      label.textColor = KeyboardTheme.hintText
      suggestionRow.addArrangedSubview(label)
      setSuggestionBarVisible(true)
      return
    }
    let chipWords = words.isEmpty ? defaultStarterWords : words
    setSuggestionBarVisible(true)
    let partialLen = currentPartialWord.count
    for (index, word) in chipWords.enumerated() {
      if index > 0 {
        let dot = UILabel()
        dot.text = "·"
        dot.font = .systemFont(ofSize: 14)
        dot.textColor = KeyboardTheme.hintText
        suggestionRow.addArrangedSubview(dot)
      }
      let chip = UIButton(type: .system)
      chip.setTitle(word, for: .normal)
      chip.titleLabel?.font = index == 0 ? .boldSystemFont(ofSize: 14) : .systemFont(ofSize: 14)
      chip.setTitleColor(index == 0 ? KeyboardTheme.primary : KeyboardTheme.keyText, for: .normal)
      chip.contentEdgeInsets = UIEdgeInsets(top: 2, left: 8, bottom: 2, right: 8)
      chip.addAction(UIAction { [weak self] _ in
        self?.applySuggestionWord(word, partialLength: partialLen)
      }, for: .touchUpInside)
      suggestionRow.addArrangedSubview(chip)
    }
  }

  private func setSuggestionBarVisible(_ visible: Bool) {
    suggestionScrollHeightConstraint?.constant = 38
    suggestionScroll.isHidden = false
    suggestionDivider.isHidden = false
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
    if lowerMode == .translatePanel {
      setLowerMode(.keys)
      return
    }
    runKeyboardFeature(.translate)
  }

  @objc private func onGrammar() {
    if lowerMode == .grammarPanel {
      setLowerMode(.keys)
      return
    }
    runKeyboardFeature(.grammar)
  }

  private enum KeyboardFeature {
    case translate
    case grammar
    case askAI
  }

  private func runKeyboardFeature(_ feature: KeyboardFeature) {
    hideResult()
    hideEmojiPanel()
    guard hasFullAccess else {
      showSnackbar("Turn on \"Allow Full Access\" in Settings → Keyboards → TypeEasy.")
      return
    }
    guard let input = collectInputText() else {
      showSnackbar("Type or select text first.")
      return
    }

    pendingReplaceSelected = input.selected
    pendingReplaceBeforeChars = input.beforeChars
    let userId = KeyboardSharedConfig.hasUserId() ? KeyboardSharedConfig.userId() : "guest"
    let text = input.text

    switch feature {
    case .translate:
      loadingToolbarHighlight = .translate
      refreshToolbarHighlight()
      showSnackbar("Translating…")
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
            self.showTranslateResult(result, isError: false)
          } else {
            self.showTranslateResult(response.error ?? "Translation failed", isError: true)
          }
        }
      }
    case .grammar:
      loadingToolbarHighlight = .grammar
      refreshToolbarHighlight()
      showSnackbar("Checking grammar…")
      activeApiTask?.cancel()
      activeApiTask = Task { [weak self] in
        let response = await KeyboardApiClient.grammarCheck(text: text, userId: userId)
        await MainActor.run {
          guard let self, !Task.isCancelled else { return }
          self.loadingToolbarHighlight = nil
          if let result = response.result {
            self.showGrammarResult(result, isError: false)
          } else {
            self.showGrammarResult(response.error ?? "Grammar check failed", isError: true)
          }
        }
      }
    case .askAI:
      loadingToolbarHighlight = .voiceCommand
      refreshToolbarHighlight()
      showSnackbar("Asking AI…")
      activeApiTask?.cancel()
      activeApiTask = Task { [weak self] in
        let response = await KeyboardApiClient.askAI(question: text)
        await MainActor.run {
          guard let self, !Task.isCancelled else { return }
          self.loadingToolbarHighlight = nil
          if let result = response.result {
            self.showTranslateResult(result, isError: false)
          } else {
            self.showTranslateResult(response.error ?? "AI request failed", isError: true)
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
    if !selected.isEmpty {
      return CollectedInput(text: selected, selected: true, beforeChars: 0)
    }
    let before = (proxy.documentContextBeforeInput ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let after = (proxy.documentContextAfterInput ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let combined = [before, after].filter { !$0.isEmpty }.joined(separator: " ")
    if !combined.isEmpty {
      return CollectedInput(text: combined, selected: false, beforeChars: before.count)
    }
    return nil
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
    voiceStopButton.isHidden = !isWaitingForDictation && !isCloudDictationRecording
    resultBar.isHidden = true
    voiceBar.isHidden = false
    panelsStack.isHidden = false
    panelsStack.isUserInteractionEnabled = true
    lowerContainer.bringSubviewToFront(panelsStack)
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()
  }

  private func showTranslateResult(_ text: String, isError: Bool) {
    lastResultIsError = isError
    translateResultLabel.text = text
    translateResultLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : KeyboardTheme.keyText
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let showInsert = !isError && !trimmed.isEmpty
    translateInsertButton.isHidden = !showInsert
    translateInsertButton.isEnabled = showInsert
    setLowerMode(.translatePanel)
  }

  private func showGrammarResult(_ text: String, isError: Bool) {
    lastResultIsError = isError
    grammarResultLabel.text = text
    grammarResultLabel.textColor = isError
      ? UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
      : KeyboardTheme.keyText
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let showInsert = !isError && !trimmed.isEmpty
    grammarInsertButton.isHidden = !showInsert
    grammarInsertButton.isEnabled = showInsert
    setLowerMode(.grammarPanel)
  }

  @objc private func backToKeysTapped() {
    hideLanguagePicker()
    setLowerMode(.keys)
  }

  @objc private func insertTranslateResult() {
    let text = translateResultLabel.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !text.isEmpty, !lastResultIsError else { return }
    let proxy = textDocumentProxy
    if !pendingReplaceSelected, pendingReplaceBeforeChars > 0 {
      for _ in 0..<pendingReplaceBeforeChars {
        proxy.deleteBackward()
      }
    }
    proxy.insertText(text + " ")
    setLowerMode(.keys)
    updateSuggestions()
    showSnackbar("✓ Inserted translation")
  }

  @objc private func insertGrammarResult() {
    let text = grammarResultLabel.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !text.isEmpty, !lastResultIsError else { return }
    let proxy = textDocumentProxy
    if !pendingReplaceSelected, pendingReplaceBeforeChars > 0 {
      for _ in 0..<pendingReplaceBeforeChars {
        proxy.deleteBackward()
      }
    }
    proxy.insertText(text + " ")
    setLowerMode(.keys)
    updateSuggestions()
    showSnackbar("✓ Inserted correction")
  }

  private func showResult(
    _ text: String,
    isError: Bool,
    isLoading: Bool = false,
    toolbarSource: ToolbarHighlight? = nil
  ) {
    if toolbarSource == .grammar {
      showGrammarResult(text, isError: isError)
    } else {
      showTranslateResult(text, isError: isError)
    }
  }

  @objc private func hideResult() {
    setLowerMode(.keys)
  }

  @objc private func insertResult() {
    insertTranslateResult()
  }

  @objc private func onVoice() {
    NSLog("[MicTap] 1. Tapped (hasFullAccess=%d)", hasFullAccess)
    reloadLanguagesFromSharedConfig()
    hideEmojiPanel()
    isSettingsVisible = false
    settingsPanel.isHidden = true
    if voiceCommandPanel.isActive {
      cancelVoiceCommandFlow()
    }

    guard hasFullAccess else {
      NSLog("[TypeEasyKeyboard] ⚠️ onVoice: Allow Full Access is not enabled.")
      showSnackbar("Turn on \"Allow Full Access\" in Settings → Keyboards → TypeEasy for voice typing.")
      return
    }

    let state = SharedIPCManager.shared.readState()
    let now = Date().timeIntervalSince1970
    let heartbeatAge = state.lastEngineHeartbeat > 0 ? (now - state.lastEngineHeartbeat) : 999.0
    let isHeartbeatFresh = heartbeatAge <= 20.0
    let isEngineWarm = state.isEngineRunning && state.isAudioSessionReady && !state.needsForegroundReactivation && isHeartbeatFresh

    NSLog("[MicTap] 2. State read: isEngineRunning=%d, isAudioSessionReady=%d, needsReactivation=%d, heartbeatAge=%.1fs, warm=%d",
          state.isEngineRunning, state.isAudioSessionReady, state.needsForegroundReactivation, heartbeatAge, isEngineWarm)

    let returnScheme = detectHostAppScheme()
    NSLog("[TypeEasyKeyboard] 🎙️ Host app scheme: %@", returnScheme ?? "nil")

    if isEngineWarm {
      // Warm background state: capture inline without leaving host app
      NSLog("[MicTap] 3. Launching/Signaling (Warm inline capture)")
      micController.handleMicButtonTapped(
        extensionContext: extensionContext,
        textDocumentProxy: textDocumentProxy,
        returnScheme: returnScheme
      )
    } else {
      // Cold or interrupted state (e.g. 2003329396): launch containing app with autoStart=1
      NSLog("[MicTap] 3. Launching/Signaling (Foreground Re-Arm with autoStart=1)")
      var queryItems: [String] = []
      if let scheme = returnScheme, !scheme.isEmpty {
        queryItems.append("returnScheme=\(scheme)")
        SharedIPCManager.shared.lastReturnScheme = scheme
      }
      queryItems.append("autoStart=1")
      let query = "?\(queryItems.joined(separator: "&"))"

      if let url = URL(string: "typeeasy://activate\(query)") ?? URL(string: "typevoice://activate\(query)") {
        showSnackbar("Re-activating Type Easy mic in background…")
        openContainingApp(url)
      }
    }

    startDualDeliveryWatchdog()
    updateDiagnosticBar()
  }

  @objc private func onVoiceCommand() {
    reloadLanguagesFromSharedConfig()
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
      showResult(
        "Turn on \"Allow Full Access\" in iPhone Settings → Keyboards → TypeEasy for Ask AI.",
        isError: true
      )
      return
    }

    // If user has typed or selected a question, answer it directly via Groq AI
    if let input = collectInputText(), !input.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      runKeyboardFeature(.askAI)
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
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()

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
    let snap = KeyboardDictationStore.shared.snapshot()
    if snap.state == .requested || snap.state == .appOpened || snap.state == .recording || snap.state == .transcribing {
      activeDictationRequestId = snap.requestId
      isWaitingForDictation = true
      dictationUsesHostApp = true
      voiceBar.isHidden = false
      voiceStopButton.isHidden = false
      if snap.state == .transcribing {
        voiceStatusLabel.text = "Converting your speech into text..."
      } else if !snap.partialText.isEmpty {
        voiceStatusLabel.text = "🎙 \"\(snap.partialText)\""
      } else {
        voiceStatusLabel.text = "🎙 Listening in TypeEasy… speak now"
      }
      refreshToolbarHighlight()
      startDictationPolling()
      view.setNeedsUpdateConstraints()
      view.layoutIfNeeded()
    } else if isWaitingForDictation || isCloudDictationRecording {
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
      let exec = await KeyboardVoiceApiClient.executeVoiceCommand(voiceAssetId: assetId, transcript: editedText)
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
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()
  }

  @objc private func toggleSettings() {
    hideResult()
    cancelVoiceCommandFlow()
    hideEmojiPanel()
    if lowerMode == .settingsPanel {
      setLowerMode(.keys)
    } else {
      setLowerMode(.settingsPanel)
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
    languagePickerHeightConstraint?.constant = 124
    languageTableView.reloadData()
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()
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
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()
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
    isEmojiMode = true
    setLowerMode(.keys)
    updateSuggestions()
    loadEmojiCategory(index: 0)
    view.setNeedsUpdateConstraints()
  }

  @objc private func hideEmojiPanel() {
    isEmojiMode = false
    setLowerMode(.keys)
    updateSuggestions()
    view.setNeedsUpdateConstraints()
  }

  @objc private func emojiTabTapped(_ sender: UIButton) {
    loadEmojiCategory(index: sender.tag)
  }

  private func loadEmojiCategory(index: Int) {
    guard index >= 0, index < KeyboardEmojiData.categories.count else { return }
    for (i, btn) in emojiTabButtons.enumerated() {
      btn.layer.cornerRadius = 8
      btn.backgroundColor = i == index ? KeyboardTheme.keyActionBackground : .clear
      btn.tintColor = i == index ? KeyboardTheme.primary : KeyboardTheme.keyText
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
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()

    if isWaitingForDictation {
      stopVoice()
      return
    }

    guard hasFullAccess else {
      NSLog("[TypeEasyKeyboard] ⚠️ startVoice: Allow Full Access is not enabled.")
      showSnackbar("Turn on \"Allow Full Access\" in Settings → Keyboards → TypeEasy for voice typing.")
      return
    }

    KeyboardDictationStore.shared.clearStopRequested()
    let requestId = KeyboardDictationStore.shared.createPendingRequest()
    activeDictationRequestId = requestId
    isWaitingForDictation = true
    dictationUsesHostApp = true
    isCloudDictationRecording = false
    hostAppHandoffActive = true
    NSLog("[TypeEasyDictation] [%@] Keyboard microphone tapped", requestId)

    // Update mic button to recording state
    if let btn = toolbarMicButton {
      KeyboardTheme.updateMicButton(btn, isRecording: true)
    }

    KeyboardSharedConfig.setPendingDeepLink(
      "\(KeyboardSharedConfig.deepLinkVoice)?requestId=\(requestId)"
    )
    KeyboardSharedNotifications.postDictationStart()

    // Launch Type Easy containing application voice dictation
    KeyboardHostLink.openVoice(requestId: requestId, extensionContext: extensionContext) { [weak self] success in
      NSLog("[TypeEasyDictation] [%@] KeyboardHostLink.openVoice returned: %d", requestId, success)
      if !success {
        DispatchQueue.main.async {
          self?.showSnackbar("Please open the Type Easy app once to enable microphone dictation.")
          self?.finishDictation()
        }
      }
    }

    startDictationPolling()
  }

  private func consumePendingTranscriptionIfAvailable() {
    guard isWaitingForDictation else { return }
    guard let proxy = textDocumentProxy as UITextDocumentProxy? else { return }
    if let text = KeyboardDictationStore.shared.consumePendingTranscription(maxAgeSeconds: 15), !text.isEmpty {
      let reqId = activeDictationRequestId ?? "session"
      NSLog("[TypeEasyDictation] [%@] Keyboard retrieved transcription: '%@'", reqId, text)
      proxy.insertText(text + " ")
      NSLog("[TypeEasyDictation] [%@] Text inserted successfully", reqId)
      finishDictation()
      showSnackbar("✓ Voice text inserted!")
      UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    } else {
      let snap = KeyboardDictationStore.shared.snapshot()
      if snap.state == .failed {
        let reqId = snap.requestId.isEmpty ? (activeDictationRequestId ?? "session") : snap.requestId
        NSLog("[TypeEasyDictation] [%@] Dictation reported failed: %@", reqId, snap.error)
        finishDictation()
        let err = snap.error.trimmingCharacters(in: .whitespacesAndNewlines)
        if !err.isEmpty && !err.contains("Session activation") && !err.contains("560557684") {
          showSnackbar("Voice error: \(err)")
        }
      } else if snap.state == .cancelled {
        finishDictation()
      }
    }
  }

  private func startDictationPolling() {
    dictationPollTimer?.invalidate()
    let timer = Timer(timeInterval: 0.4, repeats: true) { [weak self] _ in
      self?.pollDictationState()
    }
    RunLoop.main.add(timer, forMode: .common)
    dictationPollTimer = timer
  }

  private func pollDictationState() {
    guard isViewVisible else { return }
    let snap = KeyboardDictationStore.shared.snapshot()
    guard let activeId = activeDictationRequestId, !activeId.isEmpty, snap.requestId == activeId else { return }

    NSLog("[TypeEasyKeyboard] ⏱️ pollDictationState: state=%@, partial='%@', error='%@'", snap.state.rawValue, snap.partialText, snap.error)
    switch snap.state {
    case .appOpened:
      voiceStatusLabel.text = "🎙 TypeEasy is active. Speak now..."
    case .recording, .listening:
      if !snap.partialText.isEmpty {
        voiceStatusLabel.text = "🎙 \"\(snap.partialText)\""
      } else {
        voiceStatusLabel.text = "🎙 Listening in TypeEasy… speak now"
      }
    case .transcribing:
      voiceStatusLabel.text = "Converting your speech into text..."
    case .completed, .done:
      NSLog("[TypeEasyKeyboard] ✅ Dictation completed. Consuming transcription...")
      if let text = KeyboardDictationStore.shared.consumePendingTranscription(), !text.isEmpty {
        NSLog("[TypeEasyKeyboard] ✍️ Inserting transcribed text: '%@'", text)
        textDocumentProxy.insertText(text + " ")
        showSnackbar("✓ Voice text inserted!")
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      }
      finishDictation()
    case .failed, .error:
      NSLog("[TypeEasyKeyboard] ❌ Dictation failed: %@", snap.error)
      finishDictation()
      let err = snap.error.trimmingCharacters(in: .whitespacesAndNewlines)
      if !err.isEmpty && !err.contains("Session activation") && !err.contains("560557684") {
        showSnackbar("Voice: \(err)")
      }
    case .cancelled:
      NSLog("[TypeEasyKeyboard] 🛑 Dictation cancelled by user or host.")
      finishDictation()
    case .idle, .requested, .pending, .inserted:
      break
    }
  }

  @objc private func stopVoice() {
    guard isWaitingForDictation else { return }
    let snap = KeyboardDictationStore.shared.snapshot()
    let text = (snap.finalText.isEmpty ? snap.partialText : snap.finalText).trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      KeyboardDictationStore.shared.complete(text)
      if let consumed = KeyboardDictationStore.shared.consumePendingTranscription(), !consumed.isEmpty {
        textDocumentProxy.insertText(consumed + " ")
        showSnackbar("✓ Voice text inserted!")
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      }
      finishDictation()
    } else {
      KeyboardDictationStore.shared.requestStop()
      voiceStatusLabel.text = "Finishing dictation…"
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
        guard let self, self.isWaitingForDictation else { return }
        self.consumePendingTranscriptionIfAvailable()
        self.finishDictation()
      }
    }
  }

  private func finishDictation() {
    dictationPollTimer?.invalidate()
    dictationPollTimer = nil
    isWaitingForDictation = false
    isCloudDictationRecording = false
    activeDictationRequestId = nil
    dictationUsesHostApp = false
    voiceStopButton.isHidden = true
    KeyboardDictationStore.shared.reset()
    KeyboardSharedConfig.setExtensionOwnsMic(false)
    voiceBar.isHidden = true
    panelsStack.isHidden = true
    panelsStack.isUserInteractionEnabled = false
    setLowerMode(.keys)
    if let btn = toolbarMicButton {
      KeyboardTheme.updateMicButton(btn, isRecording: false)
    }
    refreshToolbarHighlight()
    view.setNeedsUpdateConstraints()
    view.layoutIfNeeded()
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

// MARK: - KeyboardMicControllerDelegate
extension KeyboardViewController: KeyboardMicControllerDelegate {
  func micController(_ controller: KeyboardMicController, didChangeState state: KeyboardMicController.MicState) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.updateDiagnosticBar()
      switch state {
      case .idle:
        if let btn = self.toolbarMicButton {
          KeyboardTheme.updateMicButton(btn, isRecording: false)
        }
        self.loadingToolbarHighlight = nil
        self.refreshToolbarHighlight()
      case .listening:
        if let btn = self.toolbarMicButton {
          KeyboardTheme.updateMicButton(btn, isRecording: true)
        }
        self.showSnackbar("Listening… Speak now")
        self.startDualDeliveryWatchdog()
      case .processing:
        if let btn = self.toolbarMicButton {
          KeyboardTheme.updateMicButton(btn, isRecording: false)
        }
        self.showSnackbar("Transcribing…")
        self.startDualDeliveryWatchdog()
      }
    }
  }

  func micController(_ controller: KeyboardMicController, didProduceTranscription text: String) {
    DispatchQueue.main.async { [weak self] in
      self?.consumeAndInsertPendingText()
    }
  }

  func micController(_ controller: KeyboardMicController, didRequestStatusMessage message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.showSnackbar(message)
      self?.updateDiagnosticBar()
    }
  }
}
