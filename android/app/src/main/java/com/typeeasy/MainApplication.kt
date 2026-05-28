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
import com.typeeasy.PhoneCallsPackage
import com.typeeasy.AudioPickerPackage
import com.typeeasy.AudioTranscodePackage
import com.typeeasy.KeyboardPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(AndroidPermissionsPackage())
          add(VoiceAssistantPackage())
          add(FloatingMicPackage())
          add(VoiceKeyboardPackage())
          add(AudioRecorderPackage())
          add(PhoneCallsPackage())
          add(AudioPickerPackage())
          add(AudioTranscodePackage())
          add(KeyboardPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
