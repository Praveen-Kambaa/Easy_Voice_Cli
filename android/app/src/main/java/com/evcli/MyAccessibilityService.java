package com.evcli;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Enhanced Accessibility Service for Voice Text Injection
 * This service handles text injection from voice commands
 */
public class MyAccessibilityService extends AccessibilityService {

    private static final String TAG = "MyAccessibilityService";
    private static final String ACTION_VOICE_RESULT = "com.evcli.VOICE_RESULT";
    private static final String ACTION_RESET_INJECTION = "com.evcli.RESET_INJECTION";
    private static final String ACTION_SHOW_MIC = "com.evcli.SHOW_MIC";
    private static final String ACTION_HIDE_MIC = "com.evcli.HIDE_MIC";
    private static final String EXTRA_TRANSCRIBED_TEXT = "transcribed_text";
    
    private VoiceResultReceiver voiceResultReceiver;
    private final AtomicBoolean isInjecting = new AtomicBoolean(false);

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_VIEW_FOCUSED &&
                type != AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            // Do not hide on null root — transient state, skip this event
            return;
        }

        AccessibilityNodeInfo focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);

        if (focusedNode != null &&
                focusedNode.isEditable() &&
                focusedNode.isFocused()) {
            sendBroadcast(new Intent(ACTION_SHOW_MIC));
        } else {
            sendBroadcast(new Intent(ACTION_HIDE_MIC));
        }

        if (focusedNode != null) {
            focusedNode.recycle();
        }
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        Log.d(TAG, "Accessibility service connected");
        
        // Configure accessibility service info
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_VIEW_FOCUSED |
                AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS | 
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        info.packageNames = null; // All packages
        setServiceInfo(info);
        
        // Register broadcast receiver for voice results
        registerVoiceResultReceiver();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        Log.d(TAG, "Accessibility service unbinding");
        unregisterVoiceResultReceiver();
        return super.onUnbind(intent);
    }

    private void registerVoiceResultReceiver() {
        voiceResultReceiver = new VoiceResultReceiver();
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_VOICE_RESULT);
        filter.addAction(ACTION_RESET_INJECTION);
        registerReceiver(voiceResultReceiver, filter);
        Log.d(TAG, "Voice result receiver registered");
    }

    private void unregisterVoiceResultReceiver() {
        if (voiceResultReceiver != null) {
            unregisterReceiver(voiceResultReceiver);
            voiceResultReceiver = null;
            Log.d(TAG, "Voice result receiver unregistered");
        }
    }

    private void injectText(String text) {
        try {
            Log.d(TAG, "Attempting to inject text: " + text);

            AccessibilityNodeInfo node = getRootInActiveWindow() != null
                    ? getRootInActiveWindow().findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                    : null;
            if (node == null) {
                Log.w(TAG, "No focused input field found");
                return;
            }

            if (!node.isEditable() ||
                    !"android.widget.EditText".equals(node.getClassName())) {
                node.recycle();
                return;
            }

            String currentText = node.getText() != null ? node.getText().toString().trim() : null;
            String hintText = node.getHintText() != null ? node.getHintText().toString().trim() : null;
            boolean isShowingHint = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && node.isShowingHintText();
            boolean isPlaceholder = currentText == null ||
                    currentText.isEmpty() ||
                    (hintText != null && currentText.equals(hintText)) ||
                    isShowingHint ||
                    (node.getTextSelectionStart() == 0 &&
                     node.getTextSelectionEnd() == 0 &&
                     currentText != null &&
                     currentText.length() < 40);
            String existingText = isPlaceholder ? "" : currentText;

            String finalText = existingText.isEmpty()
                    ? text
                    : existingText + " " + text;

            Bundle arguments = new Bundle();
            arguments.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    finalText
            );

            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);
            Log.d(TAG, "Text injected successfully: " + finalText);

            node.recycle();
        } catch (Exception e) {
            Log.e(TAG, "Error injecting text", e);
        }
    }


    private void resetInjectionFlag() {
        isInjecting.set(false);
        Log.d(TAG, "Injection flag reset");
    }

    private class VoiceResultReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_VOICE_RESULT.equals(action)) {
                String text = intent.getStringExtra(EXTRA_TRANSCRIBED_TEXT);
                if (text != null && !text.isEmpty()) {
                    Log.d(TAG, "Received voice result: " + text);
                    if (!isInjecting.compareAndSet(false, true)) {
                        Log.w(TAG, "Injection already in progress — skipping");
                        return;
                    }
                    try {
                        injectText(text);
                    } finally {
                        isInjecting.set(false);
                    }
                }
            } else if (ACTION_RESET_INJECTION.equals(action)) {
                resetInjectionFlag();
            }
        }
    }
}
