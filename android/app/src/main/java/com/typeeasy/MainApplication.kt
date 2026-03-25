package com.typeeasy

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.typeeasy.AndroidPermissionsPackage
import com.typeeasy.VoiceAssistantPackage
import com.typeeasy.FloatingMicPackage
import com.typeeasy.VoiceKeyboardPackage
import com.typeeasy.AudioRecorderPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          // Temporarily disabled to isolate build issues
          add(AndroidPermissionsPackage())
          add(VoiceAssistantPackage())
          add(FloatingMicPackage())
          add(VoiceKeyboardPackage())
          add(AudioRecorderPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
