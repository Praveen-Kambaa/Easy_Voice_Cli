package com.typeeasy

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/** Voice command panel embedded in the keyboard — record → transcribe → edit → execute. */
class KeyboardVoiceCommandUi(
    private val context: Context,
    private val callbacks: Callbacks,
) {
    interface Callbacks {
        fun onRecordingStop()
        fun onRecordingCancel()
        fun onReviewCancel()
        fun onReviewSend(editedText: String)
        fun onTranscriptEditingChanged(active: Boolean) {}
    }

    private var theme = KeyboardTheme.light
    private var hasError = false
    /** When true, keyboard keys edit the voice-command transcript — not the host app field. */
    private var transcriptEditingActive = false

    val root: LinearLayout = LinearLayout(context).apply {
        tag = "voice_command_panel"
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        visibility = View.GONE
    }

    private val recordingRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        setPadding(dp(12), dp(10), dp(12), dp(10))
    }

    private val reviewSection = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        setPadding(dp(12), dp(10), dp(12), dp(10))
        visibility = View.GONE
    }

    private val recordingDot = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(8), dp(8)).also { it.setMargins(0, 0, dp(8), 0) }
        background = android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            setColor(Color.parseColor("#EF4444"))
        }
    }

    private val recordingStatus = TextView(context).apply {
        text = "Recording…"
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
    }

    private val recordingTimer = TextView(context).apply {
        text = "0:00"
        textSize = 13f
        setPadding(dp(10), 0, 0, 0)
    }

    private val transcriptInput = EditText(context).apply {
        hint = "Transcription will appear here…"
        textSize = 14f
        minLines = 2
        maxLines = 4
        background = null
        gravity = Gravity.TOP or Gravity.START
        setPadding(0, dp(6), 0, dp(4))
        isFocusable = true
        isFocusableInTouchMode = true
        isCursorVisible = true
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    }

    private val progressBar = ProgressBar(context).apply {
        visibility = View.GONE
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).also { it.topMargin = dp(6) }
    }

    private val statusText = TextView(context).apply {
        visibility = View.GONE
        textSize = 13f
        setPadding(0, dp(4), 0, 0)
    }

    private val reviewActions = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.END
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).also { it.topMargin = dp(8) }
    }

    private val sendBtn = TextView(context).apply {
        text = "Send"
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        setPadding(dp(16), dp(8), dp(16), dp(8))
        setOnClickListener {
            if (hasError) return@setOnClickListener
            val text = transcriptInput.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                setStatus("Enter text before sending", isError = true)
                return@setOnClickListener
            }
            setLoading(true, "Sending command…")
            callbacks.onReviewSend(text)
        }
    }

    val isActive: Boolean
        get() = root.visibility == View.VISIBLE

    val isRecording: Boolean
        get() = isActive && recordingRow.visibility == View.VISIBLE

    init {
        val stopBtn = actionBtn("Stop", isPrimary = true) { callbacks.onRecordingStop() }
        val cancelRecBtn = actionBtn("Cancel", isPrimary = false) { callbacks.onRecordingCancel() }

        recordingRow.addView(recordingDot)
        recordingRow.addView(recordingStatus)
        recordingRow.addView(recordingTimer)
        recordingRow.addView(View(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })
        recordingRow.addView(stopBtn)
        recordingRow.addView(cancelRecBtn)

        val headerRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        headerRow.addView(TextView(context).apply {
            text = "Voice command"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        headerRow.addView(TextView(context).apply {
            text = "✕"
            textSize = 16f
            setPadding(dp(8), dp(2), dp(4), dp(2))
            setOnClickListener { callbacks.onReviewCancel() }
        })

        val cancelReviewBtn = actionBtn("Cancel", isPrimary = false) { callbacks.onReviewCancel() }

        reviewSection.addView(headerRow)
        reviewSection.addView(transcriptInput)
        reviewSection.addView(progressBar)
        reviewSection.addView(statusText)
        reviewActions.addView(cancelReviewBtn)
        reviewActions.addView(sendBtn)
        reviewSection.addView(reviewActions)

        root.addView(recordingRow)
        root.addView(reviewSection)
        transcriptInput.setOnClickListener { activateTranscriptEditing() }
        transcriptInput.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus && reviewSection.visibility == View.VISIBLE && transcriptInput.isEnabled && !hasError) {
                activateTranscriptEditing()
            }
        }
        applyTheme(theme)
    }

    fun applyTheme(t: KeyboardTheme) {
        theme = t
        root.setBackgroundColor(t.resultBg)
        recordingStatus.setTextColor(t.primary)
        recordingTimer.setTextColor(t.hintText)
        transcriptInput.setTextColor(t.keyText)
        transcriptInput.setHintTextColor(t.hintText)
        headerTitleColor(t.keyText)
        sendBtn.background = roundRect(t.primary, dp(8))
    }

    private fun headerTitleColor(color: Int) {
        (reviewSection.getChildAt(0) as? LinearLayout)?.getChildAt(0)?.let {
            (it as? TextView)?.setTextColor(color)
        }
    }

    fun showRecording() {
        hasError = false
        deactivateTranscriptEditing()
        recordingRow.visibility = View.VISIBLE
        reviewSection.visibility = View.GONE
        recordingTimer.text = "0:00"
        root.visibility = View.VISIBLE
    }

    fun updateRecordingTimer(text: String) {
        recordingTimer.text = text
    }

    fun showReviewLoading(status: String) {
        hasError = false
        deactivateTranscriptEditing()
        recordingRow.visibility = View.GONE
        reviewSection.visibility = View.VISIBLE
        transcriptInput.visibility = View.VISIBLE
        transcriptInput.isEnabled = false
        transcriptInput.setText("")
        sendBtn.visibility = View.VISIBLE
        sendBtn.isEnabled = false
        reviewActions.visibility = View.VISIBLE
        setLoading(true, status)
        root.visibility = View.VISIBLE
    }

    fun showReview(transcript: String) {
        hasError = false
        recordingRow.visibility = View.GONE
        reviewSection.visibility = View.VISIBLE
        transcriptInput.visibility = View.VISIBLE
        transcriptInput.isEnabled = true
        transcriptInput.setText(transcript)
        transcriptInput.setSelection(transcript.length)
        sendBtn.visibility = View.VISIBLE
        sendBtn.isEnabled = true
        sendBtn.text = "Send"
        reviewActions.visibility = View.VISIBLE
        progressBar.visibility = View.GONE
        statusText.visibility = View.GONE
        root.visibility = View.VISIBLE
        activateTranscriptEditing()
        transcriptInput.post {
            transcriptInput.requestFocus()
            transcriptInput.setSelection(transcript.length)
        }
    }

    fun showReviewError(message: String) {
        hasError = true
        deactivateTranscriptEditing()
        recordingRow.visibility = View.GONE
        reviewSection.visibility = View.VISIBLE
        transcriptInput.visibility = View.GONE
        transcriptInput.isEnabled = false
        sendBtn.visibility = View.GONE
        sendBtn.isEnabled = false
        reviewActions.visibility = View.VISIBLE
        progressBar.visibility = View.GONE
        setStatus(message, isError = true)
        root.visibility = View.VISIBLE
    }

    fun setLoading(loading: Boolean, status: String? = null) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        if (!hasError) {
            sendBtn.isEnabled = !loading
            transcriptInput.isEnabled = !loading
        }
        if (status != null) setStatus(status, isError = false)
    }

    fun dismiss() {
        hasError = false
        transcriptEditingActive = false
        transcriptInput.text?.clear()
        transcriptInput.clearFocus()
        transcriptInput.isEnabled = true
        transcriptInput.visibility = View.GONE
        progressBar.visibility = View.GONE
        statusText.text = ""
        statusText.visibility = View.GONE
        sendBtn.isEnabled = true
        sendBtn.text = "Send"
        sendBtn.visibility = View.GONE
        reviewActions.visibility = View.GONE
        recordingRow.visibility = View.GONE
        reviewSection.visibility = View.GONE
        root.visibility = View.GONE
        root.requestLayout()
    }

    /** True while the review transcript should receive keyboard keys (not the host app). */
    fun shouldRouteKeysToTranscript(): Boolean =
        transcriptEditingActive &&
            reviewSection.visibility == View.VISIBLE &&
            transcriptInput.visibility == View.VISIBLE &&
            transcriptInput.isEnabled &&
            !hasError

    /**
     * Route a keyboard key to the voice-command transcript.
     * @return true if consumed (host app must not receive the key)
     */
    fun routeKey(logical: String, shiftOn: Boolean, capsOn: Boolean): Boolean {
        if (!shouldRouteKeysToTranscript()) return false
        when (logical) {
            "SHIFT", "?123", "ABC", "EMOJI" -> return false
            "BKSP" -> {
                deleteTranscriptChar()
                return true
            }
            "space" -> {
                insertTranscriptText(" ")
                return true
            }
            "ENTER" -> {
                insertTranscriptText("\n")
                return true
            }
            else -> {
                if (logical.length != 1) return false
                val out = if (shiftOn || capsOn) logical.uppercase() else logical
                insertTranscriptText(out)
                return true
            }
        }
    }

    fun insertTranscriptText(text: String): Boolean {
        if (!shouldRouteKeysToTranscript()) return false
        val editable = transcriptInput.text ?: return false
        val start = transcriptInput.selectionStart.coerceAtLeast(0)
        val end = transcriptInput.selectionEnd.coerceAtLeast(0)
        editable.replace(start.coerceAtMost(end), start.coerceAtLeast(end), text)
        val newPos = start + text.length
        transcriptInput.setSelection(newPos.coerceAtMost(editable.length))
        return true
    }

    private fun deleteTranscriptChar() {
        val editable = transcriptInput.text ?: return
        var start = transcriptInput.selectionStart.coerceAtLeast(0)
        var end = transcriptInput.selectionEnd.coerceAtLeast(0)
        if (start != end) {
            editable.delete(start.coerceAtMost(end), start.coerceAtLeast(end))
        } else if (start > 0) {
            editable.delete(start - 1, start)
            transcriptInput.setSelection(start - 1)
        }
    }

    fun releaseTranscriptEditing() {
        deactivateTranscriptEditing()
    }

    fun clearTranscript(): Boolean {
        if (!shouldRouteKeysToTranscript()) return false
        transcriptInput.setText("")
        transcriptInput.setSelection(0)
        return true
    }

    private fun activateTranscriptEditing() {
        if (hasError || reviewSection.visibility != View.VISIBLE || !transcriptInput.isEnabled) return
        if (!transcriptEditingActive) {
            transcriptEditingActive = true
            callbacks.onTranscriptEditingChanged(true)
        }
    }

    private fun deactivateTranscriptEditing() {
        if (!transcriptEditingActive) return
        transcriptEditingActive = false
        transcriptInput.clearFocus()
        callbacks.onTranscriptEditingChanged(false)
    }

    private fun setStatus(message: String, isError: Boolean) {
        statusText.visibility = View.VISIBLE
        statusText.text = if (isError) VoiceCommandErrorMapper.toUserMessage(message) else message
        statusText.setTextColor(
            if (isError) Color.parseColor("#DC2626") else theme.hintText,
        )
    }

    private fun actionBtn(label: String, isPrimary: Boolean, onClick: () -> Unit) = TextView(context).apply {
        text = label
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(dp(12), dp(8), dp(12), dp(8))
        if (isPrimary) {
            setTextColor(Color.WHITE)
            background = roundRect(theme.primary, dp(8))
        } else {
            setTextColor(theme.hintText)
            setPadding(dp(10), dp(8), dp(10), dp(8))
        }
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).also { if (label != "Cancel" || isPrimary) it.setMargins(dp(6), 0, 0, 0) }
        setOnClickListener { onClick() }
    }

    private fun roundRect(color: Int, radius: Int) =
        android.graphics.drawable.GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius.toFloat()
        }

    private fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()
}
