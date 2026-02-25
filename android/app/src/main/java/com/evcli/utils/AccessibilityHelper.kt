package com.evcli.utils

import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

/**
 * AccessibilityHelper - Modular accessibility functions for text field detection and injection
 * Clean, reusable helper methods for AccessibilityService operations
 */
object AccessibilityHelper {
    
    private const val TAG = "AccessibilityHelper"
    
    /**
     * Find the first editable node in the accessibility tree
     * Performs comprehensive recursive search with detailed logging
     * 
     * @param rootNode Root accessibility node to start search from
     * @return First found editable node or null if none found
     */
    fun findEditableNode(rootNode: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (rootNode == null) {
            Log.w(TAG, "[Accessibility] Root node is null")
            return null
        }
        
        Log.d(TAG, "[Accessibility] Root node detected")
        Log.d(TAG, "[Accessibility] Scanning nodes...")
        
        val startTime = System.currentTimeMillis()
        val editableNodes = mutableListOf<AccessibilityNodeInfo>()
        
        try {
            scanNodesRecursive(rootNode, editableNodes)
            
            val searchTime = System.currentTimeMillis() - startTime
            Log.d(TAG, "[Accessibility] Scanned nodes in ${searchTime}ms")
            Log.d(TAG, "[Accessibility] Found ${editableNodes.size} editable nodes")
            
            editableNodes.forEach { node ->
                Log.d(TAG, "[Accessibility] Editable node found: ${node.className}")
            }
            
            return editableNodes.firstOrNull()
            
        } catch (e: Exception) {
            Log.e(TAG, "[Accessibility] Error during node search", e)
            return null
        } finally {
            // Clean up nodes to prevent memory leaks
            editableNodes.forEach { if (it != rootNode) it.recycle() }
        }
    }
    
    /**
     * Recursively scan accessibility nodes for editable fields
     * Checks multiple conditions for better detection across different apps
     * 
     * @param node Current node to check
     * @param editableNodes List to collect found editable nodes
     */
    private fun scanNodesRecursive(node: AccessibilityNodeInfo, editableNodes: MutableList<AccessibilityNodeInfo>) {
        try {
            // Check if current node is editable using enhanced detection
            if (isNodeEditable(node)) {
                Log.d(TAG, "[Accessibility] Editable node detected: ${node.className}, text=${node.text}")
                editableNodes.add(node)
                return // Found editable node, no need to go deeper in this branch
            }
            
            // Recursively search child nodes
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    try {
                        scanNodesRecursive(child, editableNodes)
                    } finally {
                        child.recycle()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[Accessibility] Error scanning node: ${node.className}", e)
        }
    }
    
    /**
     * Enhanced detection of editable nodes
     * Checks multiple conditions to work with different app implementations
     * 
     * @param node Node to check for editability
     * @return true if node is editable, false otherwise
     */
    private fun isNodeEditable(node: AccessibilityNodeInfo): Boolean {
        val className = node.className?.toString() ?: ""
        
        // Multiple detection conditions for better compatibility
        val isEditable = node.isEditable
        val isEditText = className.contains("EditText", ignoreCase = true)
        val isTextInput = className.contains("TextInput", ignoreCase = true)
        val isTextField = className.contains("TextField", ignoreCase = true)
        val isAutoComplete = className.contains("AutoComplete", ignoreCase = true)
        val isWebViewInput = className.contains("WebViewInput", ignoreCase = true)
        
        // Relaxed criteria as per requirements
        val isFocusable = node.isFocusable
        val isClickable = node.isClickable
        val hasHint = !node.hintText.isNullOrEmpty()
        
        return isEditable || isEditText || isTextInput || isTextField || 
               isAutoComplete || isWebViewInput || isFocusable || isClickable || hasHint
    }
    
    /**
     * Inject text into an accessibility node using ACTION_SET_TEXT
     * Primary method for text injection with proper error handling
     * 
     * @param node Target node to inject text into
     * @param text Text to inject
     * @return true if injection succeeded, false otherwise
     */
    fun injectText(node: AccessibilityNodeInfo, text: String): Boolean {
        if (text.isEmpty()) {
            Log.w(TAG, "[Accessibility] Cannot inject empty text")
            return false
        }
        
        Log.d(TAG, "[Accessibility] Starting robust injection...")
        
        // STEP 7: Focus & Click
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        
        // Wait 500ms
        try { Thread.sleep(500) } catch (e: Exception) {}
        
        // STEP 8: Injection Order
        // 1. ACTION_SET_TEXT
        if (performSetText(node, text)) return true
        
        // CLIPBOARD PASTE (Simplified for helper)
        Log.w(TAG, "[Accessibility] SET_TEXT failed, consider using clipboard fallback in service")
        
        return false
    }

    private fun performSetText(node: AccessibilityNodeInfo, text: String): Boolean {
        return try {
            val arguments = Bundle().apply {
                putCharSequence(AccessibilityNodeInfoCompat.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            
            val result = node.performAction(
                AccessibilityNodeInfoCompat.ACTION_SET_TEXT,
                arguments
            )
            
            Log.d(TAG, "[Accessibility] ACTION_SET_TEXT result: $result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "[Accessibility] Error in ACTION_SET_TEXT", e)
            false
        }
    }
    
    /**
     * Get debug information about an accessibility node
     * Useful for logging and troubleshooting
     * 
     * @param node Node to get info from
     * @return Formatted string with node details
     */
    private fun getNodeInfo(node: AccessibilityNodeInfo): String {
        return try {
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
