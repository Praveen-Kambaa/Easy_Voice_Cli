package com.typeeasy.utils

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.speech.RecognizerIntent
import android.view.accessibility.AccessibilityManager

/**
 * Permission Utilities
 * Handles Android special permissions for overlay and accessibility
 * Provides compatibility for Android 10-14 restrictions
 */
object PermissionUtils {
    
    /**
     * Check if overlay permission is granted
     */
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true // Automatically granted on Android < 6.0
        }
    }
    
    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val accessibilityManager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        
        if (!accessibilityManager.isEnabled) {
            return false
        }
        
        try {
            val enabledServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            
            if (enabledServices.isNullOrEmpty()) {
                return false
            }
            
            val packageName = context.packageName
            val serviceList = enabledServices.split(":")
            
            return serviceList.any { it.contains(packageName) }
            
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
    
    /**
     * Check if record audio permission is granted
     */
    fun hasRecordAudioPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Automatically granted on Android < 6.0
        }
    }
    
    /**
     * Open overlay permission settings
     */
    fun openOverlaySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
            openAppSettings(context)
        }
    }
    
    /**
     * Open accessibility settings
     */
    fun openAccessibilitySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
            openAppSettings(context)
        }
    }
    
    /**
     * Open app settings as fallback
     */
    private fun openAppSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * Check if all required permissions are granted
     */
    fun areAllPermissionsGranted(context: Context): Boolean {
        return canDrawOverlays(context) &&
               isAccessibilityServiceEnabled(context) &&
               hasRecordAudioPermission(context)
    }
    
    /**
     * Get missing permissions list
     */
    fun getMissingPermissions(context: Context): List<String> {
        val missing = mutableListOf<String>()
        
        if (!canDrawOverlays(context)) {
            missing.add("Overlay")
        }
        
        if (!isAccessibilityServiceEnabled(context)) {
            missing.add("Accessibility")
        }
        
        if (!hasRecordAudioPermission(context)) {
            missing.add("Record Audio")
        }
        
        return missing
    }
    
    /**
     * Check if device supports speech recognition
     */
    fun supportsSpeechRecognition(context: Context): Boolean {
        return try {
            val pm = context.packageManager
            val activities = pm.queryIntentActivities(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0
            )
            activities.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }
}
