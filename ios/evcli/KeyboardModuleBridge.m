#import <React/RCTBridgeModule.h>

/// Exposes KeyboardModule (Swift) to React Native's bridge.
@interface RCT_EXTERN_MODULE(KeyboardModule, NSObject)

RCT_EXTERN_METHOD(openKeyboardSettings)
RCT_EXTERN_METHOD(showKeyboardPicker)
RCT_EXTERN_METHOD(syncKeyboardSettings:(NSString *)userId
                  fromLang:(NSString *)fromLang
                  toLang:(NSString *)toLang
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(peekPendingDeepLink:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(consumePendingDeepLink:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(forwardPendingKeyboardLink:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getKeyboardSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isKeyboardEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isKeyboardSelected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
