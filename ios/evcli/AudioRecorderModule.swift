import AVFoundation
import Foundation
import React

/// iOS audio record/playback for React Native (`NativeAudioService` / `AudioRecorderModule`).
@objc(AudioRecorderModule)
class AudioRecorderModule: RCTEventEmitter, AVAudioPlayerDelegate {

  private var recorder: AVAudioRecorder?
  private var player: AVAudioPlayer?
  private var currentFilePath = ""
  private var isRecording = false
  private var isPlaying = false

  override static func moduleName() -> String! {
    "AudioRecorderModule"
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["onPlaybackComplete"]
  }

  /// Required stubs so RN can subscribe to `onPlaybackComplete` (New Architecture / EventEmitter).
  @objc override func addListener(_ eventName: String!) {}
  @objc override func removeListeners(_ count: Double) {}

  private func recordingsDirectory() throws -> URL {
    let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("AppRecordings", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func activateSession(playAndRecord: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    if playAndRecord {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetoothHFP]
      )
    } else {
      try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
    }
    try session.setActive(true, options: [])
  }

  private func normalizePath(_ filePath: String) -> String {
    var path = filePath.trimmingCharacters(in: .whitespacesAndNewlines)
    if path.hasPrefix("file://") {
      path = String(path.dropFirst(7))
    }
    return path
  }

  private func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
    let session = AVAudioSession.sharedInstance()
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

    switch session.recordPermission {
    case .granted:
      completion(true)
    case .denied:
      completion(false)
    case .undetermined:
      session.requestRecordPermission { granted in
        DispatchQueue.main.async { completion(granted) }
      }
    @unknown default:
      completion(false)
    }
  }

  @objc
  func startRecording(
    _ fileName: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if isRecording {
      DispatchQueue.main.async {
        reject("ALREADY_RECORDING", "Recording is already in progress", nil)
      }
      return
    }

    requestMicrophonePermission { [weak self] granted in
      guard let self else { return }
      DispatchQueue.main.async {
        if !granted {
          reject("PERMISSION_DENIED", "Microphone permission denied", nil)
          return
        }

        do {
          try self.activateSession(playAndRecord: true)
          let fileURL = try self.recordingsDirectory().appendingPathComponent(fileName)
          if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
          }
          let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
          ]
          let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
          recorder.prepareToRecord()
          guard recorder.record() else {
            reject("RECORDING_FAILED", "Failed to start recording", nil)
            return
          }
          self.recorder = recorder
          self.isRecording = true
          self.currentFilePath = fileURL.path
          resolve(fileURL.path)
        } catch {
          reject("RECORDING_FAILED", error.localizedDescription, error)
        }
      }
    }
  }

  @objc
  func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard self.isRecording, let recorder = self.recorder else {
        reject("NOT_RECORDING", "No active recording to stop", nil)
        return
      }
      recorder.stop()
      self.recorder = nil
      self.isRecording = false
      resolve(self.currentFilePath)
    }
  }

  @objc
  func forceStopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.recorder?.stop()
      self.recorder = nil
      self.player?.stop()
      self.player = nil
      self.isRecording = false
      self.isPlaying = false
      resolve("Force stop completed")
    }
  }

  @objc
  func startPlayback(
    _ filePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if self.isPlaying {
        reject("ALREADY_PLAYING", "Audio is already playing", nil)
        return
      }

      let path = self.normalizePath(filePath)
      guard FileManager.default.fileExists(atPath: path) else {
        reject("FILE_NOT_FOUND", "Audio file not found: \(path)", nil)
        return
      }

      do {
        try self.activateSession(playAndRecord: false)
        let url = URL(fileURLWithPath: path)
        let audioPlayer = try AVAudioPlayer(contentsOf: url)
        audioPlayer.delegate = self
        guard audioPlayer.play() else {
          reject("PLAYBACK_FAILED", "Could not start playback", nil)
          return
        }
        self.player = audioPlayer
        self.isPlaying = true
        resolve(true)
      } catch {
        reject("PLAYBACK_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc
  func stopPlayback(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard let player = self.player else {
        resolve(true)
        return
      }
      player.stop()
      self.player = nil
      self.isPlaying = false
      resolve(true)
    }
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.player = nil
      self.isPlaying = false
      self.sendEvent(withName: "onPlaybackComplete", body: nil)
    }
  }
}
