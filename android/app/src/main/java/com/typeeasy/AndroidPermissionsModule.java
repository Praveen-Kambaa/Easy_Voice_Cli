package com.typeeasy;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityManager;

import androidx.annotation.NonNull;

import com.typeeasy.BuildConfig;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;

/**
 * Native Android module for handling overlay and accessibility permissions
 * Provides methods to check permissions and open relevant settings
 */
@ReactModule(name = "AndroidPermissionsModule")
public class AndroidPermissionsModule extends ReactContextBaseJavaModule {

    private static final String E_PERMISSION_ERROR = "E_PERMISSION_ERROR";
    private static final String OVERLAY_PERMISSION = "SYSTEM_ALERT_WINDOW";

    public AndroidPermissionsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "AndroidPermissionsModule";
    }

    /**
     * App version name from {@code android.defaultConfig.versionName} in app/build.gradle (BuildConfig.VERSION_NAME).
     */
    @ReactMethod
    public void getAppVersion(Promise promise) {
        try {
            promise.resolve(BuildConfig.VERSION_NAME);
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to get app version", e);
        }
    }

    /**
     * Check if overlay permission is granted
     * Uses Settings.canDrawOverlays() for Android 6.0+
     */
    @ReactMethod
    public void checkOverlayPermission(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                // Overlay permission is automatically granted on Android < 6.0
                promise.resolve(true);
                return;
            }

            Context context = getReactApplicationContext();
            boolean hasPermission = Settings.canDrawOverlays(context);
            promise.resolve(hasPermission);
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to check overlay permission", e);
        }
    }

    /**
     * Check if accessibility service is enabled
     */
    @ReactMethod
    public void checkAccessibilityPermission(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AccessibilityManager accessibilityManager = 
                (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            
            boolean isEnabled = accessibilityManager.isEnabled();
            
            // Additional check to see if our specific service is enabled
            // This would need to be customized based on your accessibility service
            String packageName = context.getPackageName();
            boolean isServiceEnabled = isEnabled && isAccessibilityServiceEnabled(context, packageName);
            
            promise.resolve(isServiceEnabled);
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to check accessibility permission", e);
        }
    }

    /**
     * Get the current package name
     */
    @ReactMethod
    public void getPackageName(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String packageName = context.getPackageName();
            promise.resolve(packageName);
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to get package name", e);
        }
    }

    /**
     * Open overlay permission settings using ACTION_MANAGE_OVERLAY_PERMISSION
     * This directly opens the overlay permission screen, NOT the app info screen
     */
    @ReactMethod
    public void openOverlaySettings(Promise promise) {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                promise.reject(E_PERMISSION_ERROR, "No current activity");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Create intent for overlay permission settings
                // This opens the specific "Display over other apps" screen
                // NOT the generic app info screen
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                intent.setData(Uri.parse("package:" + currentActivity.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                
                // Verify the intent can be resolved
                if (intent.resolveActivity(currentActivity.getPackageManager()) != null) {
                    currentActivity.startActivity(intent);
                    promise.resolve(true);
                } else {
                    // Fallback to app settings if overlay settings not available
                    openAppSettings(promise);
                }
            } else {
                // For Android < 6.0, overlay permission is automatically granted
                // But we can still open app settings for consistency
                openAppSettings(promise);
            }
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to open overlay settings", e);
        }
    }

    /**
     * Open accessibility settings using ACTION_ACCESSIBILITY_SETTINGS
     * This directly opens the accessibility services screen, NOT app info screen
     */
    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                promise.reject(E_PERMISSION_ERROR, "No current activity");
                return;
            }

            // Create intent for accessibility settings
            // This opens the specific accessibility services screen
            // NOT the generic app info screen
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            
            // Verify that accessibility settings exist on this device
            if (intent.resolveActivity(currentActivity.getPackageManager()) != null) {
                currentActivity.startActivity(intent);
                promise.resolve(true);
            } else {
                // Some devices might not have accessibility settings
                // Fallback to app settings
                openAppSettings(promise);
            }
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to open accessibility settings", e);
        }
    }

    /**
     * Open app settings as fallback method
     * This opens the generic app info screen - ONLY used as fallback
     * when specific permission settings are not available
     */
    @ReactMethod
    public void openAppSettings(Promise promise) {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                promise.reject(E_PERMISSION_ERROR, "No current activity");
                return;
            }

            // Create intent for app info screen
            // This is the FALLBACK method that opens generic app info
            // We prefer specific permission screens over this
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", currentActivity.getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            
            currentActivity.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject(E_PERMISSION_ERROR, "Failed to open app settings", e);
        }
    }

    /**
     * Check if our specific accessibility service is enabled
     * This method checks if any accessibility service for our package is enabled
     */
    private boolean isAccessibilityServiceEnabled(Context context, String packageName) {
        try {
            AccessibilityManager accessibilityManager = 
                (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            
            if (!accessibilityManager.isEnabled()) {
                return false;
            }

            // Get the list of enabled accessibility services
            String enabledServices = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            );

            if (TextUtils.isEmpty(enabledServices)) {
                return false;
            }

            // Check if our package's accessibility service is in the enabled list
            String[] enabledServicesList = enabledServices.split(":");
            for (String enabledService : enabledServicesList) {
                if (enabledService.contains(packageName)) {
                    return true;
                }
            }

            return false;
        } catch (Exception e) {
            // In case of any error, assume service is not enabled
            return false;
        }
    }
}
