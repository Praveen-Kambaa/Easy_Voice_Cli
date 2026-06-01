import UIKit

protocol KeyboardVoiceCommandPanelDelegate: AnyObject {
  func voiceCommandPanelDidTapStopRecording()
  func voiceCommandPanelDidTapCancelRecording()
  func voiceCommandPanelDidTapCancelReview()
  func voiceCommandPanelDidTapSend(editedText: String)
  /// Host selection callbacks can fire when the user taps the transcript; ignore release briefly.
  func voiceCommandPanelDidActivateTranscriptEditing()
}

/// Record → transcribe → edit → execute panel (mirrors Android `KeyboardVoiceCommandUi`).
final class KeyboardVoiceCommandPanel: UIView, UITextViewDelegate, UIGestureRecognizerDelegate {
  weak var delegate: KeyboardVoiceCommandPanelDelegate?

  private let recordingRow = UIStackView()
  private let reviewSection = UIStackView()
  private let recordingStatus = UILabel()
  private let recordingTimer = UILabel()
  private let transcriptView = UITextView()
  private let progressBar = UIActivityIndicatorView(style: .medium)
  private let statusLabel = UILabel()
  private let sendButton = UIButton(type: .system)
  private var hasError = false
  private var routeKeysToTranscript = false

  var isActive: Bool { !isHidden }
  var isRecording: Bool { isActive && !recordingRow.isHidden }

  /// True while review transcript should receive keyboard keys (mirrors Android `shouldRouteKeysToTranscript`).
  func shouldRouteKeysToTranscript() -> Bool {
    routeKeysToTranscript && !isHidden && !reviewSection.isHidden && transcriptView.isEditable && !hasError
  }

  func releaseTranscriptRouting() {
    deactivateTranscriptEditing()
  }

  /// Re-enable keyboard routing into the review transcript (mirrors Android `activateTranscriptEditing`).
  func activateTranscriptEditing(notifyHostGrace: Bool = true) {
    guard !hasError, !reviewSection.isHidden, transcriptView.isEditable else { return }
    routeKeysToTranscript = true
    if notifyHostGrace {
      delegate?.voiceCommandPanelDidActivateTranscriptEditing()
    }
  }

  private func deactivateTranscriptEditing() {
    routeKeysToTranscript = false
    transcriptView.resignFirstResponder()
  }

  /// Route a keyboard key into the voice-command transcript. Returns true if consumed.
  func routeKey(_ logical: String, shiftOn: Bool, capsOn: Bool) -> Bool {
    guard shouldRouteKeysToTranscript() else { return false }
    switch logical {
    case "⇧", "?123", "ABC", "😊":
      return false
    case "⌫":
      deleteTranscriptCharacter()
      return true
    case "space":
      return insertTranscriptText(" ")
    case "↵":
      return insertTranscriptText("\n")
    default:
      guard logical.count == 1, let ch = logical.first else { return false }
      let out = (shiftOn || capsOn) ? String(ch).uppercased() : logical
      return insertTranscriptText(out)
    }
  }

  @discardableResult
  func insertTranscriptText(_ text: String) -> Bool {
    guard shouldRouteKeysToTranscript() else { return false }
    let current = transcriptView.text ?? ""
    let range = transcriptView.selectedRange
    let ns = current as NSString
    let replaced = ns.replacingCharacters(in: range, with: text)
    transcriptView.text = replaced
    let newLocation = range.location + (text as NSString).length
    transcriptView.selectedRange = NSRange(location: min(newLocation, (replaced as NSString).length), length: 0)
    return true
  }

  @discardableResult
  func clearTranscript() -> Bool {
    guard shouldRouteKeysToTranscript() else { return false }
    transcriptView.text = ""
    transcriptView.selectedRange = NSRange(location: 0, length: 0)
    return true
  }

  private func deleteTranscriptCharacter() {
    let current = transcriptView.text ?? ""
    var range = transcriptView.selectedRange
    if range.length == 0, range.location > 0 {
      range = NSRange(location: range.location - 1, length: 1)
    }
    guard range.length > 0, range.location < (current as NSString).length else { return }
    let ns = current as NSString
    transcriptView.text = ns.replacingCharacters(in: range, with: "")
    transcriptView.selectedRange = NSRange(location: range.location, length: 0)
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  private func setup() {
    isHidden = true
    backgroundColor = KeyboardTheme.keyboardBackground
    translatesAutoresizingMaskIntoConstraints = false

    recordingRow.axis = .horizontal
    recordingRow.alignment = .center
    recordingRow.spacing = 8
    recordingRow.layoutMargins = UIEdgeInsets(top: 10, left: 12, bottom: 10, right: 12)
    recordingRow.isLayoutMarginsRelativeArrangement = true

    let dot = UIView()
    dot.backgroundColor = UIColor(red: 0xEF / 255.0, green: 0x44 / 255.0, blue: 0x44 / 255.0, alpha: 1)
    dot.layer.cornerRadius = 4
    dot.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      dot.widthAnchor.constraint(equalToConstant: 8),
      dot.heightAnchor.constraint(equalToConstant: 8),
    ])

