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

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["onPlaybackComplete"]
  }

  private func recordingsDirectory() throws -> URL {
    let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("AppRecordings", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func activateSession(playAndRecord: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    if playAndRecord {
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    } else {
      try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
    }
    try session.setActive(true)
  }

  private func normalizePath(_ filePath: String) -> String {
    var path = filePath.trimmingCharacters(in: .whitespacesAndNewlines)
    if path.hasPrefix("file://") {
      path = String(path.dropFirst(7))
    }
    return path
  }

  @objc
  func startRecording(
    _ fileName: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if isRecording {
      reject("ALREADY_RECORDING", "Recording is already in progress", nil)
      return
    }

    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
      guard let self else { return }
      if !granted {
        reject("PERMISSION_DENIED", "Microphone permission denied", nil)
        return
      }

      DispatchQueue.main.async {
        do {
          try self.activateSession(playAndRecord: true)
          let fileURL = try self.recordingsDirectory().appendingPathComponent(fileName)
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
    guard isRecording, let recorder else {
      reject("NOT_RECORDING", "No active recording to stop", nil)
      return
    }
    recorder.stop()
    self.recorder = nil
    isRecording = false
    resolve(currentFilePath)
  }

  @objc
  func forceStopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    recorder?.stop()
    recorder = nil
    player?.stop()
    player = nil
    isRecording = false
    isPlaying = false
    resolve("Force stop completed")
  }

  @objc
  func startPlayback(
    _ filePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if isPlaying {
      reject("ALREADY_PLAYING", "Audio is already playing", nil)
      return
    }

    let path = normalizePath(filePath)
    guard FileManager.default.fileExists(atPath: path) else {
      reject("FILE_NOT_FOUND", "Audio file not found: \(path)", nil)
      return
    }

    do {
      try activateSession(playAndRecord: false)
      let url = URL(fileURLWithPath: path)
      let audioPlayer = try AVAudioPlayer(contentsOf: url)
      audioPlayer.delegate = self
      guard audioPlayer.play() else {
        reject("PLAYBACK_FAILED", "Could not start playback", nil)
        return
      }
      player = audioPlayer
      isPlaying = true
      resolve(true)
    } catch {
      reject("PLAYBACK_FAILED", error.localizedDescription, error)
    }
  }

  @objc
  func stopPlayback(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let player else {
      resolve(true)
      return
    }
    player.stop()
    self.player = nil
    isPlaying = false
    resolve(true)
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    self.player = nil
    isPlaying = false
    sendEvent(withName: "onPlaybackComplete", body: nil)
  }
}
