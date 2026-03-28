# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native specific rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.modules.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.views.** { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native Gesture Handler - CRITICAL FIX
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.gesturehandler.react.RNGestureHandlerModule { *; }
-keep class com.swmansion.gesturehandler.react.RNGestureHandlerPackage { *; }
-keep class com.swmansion.gesturehandler.react.RNGestureHandlerEnabledRootView { *; }
-dontwarn com.swmansion.gesturehandler.**

# Vector Icons
-keep class com.oblador.vectorial.** { *; }

# Permissions
-keep class com.reactnativecommunity.permissions.** { *; }

# File System
-keep class com.reactnative.fs.** { *; }

# Axios/Network
-keep class retrofit2.** { *; }
-keep class okhttp3.** { *; }
-keep class com.squareup.okhttp.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep JS bundle
-keep class com.typeeasy.MainActivity { *; }

# Google ML Kit (on-device translation)
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# Keep all React Native packages
-keep class * extends com.facebook.react.ReactPackage { *; }

# Remove logging in release builds
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
}