    recordingStatus.text = "Recording…"
    recordingStatus.font = .boldSystemFont(ofSize: 14)
    recordingStatus.textColor = KeyboardTheme.primary

    recordingTimer.font = .systemFont(ofSize: 13)
    recordingTimer.textColor = KeyboardTheme.hintText
    recordingTimer.text = "0:00"

    let stopBtn = actionButton(title: "Stop", primary: true)
    stopBtn.addTarget(self, action: #selector(stopTapped), for: .touchUpInside)
    let cancelRecBtn = actionButton(title: "Cancel", primary: false)
    cancelRecBtn.addTarget(self, action: #selector(cancelRecordingTapped), for: .touchUpInside)

    recordingRow.addArrangedSubview(dot)
    recordingRow.addArrangedSubview(recordingStatus)
    recordingRow.addArrangedSubview(recordingTimer)
    recordingRow.addArrangedSubview(UIView())
    recordingRow.addArrangedSubview(stopBtn)
    recordingRow.addArrangedSubview(cancelRecBtn)

    reviewSection.axis = .vertical
    reviewSection.spacing = 6
    reviewSection.layoutMargins = UIEdgeInsets(top: 10, left: 12, bottom: 10, right: 12)
    reviewSection.isLayoutMarginsRelativeArrangement = true
    reviewSection.isHidden = true

    let headerRow = UIStackView()
    headerRow.axis = .horizontal
    headerRow.alignment = .center
    let title = UILabel()
    title.text = "Voice command"
    title.font = .boldSystemFont(ofSize: 13)
    title.textColor = KeyboardTheme.keyText
    let closeBtn = UIButton(type: .system)
    closeBtn.setTitle("✕", for: .normal)
    closeBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
    closeBtn.tintColor = KeyboardTheme.keyText
    closeBtn.addTarget(self, action: #selector(cancelReviewTapped), for: .touchUpInside)
    headerRow.addArrangedSubview(title)
    headerRow.addArrangedSubview(UIView())
    headerRow.addArrangedSubview(closeBtn)

    transcriptView.font = .systemFont(ofSize: 14)
    transcriptView.textColor = KeyboardTheme.keyText
    transcriptView.backgroundColor = KeyboardTheme.keyLetterBackground
    transcriptView.layer.cornerRadius = 8
    transcriptView.layer.borderWidth = 1
    transcriptView.layer.borderColor = KeyboardTheme.popupStroke.cgColor
    transcriptView.textContainerInset = UIEdgeInsets(top: 8, left: 6, bottom: 8, right: 6)
    transcriptView.isScrollEnabled = true
    transcriptView.heightAnchor.constraint(greaterThanOrEqualToConstant: 72).isActive = true
    transcriptView.delegate = self
    transcriptView.isUserInteractionEnabled = true
    let transcriptTap = UITapGestureRecognizer(target: self, action: #selector(transcriptTapped(_:)))
    transcriptTap.delegate = self
    transcriptView.addGestureRecognizer(transcriptTap)

    progressBar.hidesWhenStopped = true

    statusLabel.font = .systemFont(ofSize: 13)
    statusLabel.numberOfLines = 2
    statusLabel.isHidden = true

    sendButton.setTitle("Send", for: .normal)
    sendButton.titleLabel?.font = .boldSystemFont(ofSize: 13)
    sendButton.setTitleColor(.white, for: .normal)
    sendButton.backgroundColor = KeyboardTheme.primary
    sendButton.layer.cornerRadius = 8
    sendButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
    sendButton.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)

    let reviewActions = UIStackView()
    reviewActions.axis = .horizontal
    reviewActions.alignment = .center
    reviewActions.spacing = 8
    let cancelReviewBtn = actionButton(title: "Cancel", primary: false)
    cancelReviewBtn.addTarget(self, action: #selector(cancelReviewTapped), for: .touchUpInside)
    reviewActions.addArrangedSubview(UIView())
    reviewActions.addArrangedSubview(cancelReviewBtn)
    reviewActions.addArrangedSubview(sendButton)

    reviewSection.addArrangedSubview(headerRow)
    reviewSection.addArrangedSubview(transcriptView)
    reviewSection.addArrangedSubview(progressBar)
    reviewSection.addArrangedSubview(statusLabel)
    reviewSection.addArrangedSubview(reviewActions)

    let root = UIStackView(arrangedSubviews: [recordingRow, reviewSection])
    root.axis = .vertical
    root.translatesAutoresizingMaskIntoConstraints = false
    addSubview(root)
    NSLayoutConstraint.activate([
      root.topAnchor.constraint(equalTo: topAnchor),
      root.leadingAnchor.constraint(equalTo: leadingAnchor),
      root.trailingAnchor.constraint(equalTo: trailingAnchor),
      root.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  private func actionButton(title: String, primary: Bool) -> UIButton {
    let button = UIButton(type: .system)
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .boldSystemFont(ofSize: 13)
    if primary {
      button.setTitleColor(.white, for: .normal)
      button.backgroundColor = KeyboardTheme.primary
    } else {
      button.setTitleColor(KeyboardTheme.keyText, for: .normal)
      button.backgroundColor = KeyboardTheme.keyActionBackground
    }
    button.layer.cornerRadius = 8
    button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
    return button
  }

  func showRecording() {
    isHidden = false
    hasError = false
    deactivateTranscriptEditing()
    recordingRow.isHidden = false
    reviewSection.isHidden = true
    recordingTimer.text = "0:00"
    statusLabel.isHidden = true
    progressBar.stopAnimating()
  }

  func updateRecordingTimer(_ text: String) {
    recordingTimer.text = text
  }

  func setRecordingStatus(_ text: String) {
    recordingStatus.text = text
  }

  func showReviewLoading(_ message: String) {
    isHidden = false
    recordingRow.isHidden = true
    reviewSection.isHidden = false
    deactivateTranscriptEditing()
    transcriptView.text = ""
    transcriptView.isEditable = false
    sendButton.isEnabled = false
    statusLabel.text = message
    statusLabel.textColor = KeyboardTheme.hintText
    statusLabel.isHidden = false
    progressBar.startAnimating()
  }

  func showReview(_ transcript: String) {
    isHidden = false
    recordingRow.isHidden = true
    reviewSection.isHidden = false
    hasError = false
    transcriptView.text = transcript
    transcriptView.isEditable = true
    sendButton.isEnabled = true
    statusLabel.isHidden = true
    progressBar.stopAnimating()
    activateTranscriptEditing()
    let end = (transcript as NSString).length
    transcriptView.selectedRange = NSRange(location: end, length: 0)
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      _ = self.transcriptView.becomeFirstResponder()
      self.transcriptView.selectedRange = NSRange(location: end, length: 0)
    }
  }

  func showReviewError(_ message: String) {
    isHidden = false
    recordingRow.isHidden = true
    reviewSection.isHidden = false
    hasError = true
    deactivateTranscriptEditing()
    transcriptView.isEditable = false
    sendButton.isEnabled = false
    statusLabel.text = message
    statusLabel.textColor = UIColor(red: 0xE5 / 255.0, green: 0x39 / 255.0, blue: 0x35 / 255.0, alpha: 1)
    statusLabel.isHidden = false
    progressBar.stopAnimating()
  }

  func setLoading(_ loading: Bool, message: String) {
    if loading {
      deactivateTranscriptEditing()
      sendButton.isEnabled = false
      transcriptView.isEditable = false
      statusLabel.text = message
      statusLabel.textColor = KeyboardTheme.hintText
      statusLabel.isHidden = false
      progressBar.startAnimating()
    } else {
      progressBar.stopAnimating()
    }
  }

  func dismiss() {
    isHidden = true
    recordingRow.isHidden = false
    reviewSection.isHidden = true
    transcriptView.text = ""
    statusLabel.isHidden = true
    progressBar.stopAnimating()
    hasError = false
    deactivateTranscriptEditing()
  }

  @objc private func transcriptTapped(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended else { return }
    activateTranscriptEditing()
    let point = gesture.location(in: transcriptView)
    let index = characterIndex(at: point)
    transcriptView.selectedRange = NSRange(location: index, length: 0)
    _ = transcriptView.becomeFirstResponder()
  }

  private func characterIndex(at point: CGPoint) -> Int {
    var location = point
    location.x -= transcriptView.textContainerInset.left
    location.y -= transcriptView.textContainerInset.top
    location.x -= transcriptView.textContainer.lineFragmentPadding
    let layoutManager = transcriptView.layoutManager
    let container = transcriptView.textContainer
    let glyphIndex = layoutManager.glyphIndex(for: location, in: container)
    let charIndex = layoutManager.characterIndexForGlyph(at: glyphIndex)
    return min(charIndex, (transcriptView.text as NSString).length)
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    activateTranscriptEditing()
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    if textView === transcriptView, transcriptView.isEditable, !hasError {
      activateTranscriptEditing()
    }
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool {
    true
  }

  @objc private func stopTapped() { delegate?.voiceCommandPanelDidTapStopRecording() }
  @objc private func cancelRecordingTapped() { delegate?.voiceCommandPanelDidTapCancelRecording() }
  @objc private func cancelReviewTapped() { delegate?.voiceCommandPanelDidTapCancelReview() }

  @objc private func sendTapped() {
    guard !hasError else { return }
    let text = transcriptView.text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
      showReviewError("Enter text before sending")
      return
    }
    setLoading(true, message: "Sending command…")
    delegate?.voiceCommandPanelDidTapSend(editedText: text)
  }
}
