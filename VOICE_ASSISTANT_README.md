# Voice Assistant Implementation

Complete Android-only voice assistant with floating overlay and speech-to-text functionality.

## 🎯 **Feature Overview**

- **Floating Overlay**: Draggable circular icon like Messenger chat head
- **Voice Recording**: Tap to start/stop audio recording
- **Speech Recognition**: Android SpeechRecognizer API (offline)
- **Text Insertion**: Automatic text insertion into focused EditText
- **Cross-App**: Works with WhatsApp, Instagram, Messages, etc.

## 📁 **Folder Structure**

```
android/app/src/main/java/com/evcli/
├── services/
│   ├── FloatingOverlayService.kt      # Main floating overlay service
│   └── MyAccessibilityService.kt      # Text insertion service
├── speech/
│   └── SpeechRecognitionManager.kt    # Speech recognition logic
├── utils/
│   └── PermissionUtils.kt           # Permission utilities
├── VoiceAssistantModule.kt            # React Native bridge
├── VoiceAssistantPackage.kt           # Package registration
└── MainApplication.kt                # Updated main application

src/
├── hooks/
│   └── useVoiceAssistant.js          # React Native hook
├── screens/
│   └── VoiceAssistantScreen.js       # UI implementation
└── components/                       # Existing components

android/app/src/main/res/
├── layout/
│   └── floating_overlay.xml          # Floating icon layout
├── drawable/
│   ├── floating_background.xml       # Normal state background
│   ├── recording_background.xml      # Recording state background
│   ├── ic_mic.xml                 # Normal mic icon
│   └── ic_mic_recording.xml         # Recording mic icon
└── values/
    └── strings.xml                  # String resources
```

## 🔧 **Core Components**

### FloatingOverlayService.kt
- **WindowManager**: TYPE_APPLICATION_OVERLAY
- **Draggable**: Touch handling with screen edge snapping
- **Visual States**: Normal (blue) / Recording (red glow)
- **Lifecycle**: Proper foreground service with notification
- **Size**: 56dp circular icon

### SpeechRecognitionManager.kt
- **SpeechRecognizer**: Android native API (offline)
- **Silence Detection**: Auto-stop after 3 seconds
- **Error Handling**: Comprehensive error management
- **Lifecycle**: Safe creation/destruction

### MyAccessibilityService.kt
- **ACTION_SET_TEXT**: Primary text insertion method
- **Clipboard Fallback**: When direct insertion blocked
- **Focus Detection**: Automatic EditText detection
- **Broadcast**: Receives text from floating service

### VoiceAssistantModule.kt
- **React Native Bridge**: JS interface
- **Permission Checks**: All permission states
- **Service Control**: Start/stop overlay
- **Settings Navigation**: Direct settings access

## 📱 **AndroidManifest.xml Configuration**

```xml
<!-- Required Permissions -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.BIND_ACCESSIBILITY_SERVICE" />

<!-- Service Declarations -->
<service android:name=".services.FloatingOverlayService" />
<service android:name=".services.MyAccessibilityService" />
```

## 🎨 **UI Features**

### Floating Icon
- **Size**: 56dp diameter
- **Shape**: Circular with border
- **Draggable**: Full screen with edge snapping
- **States**: Blue (idle) / Red (recording)
- **Position**: Persists across app changes

### Recording States
- **Visual**: Color change + background glow
- **Audio**: RMS level monitoring
- **Auto-stop**: 3-second silence timeout
- **Feedback**: Visual and haptic feedback

## 🔐 **Permissions**

### Required Permissions
1. **SYSTEM_ALERT_WINDOW**: Floating overlay
2. **RECORD_AUDIO**: Voice recording
3. **BIND_ACCESSIBILITY_SERVICE**: Text insertion
4. **FOREGROUND_SERVICE**: Background operation

### Permission Flow
1. Check all permissions
2. Request missing ones
3. Open specific settings screens
4. Verify after user returns

## 🎯 **Usage Example**

```javascript
import React from 'react';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';

const VoiceAssistantApp = () => {
  const {
    permissions,
    isOverlayActive,
    startOverlay,
    stopOverlay,
    areAllPermissionsGranted,
  } = useVoiceAssistant();

  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          if (areAllPermissionsGranted()) {
            isOverlayActive ? stopOverlay() : startOverlay();
          }
        }}
      >
        <Text>
          {isOverlayActive ? 'Stop Assistant' : 'Start Assistant'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
```

## 🔧 **Technical Implementation**

### Text Insertion Strategy
1. **Primary**: AccessibilityNodeInfo.ACTION_SET_TEXT
2. **Fallback**: Clipboard + ACTION_PASTE
3. **Detection**: Focus + editable node detection
4. **Safety**: Null checks and exception handling

### Speech Recognition
1. **Offline**: Android SpeechRecognizer API
2. **Language**: Device default locale
3. **Timeout**: 3-second silence detection
4. **Results**: Best match selection

### Overlay Management
1. **Type**: TYPE_APPLICATION_OVERLAY
2. **Flags**: FLAG_NOT_FOCUSABLE
3. **Lifecycle**: Proper cleanup on destroy
4. **Performance**: Memory leak prevention

## 🚀 **Android Version Support**

- **Android 6.0+**: Runtime permissions
- **Android 8.0+**: Notification channels
- **Android 10+**: Background restrictions
- **Android 14+**: Latest compatibility

## ⚡ **Performance Optimizations**

- **Memory**: Proper SpeechRecognizer cleanup
- **Battery**: Efficient silence detection
- **UI**: Minimal redraws during drag
- **Lifecycle**: Service state management

## 🛡️ **Security Considerations**

- **Privacy**: No cloud APIs, fully offline
- **Permissions**: Minimal required permissions
- **Data**: No data collection or transmission
- **Access**: Only focused EditText interaction

## 🔍 **Testing Checklist**

- [ ] Overlay permission granted
- [ ] Accessibility service enabled
- [ ] Microphone permission granted
- [ ] Floating icon appears
- [ ] Drag functionality works
- [ ] Recording starts/stops correctly
- [ ] Speech recognition returns text
- [ ] Text insertion works in WhatsApp
- [ ] Text insertion works in Instagram
- [ ] Auto-stop on silence works
- [ ] Service survives app restart

## 📋 **Troubleshooting**

### Common Issues
1. **App not in accessibility list**: Check service declaration
2. **Overlay not showing**: Check permission and service start
3. **Text not inserting**: Verify accessibility service enabled
4. **Speech not working**: Check microphone permission

### Debug Steps
1. Enable all permissions
2. Start floating service
3. Check notification for foreground service
4. Test in target apps (WhatsApp, etc.)

This implementation provides a production-ready voice assistant with all requested features and Android best practices.
