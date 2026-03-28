package com.typeeasy.services

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import java.text.Normalizer
import java.util.Locale
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
    
    // ─── FLOATING MIC CONTROL ───────────────────────────────────────────────
    private var isMicVisible = false
    
    companion object {
        private const val TAG = "CentralInjectionCtrl"

        const val ACTION_VOICE_RESULT  = "com.typeeasy.VOICE_RESULT"
        const val EXTRA_TRANSCRIBED_TEXT = "transcribed_text"
        const val EXTRA_TIMESTAMP      = "timestamp"
        const val ACTION_RESET_INJECTION = "com.typeeasy.RESET_INJECTION"
        
        // Smart floating mic actions
        const val ACTION_SHOW_MIC = "com.typeeasy.SHOW_MIC"
        const val ACTION_HIDE_MIC = "com.typeeasy.HIDE_MIC"

        private const val ARG_SELECTION_START =
            "android.view.accessibility.action.ARGUMENT_SELECTION_START"
        private const val ARG_SELECTION_END =
            "android.view.accessibility.action.ARGUMENT_SELECTION_END"

        // How long after a successful injection to ignore further broadcasts.
        private const val COOLDOWN_MS = 5_000L

        // Delay before starting the injection attempt (lets the field settle
        // after focus changes; does NOT use Thread.sleep).
        private const val INJECTION_DELAY_MS = 200L

        
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
            eventTypes = AccessibilityEvent.TYPE_VIEW_FOCUSED or
                    AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            packageNames = null
            notificationTimeout = 100
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
                        intent?.action == "com.typeeasy.INSERT_TEXT"
                if (!isValidAction) return

                // ── STEP 3: Extract text ─────────────────────────────────────
                val text = when (intent?.action) {
                    ACTION_VOICE_RESULT      -> intent.getStringExtra(EXTRA_TRANSCRIBED_TEXT)
                    "com.typeeasy.INSERT_TEXT"  -> intent.getStringExtra("text")
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
            addAction("com.typeeasy.INSERT_TEXT")
            addAction(ACTION_RESET_INJECTION)
        }
        registerReceiver(voiceResultReceiver, filter)
        Log.d(TAG, "✅ Broadcast receiver registered")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!isServiceReady) return
        
        // Only handle focus-related events
        if (event?.eventType != AccessibilityEvent.TYPE_VIEW_FOCUSED &&
            event?.eventType != AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) return
        
        val root = rootInActiveWindow
        if (root == null) {
            // Transient during IME/app redraws; do not hide overlay (would kill mic/translate UX).
            return
        }
        
        val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        
        try {
            if (focusedNode != null && 
                focusedNode.isEditable && 
                focusedNode.isFocused) {
                Log.d(TAG, "Showing floating mic - editable field focused")
                showFloatingMic()
            } else {
                Log.d(TAG, "Hiding floating mic - no editable focused field")
                hideFloatingMic()
            }
        } finally {
            focusedNode?.recycle()
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
        try {
            val success = injectText(text)
            if (success) {
                onInjectionSuccess(text, "ACTION_SET_TEXT")
            } else {
                injectionInProgress.set(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception during injection", e)
            injectionInProgress.set(false)
        }
    }

    /**
     * Strip bidi / embedding controls WhatsApp & Telegram often embed in the visible "Message" text.
     */
    private fun stripBidiAndJoiners(s: String): String {
        return buildString {
            for (ch in s) {
                val c = ch.code
                if (c == 0xFEFF || c in 0x200C..0x200F || c in 0x202A..0x202E || c in 0x2066..0x2069) continue
                append(ch)
            }
        }
    }

    private fun normalizeForHintCompare(s: String): String {
        val stripped = stripBidiAndJoiners(s.trim())
        return Normalizer.normalize(stripped, Normalizer.Form.NFKC).lowercase(Locale.US)
    }

    /**
     * If the field still shows a hint-style value (e.g. WhatsApp "Message"), treat it as empty
     * and replace with the transcript; otherwise append after real user text.
     */
    private fun isPlaceholderOrHintContent(raw: String): Boolean {
        val key = normalizeForHintCompare(raw)
        if (key.isEmpty()) return true
        val hints = setOf(
            "message",
            "type a message",
            "type message",
            "enter message",
            "write a message",
            "say something",
            "search",
            "search messages",
            "add a caption",
            "caption",
            "comment",
            // Telegram / localized composer hints
            "nachricht",
            "nachricht schreiben",
            "schreiben",
            "сообщение",
            "написать сообщение",
            "mensaje",
            "escribir un mensaje",
            "messaggio",
            "scrivi un messaggio",
            "écrire un message",
            "bericht",
            "bericht schrijven",
            "پیام",
            "پیام بنویسید",
            "संदेश",
            "एक संदेश लिखें",
            "메시지 입력",
            "メッセージを入力",
        )
        if (key in hints) return true
        val oneWord = key.split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (oneWord.size == 1 && oneWord[0] in setOf("message", "msg", "chat", "search", "nachricht", "mensaje", "messaggio", "bericht", "сообщение", "پیام", "संदेश")) {
            return true
        }
        return false
    }

    private fun isMessengerChatPackage(packageName: String): Boolean {
        val p = packageName.lowercase(Locale.US)
        return p.startsWith("com.whatsapp") ||
            p.contains("telegram") ||
            p.startsWith("org.thunderdog.challegram") // Telegram X
    }

    /**
     * WhatsApp often exposes the hint word "Message" as real [text]. If the user dictates, we must
     * replace the whole composer with the transcript only — never append after "Message …".
     * Also fixes a previously bad injection like "Message no one else".
     */
    private fun messengerComposerIsPlaceholderOrLeak(packageName: String, cleaned: String): Boolean {
        if (!isMessengerChatPackage(packageName)) return false
        val key = normalizeForHintCompare(cleaned)
        if (key.isEmpty()) return true
        if (key == "message" || key == "msg") return true
        if (key.startsWith("message ") || key.startsWith("msg ")) return true
        return false
    }

    /**
     * WhatsApp sometimes ignores a single SET_TEXT and keeps prefix text; clear then set.
     */
    private fun messengerPerformSetText(node: AccessibilityNodeInfo, text: String): Boolean {
        val clear = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clear)
        val set = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, set)
    }

    /**
     * WhatsApp/Telegram sometimes report hint + transcript as "Message …" after a failed first pass;
     * strip a leading English "Message" word before appending again.
     */
    private fun recoverMessengerPlaceholderPrefix(packageName: String, current: String): String {
        if (!isMessengerChatPackage(packageName)) return current
        val t = current.trim()
        val m = Regex("^(?i)(message|msg)\\s+(.+)$").find(t) ?: return current
        val body = m.groupValues[2].trim()
        if (body.length < 2) return current
        return body
    }

    /**
     * True when the focused field content should be fully replaced (not appended to).
     */
    private fun shouldReplaceEntireField(node: AccessibilityNodeInfo, cleanedCurrent: String): Boolean {
        if (cleanedCurrent.isEmpty()) return true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val hintRaw = node.hintText?.toString().orEmpty()
            if (hintRaw.isNotEmpty()) {
                val hintNorm = normalizeForHintCompare(hintRaw)
                val curNorm = normalizeForHintCompare(cleanedCurrent)
                if (hintNorm.isNotEmpty() && curNorm == hintNorm) {
                    Log.d(TAG, "Field text matches hintText — treating as empty")
                    return true
                }
            }
        }
        if (isPlaceholderOrHintContent(cleanedCurrent)) return true
        return false
    }

    private fun buildInjectedText(currentRaw: String, newText: String, node: AccessibilityNodeInfo, packageName: String): String {
        val newTrim = newText.trim()
        val cleaned = stripBidiAndJoiners(currentRaw.trim()).let { recoverMessengerPlaceholderPrefix(packageName, it) }
        if (newTrim.isEmpty()) return cleaned
        if (cleaned.isEmpty()) return newTrim
        if (messengerComposerIsPlaceholderOrLeak(packageName, cleaned)) {
            Log.d(TAG, "Messenger: full replace (placeholder / Message-prefix leak)")
            return newTrim
        }
        if (shouldReplaceEntireField(node, cleaned)) return newTrim
        return "$cleaned $newTrim"
    }

    /**
     * Strict injection into the current focused EditText only.
     */
    private fun injectText(newText: String): Boolean {
        val root = rootInActiveWindow ?: return false
        try {
            val node = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
            val packageName = runCatching { root.packageName?.toString().orEmpty() }.getOrDefault("")
            try {
                if (
                    node.className != "android.widget.EditText" ||
                    !node.isEditable
                ) return false

                val currentRaw = node.text?.toString() ?: ""
                val textToInject = buildInjectedText(currentRaw, newText, node, packageName)

                Log.d(
                    TAG,
                    "💉 Injection pkg=$packageName existing='${currentRaw.trim()}', new='$newText', final='$textToInject'"
                )

                val ok = if (isMessengerChatPackage(packageName)) {
                    messengerPerformSetText(node, textToInject)
                } else {
                    val args = Bundle()
                    args.putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        textToInject
                    )
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                }

                if (ok && textToInject.isNotEmpty()) {
                    val len = textToInject.length
                    val sel = Bundle().apply {
                        putInt(ARG_SELECTION_START, len)
                        putInt(ARG_SELECTION_END, len)
                    }
                    val selOk = node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, sel)
                    if (!selOk) {
                        handler.postDelayed({
                            val n2 = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                            n2?.let {
                                try {
                                    it.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, sel)
                                } finally {
                                    it.recycle()
                                }
                            }
                        }, 80L)
                    }
                }

                return ok
            } finally {
                node.recycle()
            }
        } finally {
            root.recycle()
        }
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
