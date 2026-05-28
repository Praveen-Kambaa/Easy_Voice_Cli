#import <React/RCTBridgeModule.h>

/// Exposes KeyboardModule (Swift) to React Native's bridge.
@interface RCT_EXTERN_MODULE(KeyboardModule, NSObject)

RCT_EXTERN_METHOD(openKeyboardSettings)
RCT_EXTERN_METHOD(showKeyboardPicker)

@end
