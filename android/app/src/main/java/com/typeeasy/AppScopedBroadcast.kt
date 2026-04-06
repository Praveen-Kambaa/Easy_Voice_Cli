package com.typeeasy

import android.content.Context
import android.content.Intent

/**
 * Android 14+ (and stricter on 15/16): implicit broadcasts are not delivered to
 * [Context.registerReceiver] registrations that use [Context.RECEIVER_NOT_EXPORTED].
 * Scoping the intent to this package makes it explicit and restores same-app delivery.
 */
 
fun Context.sendAppScopedBroadcast(intent: Intent) {
    intent.setPackage(packageName)
    sendBroadcast(intent)
}
