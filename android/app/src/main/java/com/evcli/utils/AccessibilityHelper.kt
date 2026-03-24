package com.evcli.utils

import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * AccessibilityHelper - Clean utility functions only
 * All scanning and fallback logic removed per strict requirements
 */
object AccessibilityHelper {
    
    private const val TAG = "AccessibilityHelper"
    
    /**
     * Get debug information about an accessibility node
     * Useful for logging and troubleshooting
     * 
     * @param node Node to get info from
     * @return Formatted string with node details
     */
    fun getNodeInfo(node: AccessibilityNodeInfo?): String {
        return try {
            if (node == null) return "Node is null"
            "class=${node.className?.takeLast(20)}, " +
            "text='${node.text?.takeLast(15)}', " +
            "editable=${node.isEditable}, " +
            "focused=${node.isFocused}, " +
            "enabled=${node.isEnabled}"
        } catch (e: Exception) {
            "Error getting node info: ${e.message}"
        }
    }
}
