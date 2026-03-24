package com.evcli

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.evcli.AndroidPermissionsPackage
import com.evcli.VoiceAssistantPackage
import com.evcli.FloatingMicPackage
import com.evcli.VoiceKeyboardPackage
import com.evcli.AudioRecorderPackage

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
