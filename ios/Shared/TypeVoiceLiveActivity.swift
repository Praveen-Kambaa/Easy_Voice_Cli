import Foundation
import SwiftUI

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(WidgetKit)
import WidgetKit
#endif

// MARK: - Activity Attributes (Dynamic Island & Lock Screen)

#if canImport(ActivityKit)
@available(iOS 16.1, *)
public struct TypeVoiceActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var isListening: Bool
    public var statusMessage: String

    public init(isListening: Bool, statusMessage: String) {
      self.isListening = isListening
      self.statusMessage = statusMessage
    }
  }

  public var sessionName: String

  public init(sessionName: String = "TypeVoice Background Mic") {
    self.sessionName = sessionName
  }
}
#endif

// MARK: - Live Activity Manager (Lifecycle Controller)

public final class LiveActivityManager {
  public static let shared = LiveActivityManager()

  private init() {}

  private var _currentActivity: Any?

  #if canImport(ActivityKit)
  @available(iOS 16.1, *)
  private var currentActivity: Activity<TypeVoiceActivityAttributes>? {
    get { _currentActivity as? Activity<TypeVoiceActivityAttributes> }
    set { _currentActivity = newValue }
  }
  #endif

  public func startLiveActivity() {
    #if canImport(ActivityKit)
    guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }

    // End any lingering previous activity
    endLiveActivity()

    let attributes = TypeVoiceActivityAttributes(sessionName: "TypeVoice Dictation")
    let initialContentState = TypeVoiceActivityAttributes.ContentState(
      isListening: false,
      statusMessage: "TypeVoice Mic Active • Ready to dictate"
    )

    do {
      let activity = try Activity<TypeVoiceActivityAttributes>.request(
        attributes: attributes,
        contentState: initialContentState,
        pushType: nil
      )
      self.currentActivity = activity
      NSLog("[LiveActivity] 🚀 Started Live Activity (ID: %@)", activity.id)
    } catch {
      NSLog("[LiveActivity] ❌ Failed to start Live Activity: %@", error.localizedDescription)
    }
    #endif
  }

  public func updateLiveActivity(isListening: Bool, status: String) {
    #if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else { return }
    let updatedState = TypeVoiceActivityAttributes.ContentState(
      isListening: isListening,
      statusMessage: status
    )
    Task {
      await currentActivity?.update(using: updatedState)
      NSLog("[LiveActivity] 🔄 Updated Live Activity (isListening: %d, status: '%@')", isListening, status)
    }
    #endif
  }

  public func endLiveActivity() {
    #if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else { return }
    Task {
      await currentActivity?.end(dismissalPolicy: .immediate)
      self.currentActivity = nil
      NSLog("[LiveActivity] 🛑 Ended Live Activity.")
    }
    #endif
  }
}

// MARK: - WidgetKit Presentation View

#if canImport(WidgetKit) && canImport(ActivityKit)
@available(iOS 16.1, *)
public struct TypeVoiceLiveActivityWidget: Widget {
  public init() {}

  public var body: some WidgetConfiguration {
    ActivityConfiguration(for: TypeVoiceActivityAttributes.self) { context in
      // Lock Screen Presentation
      LockScreenLiveActivityView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded Dynamic Island
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: context.state.isListening ? "mic.fill" : "mic")
              .foregroundColor(context.state.isListening ? .red : .blue)
              .font(.system(size: 18, weight: .bold))
            Text("TypeVoice")
              .font(.system(size: 15, weight: .semibold))
          }
          .padding(.leading, 8)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.isListening ? "Listening…" : "Active")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(context.state.isListening ? .red : .green)
            .padding(.trailing, 8)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.statusMessage)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.secondary)
            .padding(.top, 4)
            .padding(.bottom, 6)
        }
      } compactLeading: {
        Image(systemName: context.state.isListening ? "mic.fill" : "mic")
          .foregroundColor(context.state.isListening ? .red : .blue)
          .font(.system(size: 12, weight: .bold))
      } compactTrailing: {
        Text(context.state.isListening ? "Rec" : "Idle")
          .font(.system(size: 10, weight: .bold))
          .foregroundColor(context.state.isListening ? .red : .green)
      } minimal: {
        Image(systemName: context.state.isListening ? "mic.fill" : "mic")
          .foregroundColor(context.state.isListening ? .red : .blue)
          .font(.system(size: 11, weight: .bold))
      }
    }
  }
}

@available(iOS 16.1, *)
struct LockScreenLiveActivityView: View {
  let context: ActivityViewContext<TypeVoiceActivityAttributes>

  var body: some View {
    HStack(spacing: 14) {
      ZStack {
        Circle()
          .fill(context.state.isListening ? Color.red.opacity(0.15) : Color.blue.opacity(0.15))
          .frame(width: 44, height: 44)
        Image(systemName: context.state.isListening ? "mic.fill" : "mic")
          .font(.system(size: 20, weight: .bold))
          .foregroundColor(context.state.isListening ? .red : .blue)
      }

      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text("TypeVoice Dictation")
            .font(.system(size: 15, weight: .bold))
          Spacer()
          Circle()
            .fill(context.state.isListening ? Color.red : Color.green)
            .frame(width: 8, height: 8)
          Text(context.state.isListening ? "RECORDING" : "READY")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(context.state.isListening ? .red : .green)
        }
        Text(context.state.statusMessage)
          .font(.system(size: 12.5, weight: .medium))
          .foregroundColor(.secondary)
          .lineLimit(1)
      }
    }
    .padding(14)
    .background(Color(UIColor.secondarySystemBackground))
  }
}
#endif

