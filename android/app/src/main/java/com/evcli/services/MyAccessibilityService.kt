package com.evcli.services

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * CENTRAL INJECTION CONTROLLER
 * ─────────────────────────────
 * Single source of truth for all text injection.
 *
 * Guarantees:
 *  • Injection fires EXACTLY ONE TIME per voice result.
 *  • No retries after success.
 *  • No clipboard fallback after ACTION_SET_TEXT success.
 *  • No Thread.sleep() anywhere.
 *  • 5-second post-success cooldown blocks late duplicate broadcasts.
 *  • AtomicBoolean gate prevents concurrent injection races.
 */
class MyAccessibilityService : AccessibilityService() {

    private var voiceResultReceiver: BroadcastReceiver? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isServiceReady = false
    
    // ─── SMART FLOATING MIC CONTROL ────────────────────────────────────────
    private var hideMicRunnable: Runnable? = null
    private var isMicVisible = false
    
    companion object {
        private const val TAG = "CentralInjectionCtrl"

        const val ACTION_VOICE_RESULT  = "com.evcli.VOICE_RESULT"
        const val EXTRA_TRANSCRIBED_TEXT = "transcribed_text"
        const val EXTRA_TIMESTAMP      = "timestamp"
        const val ACTION_RESET_INJECTION = "com.evcli.RESET_INJECTION"
        
        // Smart floating mic actions
        const val ACTION_SHOW_MIC = "com.evcli.SHOW_MIC"
        const val ACTION_HIDE_MIC = "com.evcli.HIDE_MIC"

        // How long after a successful injection to ignore further broadcasts.
        private const val COOLDOWN_MS = 5_000L

        // Delay before starting the injection attempt (lets the field settle
        // after focus changes; does NOT use Thread.sleep).
        private const val INJECTION_DELAY_MS = 200L

        // Clipboard settle delay (no Thread.sleep — used in postDelayed).
        private const val CLIPBOARD_SETTLE_MS = 150L
        
        // Delay before hiding mic when text field loses focus
        private const val HIDE_MIC_DELAY_MS = 300L
        
        // ─── CENTRAL INJECTION GATE ────────────────────────────────────────────
        // A SINGLE AtomicBoolean is the only guard for concurrent injection.
        // It is set to true the moment a broadcast is accepted, and stays true
        // until resetInjectionGate() is explicitly called (new recording session).
        private val injectionInProgress = AtomicBoolean(false)

        // After injection succeeds, we store a timestamp. Any broadcast arriving
        // within COOLDOWN_MS of a successful injection is silently dropped.
        private val lastSuccessTimestamp = AtomicLong(0L)
    }

