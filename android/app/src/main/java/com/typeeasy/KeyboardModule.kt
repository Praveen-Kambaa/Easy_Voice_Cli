package com.typeeasy

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KeyboardModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "KeyboardModule"

    private val imeId get() = "${reactContext.packageName}/.MyKeyboardService"

    companion object {
        const val PREFS = "keyboard_prefs"
        const val KEY_USER_ID = "user_id"
        const val KEY_FROM_LANG = "from_lang"
        const val KEY_TO_LANG = "to_lang"
    }

    @ReactMethod
    fun openKeyboardSettings() {
        Handler(Looper.getMainLooper()).post {
            try {
                val intent = Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                reactContext.applicationContext.startActivity(intent)
            } catch (e: Exception) {
                try {
                    val fallback = Intent(Settings.ACTION_SETTINGS)
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactContext.applicationContext.startActivity(fallback)
                } catch (_: Exception) {}
            }
        }
    }

    @ReactMethod
    fun showKeyboardPicker() {
        Handler(Looper.getMainLooper()).post {
            try {
                val imm = reactContext.applicationContext
                    .getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                imm?.showInputMethodPicker()
            } catch (e: Exception) {
                openKeyboardSettings()
            }
        }
    }

    /** Returns true if the Type Easy keyboard is in the enabled IME list. */
    @ReactMethod
    fun isKeyboardEnabled(promise: Promise) {
        try {
            val imm = reactContext.applicationContext
                .getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            val enabled = imm?.enabledInputMethodList?.any { it.id == imeId } ?: false
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Returns true if the Type Easy keyboard is the currently selected (default) IME. */
    @ReactMethod
    fun isKeyboardSelected(promise: Promise) {
        try {
            val selected = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD
            )
            promise.resolve(selected == imeId)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Persists app settings needed by MyKeyboardService while it runs outside React Native.
     */
    @ReactMethod
    fun syncKeyboardSettings(userId: String?, fromLang: String?, toLang: String?, promise: Promise) {
        try {
            reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_USER_ID, userId?.trim().orEmpty())
                .putString(KEY_FROM_LANG, fromLang?.trim().orEmpty().ifEmpty { "en" })
                .putString(KEY_TO_LANG, toLang?.trim().orEmpty().ifEmpty { "ta" })
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("KEYBOARD_SYNC_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getKeyboardSettings(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val map = Arguments.createMap().apply {
                putString("userId", prefs.getString(KEY_USER_ID, "")?.trim().orEmpty())
                putString("fromLang", prefs.getString(KEY_FROM_LANG, "en")?.trim().orEmpty().ifEmpty { "en" })
                putString("toLang", prefs.getString(KEY_TO_LANG, "ta")?.trim().orEmpty().ifEmpty { "ta" })
                putBoolean("hasFromLang", prefs.contains(KEY_FROM_LANG))
                putBoolean("hasToLang", prefs.contains(KEY_TO_LANG))
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("KEYBOARD_SETTINGS_READ_ERROR", e.message, e)
        }
    }
}