    // ─── SERVICE LIFECYCLE ────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "✅ Central Injection Controller connected")
        configureService()
        registerVoiceResultReceiver()
        isServiceReady = true
        showToast("Voice text injection ready")
    }

    private fun configureService() {
        val info = AccessibilityServiceInfo().apply {
            // Subscribe to events needed for text field detection and injection
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_VIEW_FOCUSED or
                    AccessibilityEvent.TYPE_VIEW_CLICKED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED

            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC

            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS

            packageNames = null
            notificationTimeout = 50
        }
        serviceInfo = info
        Log.d(TAG, "Service configured")
    }

    private fun registerVoiceResultReceiver() {
        voiceResultReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {

                // ── STEP 1: Reset gate on explicit reset signal ──────────────
                if (intent?.action == ACTION_RESET_INJECTION) {
                    resetInjectionGate()
                    return
                }

                // ── STEP 2: Accept only valid action names ───────────────────
                val isValidAction = intent?.action == ACTION_VOICE_RESULT ||
                        intent?.action == "com.evcli.INSERT_TEXT"
                if (!isValidAction) return

                // ── STEP 3: Extract text ─────────────────────────────────────
                val text = when (intent?.action) {
                    ACTION_VOICE_RESULT      -> intent.getStringExtra(EXTRA_TRANSCRIBED_TEXT)
                    "com.evcli.INSERT_TEXT"  -> intent.getStringExtra("text")
                    else                     -> null
                }
                if (text.isNullOrEmpty()) {
                    Log.w(TAG, "⚠️  Received empty text — ignored")
                    return
                }

                // ── STEP 4: COOLDOWN CHECK — drop broadcasts arriving too soon
                //            after the last successful injection ───────────────
                val now = System.currentTimeMillis()
                val msSinceLastSuccess = now - lastSuccessTimestamp.get()
                if (lastSuccessTimestamp.get() > 0L && msSinceLastSuccess < COOLDOWN_MS) {
                    Log.w(TAG, "🚫 IGNORED — within ${COOLDOWN_MS}ms cooldown window " +
                            "(${msSinceLastSuccess}ms since last success)")
                    return
                }

                // ── STEP 5: ATOMIC GATE — only one injection at a time ───────
                // compareAndSet(false, true) returns true only if it changed the
                // value from false → true (meaning we are the first/only caller).
                if (!injectionInProgress.compareAndSet(false, true)) {
                    Log.w(TAG, "🚫 IGNORED — injection already in progress (atomic gate)")
                    return
                }

                Log.d(TAG, "🟢 INJECTION TRIGGERED — text: \"$text\"")

                // ── STEP 6: Schedule injection with a small delay so the target
                //            field has time to stabilise after the user tapped mic. ──
                handler.postDelayed({
                    performSingleInjection(text)
                }, INJECTION_DELAY_MS)
            }
        }

        val filter = IntentFilter().apply {
            addAction(ACTION_VOICE_RESULT)
            addAction("com.evcli.INSERT_TEXT")
            addAction(ACTION_RESET_INJECTION)
        }
        registerReceiver(voiceResultReceiver, filter)
        Log.d(TAG, "✅ Broadcast receiver registered")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        when (event?.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                Log.v(TAG, "Window changed: ${event.packageName}")
                // Check for text fields when window changes
                detectAndHandleTextField()
            }
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                Log.v(TAG, "View focused: ${event.className}")
                // Immediately check for text field focus
                detectAndHandleTextField()
            }
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                Log.v(TAG, "View clicked: ${event.className}")
                // Check for text field when view is clicked
                detectAndHandleTextField()
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // Only process if content change might affect text fields
                if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                    // Check immediately without delay for real-time response
                    detectAndHandleTextField()
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Service interrupted")
        isServiceReady = false
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceReady = false
        handler.removeCallbacksAndMessages(null)
        hideMicRunnable?.let { handler.removeCallbacks(it) }
        voiceResultReceiver?.let { r ->
            runCatching { unregisterReceiver(r) }
        }
        voiceResultReceiver = null
        Log.d(TAG, "Service destroyed")
    }

    // ─── CENTRAL INJECTION METHOD — called EXACTLY ONCE per voice result ──────

    /**
     * The one and only entry point for text injection.
     * Runs entirely via handler.postDelayed — no Thread.sleep.
     * Releases the injection gate when finished (success or failure).
     */
    private fun performSingleInjection(text: String) {
        if (!isServiceReady) {
            Log.e(TAG, "❌ Service not ready — aborting")
            injectionInProgress.set(false)
            return
        }

        Log.d(TAG, "=== SINGLE INJECTION ATTEMPT — text: \"$text\" ===")

        val rootNode = getRootNodeSafely()
        if (rootNode == null) {
            Log.e(TAG, "❌ Root node unavailable — aborting, gate released")
            injectionInProgress.set(false)
            return
        }

        try {
            val targetNode = findBestInputNode(rootNode)
            if (targetNode == null) {
                Log.e(TAG, "❌ No suitable text field found — aborting, gate released")
                injectionInProgress.set(false)
                showToast("No focusable text field found")
                return
            }

            // Focus the target field first.
            targetNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

            // ── PRIMARY PATH: ACTION_SET_TEXT ─────────────────────────────
            // Trust the boolean return value of performAction.
            // If it returns true, text was injected — DONE. No fallback.
            val setTextSuccess = tryActionSetText(targetNode, text)
            if (setTextSuccess) {
                onInjectionSuccess(text, "ACTION_SET_TEXT")
                targetNode.recycle()
                rootNode.recycle()
                return
            }

            // ── FALLBACK PATH: Clipboard paste ────────────────────────────
            // Only reached if ACTION_SET_TEXT returned false.
            Log.d(TAG, "⚠️  ACTION_SET_TEXT returned false — trying clipboard paste")
            tryClipboardPaste(targetNode, text) {
                // This callback fires after the clipboard settle delay.
                onInjectionSuccess(text, "clipboard paste")
            }

            targetNode.recycle()

        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception during injection", e)
            injectionInProgress.set(false)
        } finally {
            // rootNode recycle is inside the try block for the success path.
            // For exceptions, recycle here if it wasn't already recycled.
            runCatching { rootNode.recycle() }
        }
    }

    // ─── INJECTION HELPERS ────────────────────────────────────────────────────

    /**
     * Attempt ACTION_SET_TEXT.
     * Returns true if the system confirmed the action succeeded.
     * Does NOT block the thread.
     */
    private fun tryActionSetText(node: AccessibilityNodeInfo, text: String): Boolean {
        return try {
            val args = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text
                )
            }
            val result = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "ACTION_SET_TEXT result: $result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "ACTION_SET_TEXT exception", e)
            false
        }
    }

    /**
     * Copy text to clipboard then schedule ACTION_PASTE via handler (no Thread.sleep).
     * The [onSuccess] lambda is invoked only if ACTION_PASTE returns true.
     */
    private fun tryClipboardPaste(
        node: AccessibilityNodeInfo,
        text: String,
        onSuccess: () -> Unit
    ) {
        try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("voice_input", text))
            Log.d(TAG, "Text copied to clipboard")
        } catch (e: Exception) {
            Log.e(TAG, "Clipboard write failed", e)
            injectionInProgress.set(false)
            return
        }

        // Wait for the clipboard to be ready without blocking the main thread.
        handler.postDelayed({
            try {
                val pasteResult = node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                Log.d(TAG, "ACTION_PASTE result: $pasteResult")
                if (pasteResult) {
                    onSuccess()
                } else {
                    Log.e(TAG, "❌ Both injection methods failed — gate released")
                    showToast("Text injection failed")
                    injectionInProgress.set(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "ACTION_PASTE exception", e)
                injectionInProgress.set(false)
            }
        }, CLIPBOARD_SETTLE_MS)
    }

    /**
     * Called exactly once after a successful injection.
     * Records timestamp and releases the gate only via resetInjectionGate().
     * The gate itself stays locked (true) until a new recording session starts,
     * which prevents any late-arriving duplicate broadcast from re-triggering.
     */
    private fun onInjectionSuccess(text: String, method: String) {
        lastSuccessTimestamp.set(System.currentTimeMillis())
        Log.d(TAG, "🎯 INJECTION COMPLETED — method: $method, text: \"$text\"")
        showToast("Injected: $text")
        // NOTE: intentionally do NOT call injectionInProgress.set(false) here.
        // The gate stays locked until the user starts a new recording session
        // (FloatingMicService sends ACTION_RESET_INJECTION).
    }

    // ─── NODE FINDING — TIGHTENED CRITERIA ───────────────────────────────────

    /**
     * Find the best input node from the accessibility tree.
     * Priority:
     *  1. Node with input focus that is editable.
     *  2. Any editable node visible to user.
     * We do NOT fall back to "isFocusable || isClickable" — that's too broad.
     */
    private fun findBestInputNode(rootNode: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        // First: try the node that currently has input focus.
        val focused = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null && isStrictlyEditable(focused)) {
            Log.d(TAG, "✅ Found focused editable node: ${focused.className}")
            return focused
        }
        focused?.recycle()

        // Second: walk the tree for any visible editable field.
        val candidates = mutableListOf<AccessibilityNodeInfo>()
        collectEditableNodes(rootNode, candidates)

        if (candidates.isEmpty()) {
            Log.e(TAG, "No editable nodes found in tree")
            return null
        }

        // Prefer the first focused one, else the first found.
        val best = candidates.find { it.isFocused } ?: candidates.first()
        Log.d(TAG, "✅ Best candidate: class=${best.className}, focused=${best.isFocused}")

        // Recycle all candidates except the selected one.
        candidates.filter { it != best }.forEach { it.recycle() }
        return best
    }

    /**
     * Strict editable check:
     * The node must be editable (framework flag) AND enabled AND visible.
     * No guessing from class name alone.
     */
    private fun isStrictlyEditable(node: AccessibilityNodeInfo): Boolean {
        return node.isEditable && node.isEnabled && node.isVisibleToUser
    }

    /**
     * Class-name based check as a secondary signal (only for tree walk).
     * Used together with isEnabled + isVisibleToUser — never alone.
     */
    private fun isEditableByClassName(className: String): Boolean {
        return className.contains("EditText", ignoreCase = true) ||
                className.contains("TextInput", ignoreCase = true) ||
                className.contains("AutoComplete", ignoreCase = true) ||
                className.contains("TextField", ignoreCase = true)
    }

    private fun collectEditableNodes(
        node: AccessibilityNodeInfo,
        result: MutableList<AccessibilityNodeInfo>
    ) {
        val className = node.className?.toString() ?: ""

        // Accept if strictly editable OR if class name strongly suggests an input
        // AND the node is enabled and visible.
        val isCandidate = isStrictlyEditable(node) ||
                (isEditableByClassName(className) && node.isEnabled && node.isVisibleToUser)

        if (isCandidate) {
            result.add(AccessibilityNodeInfo.obtain(node))
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectEditableNodes(child, result)
            } finally {
                child.recycle()
            }
        }
    }

    // ─── ROOT NODE ────────────────────────────────────────────────────────────

    private fun getRootNodeSafely(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow
        if (root == null) Log.w(TAG, "rootInActiveWindow is null")
        return root
    }

    // ─── GATE MANAGEMENT ─────────────────────────────────────────────────────

    /**
     * Resets the injection gate so a new voice recording can trigger injection.
     * Called from FloatingMicService (via ACTION_RESET_INJECTION broadcast) each
     * time the user initiates a new recording session.
     */
    private fun resetInjectionGate() {
        injectionInProgress.set(false)
        lastSuccessTimestamp.set(0L)
        Log.d(TAG, "🔄 Injection gate reset — ready for new recording")
    }

    /**
     * Public entry-point for direct callers (e.g., future native modules).
     */
    fun resetForNewRecording() {
        resetInjectionGate()
    }

    // ─── UTILITY ─────────────────────────────────────────────────────────────

    private fun showToast(message: String) {
        handler.post {
            runCatching { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
        }
    }
    
    // ─── SMART FLOATING MIC DETECTION ───────────────────────────────────────────
    
    /**
     * Detect active text fields and show/hide floating mic accordingly
     */
    private fun detectAndHandleTextField() {
        if (!isServiceReady) return
        
        val rootNode = getRootNodeSafely() ?: return
        
        try {
            val hasActiveTextField = detectActiveTextField(rootNode)
            
            if (hasActiveTextField) {
                // Cancel any pending hide operation
                hideMicRunnable?.let { handler.removeCallbacks(it) }
                
                if (!isMicVisible) {
                    Log.d(TAG, "📝 EditText Focused → Show Mic")
                    showFloatingMic()
                }
            } else {
                // Hide immediately without delay
                hideMicRunnable?.let { handler.removeCallbacks(it) }
                
                if (isMicVisible) {
                    Log.d(TAG, "📱 Focus Lost → Hide Mic")
                    hideFloatingMic()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in text field detection", e)
        } finally {
            rootNode.recycle()
        }
    }
    
    /**
     * Detect if there's an active text field using the specified priority rules
     */
    private fun detectActiveTextField(rootNode: AccessibilityNodeInfo): Boolean {
        // Priority 1: Check for focused editable node
        val focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focusedNode != null) {
            val isEditable = isTextFieldNode(focusedNode)
            focusedNode.recycle()
            if (isEditable) {
                Log.d(TAG, "✅ Found focused editable text field")
                return true
            }
        }
        
        // Priority 2: Search for any editable node in the tree
        val editableNodes = mutableListOf<AccessibilityNodeInfo>()
        collectTextFieldNodes(rootNode, editableNodes)
        
        // Check if any node is focused and editable
        val focusedEditable = editableNodes.find { it.isFocused }
        if (focusedEditable != null) {
            Log.d(TAG, "✅ Found focused editable node in tree: ${focusedEditable.className}")
            editableNodes.forEach { it.recycle() }
            return true
        }
        
        // Clean up
        editableNodes.forEach { it.recycle() }
        
        Log.v(TAG, "No active text field detected")
        return false
    }
    
    /**
     * Check if a node is a text field using the specified priority rules
     */
    private fun isTextFieldNode(node: AccessibilityNodeInfo): Boolean {
        // Priority 1: node.isEditable == true
        if (node.isEditable) {
            Log.v(TAG, "Text field detected by isEditable flag")
            return true
        }
        
        // Priority 2: className contains EditText
        val className = node.className?.toString() ?: ""
        if (className.contains("EditText", ignoreCase = true)) {
            Log.v(TAG, "Text field detected by EditText className")
            return true
        }
        
        // Priority 3: node.isFocusable == true AND node.isClickable == true AND node.text is empty
        if (node.isFocusable && node.isClickable) {
            val text = node.text?.toString() ?: ""
            if (text.isEmpty()) {
                Log.v(TAG, "Text field detected by focusable+clickable+empty text")
                return true
            }
        }
        
        return false
    }
    
    /**
     * Collect all potential text field nodes from the accessibility tree
     */
    private fun collectTextFieldNodes(
        node: AccessibilityNodeInfo,
        result: MutableList<AccessibilityNodeInfo>
    ) {
        if (isTextFieldNode(node)) {
            result.add(AccessibilityNodeInfo.obtain(node))
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectTextFieldNodes(child, result)
            } finally {
                child.recycle()
            }
        }
    }
    
    /**
     * Show the floating mic overlay
     */
    private fun showFloatingMic() {
        try {
            val intent = Intent(ACTION_SHOW_MIC)
            sendBroadcast(intent)
            isMicVisible = true
            Log.d(TAG, "🎤 Showed floating mic")
        } catch (e: Exception) {
            Log.e(TAG, "Error showing floating mic", e)
        }
    }
    
    /**
     * Hide the floating mic overlay
     */
    private fun hideFloatingMic() {
        try {
            val intent = Intent(ACTION_HIDE_MIC)
            sendBroadcast(intent)
            isMicVisible = false
            Log.d(TAG, "🔇 Hid floating mic")
        } catch (e: Exception) {
            Log.e(TAG, "Error hiding floating mic", e)
        }
    }
}
