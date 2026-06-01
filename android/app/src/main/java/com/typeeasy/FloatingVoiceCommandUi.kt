package com.typeeasy

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Voice command UI anchored to the floating bubble — no bottom sheets or separate overlays.
 * record → /transcribe → edit → /execute, all beside the FAB.
 */
class FloatingVoiceCommandUi(
    private val context: Context,
    private val floatingRoot: View,
    private val anchorContainer: LinearLayout,
    private val fabContainer: View,
    private val windowManager: WindowManager,
    private val callbacks: Callbacks,
) {
    interface Callbacks {
        fun onRecordingCancel()
        fun onRecordingConfirm()
        fun onRecordingPauseToggle()
        fun onReviewClose()
        fun onReviewSend(editedText: String, voiceAssetId: String?, originalTranscript: String)
        fun onOverlayFocusChanged(focusable: Boolean)
        fun onReviewLayoutChanged()
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val recordingCard: View = floatingRoot.findViewById(R.id.command_recording_card)
    private val reviewCard: View = floatingRoot.findViewById(R.id.command_review_card)
    private val timerView: TextView = recordingCard.findViewById(R.id.command_recording_timer)
    private val waveView: SoundWaveOverlayView = recordingCard.findViewById(R.id.command_recording_wave)
    private val pulseDot: View = recordingCard.findViewById(R.id.command_recording_pulse)
    private val transcriptInput: EditText = reviewCard.findViewById(R.id.command_transcript_input)
    private val charCountView: TextView = reviewCard.findViewById(R.id.command_char_count)

    private var timerRunnable: Runnable? = null
    private var pulseAnimator: ValueAnimator? = null
    private var recordingStartedAt = 0L
    private var pausedElapsedMs = 0L

    private var currentVoiceAssetId: String? = null
    private var originalTranscript: String = ""
    private var reviewHasError = false

    private val sendButton: TextView = reviewCard.findViewById(R.id.command_btn_send)
    private val reviewActions: View = reviewCard.findViewById(R.id.command_review_actions)
    private val reviewStatusView: TextView = reviewCard.findViewById(R.id.command_review_status)

    val isActive: Boolean
        get() = recordingCard.visibility == View.VISIBLE || reviewCard.visibility == View.VISIBLE

    init {
        recordingCard.findViewById<TextView>(R.id.command_btn_cancel)?.setOnClickListener {
            animateOut(recordingCard) {
                callbacks.onRecordingCancel()
            }
        }
        recordingCard.findViewById<TextView>(R.id.command_btn_confirm)?.setOnClickListener {
            callbacks.onRecordingConfirm()
        }

        reviewCard.findViewById<TextView>(R.id.command_btn_close)?.setOnClickListener {
            animateOut(reviewCard) {
                setOverlayFocusable(false)
                callbacks.onReviewClose()
            }
        }
        reviewCard.findViewById<TextView>(R.id.command_btn_cancel_review)?.setOnClickListener {
            animateOut(reviewCard) {
                setOverlayFocusable(false)
                callbacks.onReviewClose()
            }
        }
        reviewCard.findViewById<TextView>(R.id.command_btn_send)?.setOnClickListener {
            if (reviewHasError) return@setOnClickListener
            val text = transcriptInput.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                setReviewStatus("Enter text before sending", isError = true)
                return@setOnClickListener
            }
            setReviewLoading(true, "Sending…")
            callbacks.onReviewSend(text, currentVoiceAssetId, originalTranscript)
        }

        transcriptInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val len = s?.length ?: 0
                if (len > 0 && reviewCard.visibility == View.VISIBLE) {
                    charCountView.visibility = View.VISIBLE
                    charCountView.text = len.toString()
                } else {
                    charCountView.visibility = View.GONE
                }
            }
        })
    }

    fun showRecordingBar() {
        dismissReviewPanel()
        repositionCard(recordingCard, fullWidth = false)
        recordingCard.visibility = View.VISIBLE
        animateIn(recordingCard)
        waveView.startWave()
        startPulse()
        recordingStartedAt = System.currentTimeMillis()
        pausedElapsedMs = 0L
        timerView.text = "0:00"
        startTimer()
        setOverlayFocusable(false)
    }

    fun dismissRecordingBar() {
        stopTimer()
        stopPulse()
        waveView.stopWave()
        if (recordingCard.visibility == View.VISIBLE) {
            recordingCard.visibility = View.GONE
        }
    }

    fun showReviewPanel(transcript: String, voiceAssetId: String?) {
        dismissRecordingBar()
        reviewHasError = false
        originalTranscript = transcript
        currentVoiceAssetId = voiceAssetId

        transcriptInput.visibility = View.VISIBLE
        transcriptInput.isEnabled = true
        transcriptInput.setText(transcript)
        transcriptInput.setSelection(transcript.length)
        reviewCard.findViewById<TextView>(R.id.command_execute_result)?.visibility = View.GONE
        reviewStatusView.visibility = View.GONE
        sendButton.apply {
            text = "Send"
            visibility = View.VISIBLE
            isEnabled = true
            alpha = 1f
        }
        reviewActions.visibility = View.VISIBLE

        repositionCard(reviewCard, fullWidth = false)
        reviewCard.visibility = View.VISIBLE
        animateIn(reviewCard)
        setOverlayFocusable(transcript.isNotBlank())
        if (transcript.isNotBlank()) {
            transcriptInput.post { transcriptInput.requestFocus() }
            charCountView.visibility = View.VISIBLE
            charCountView.text = transcript.length.toString()
        } else {
            charCountView.visibility = View.GONE
        }
    }

    fun setReviewLoading(loading: Boolean, status: String? = null) {
        reviewCard.findViewById<ProgressBar>(R.id.command_review_progress)?.visibility =
            if (loading) View.VISIBLE else View.GONE
        if (!reviewHasError) {
            sendButton.isEnabled = !loading
            sendButton.visibility = View.VISIBLE
            transcriptInput.isEnabled = !loading
        }
        if (status != null) setReviewStatus(status, isError = false)
    }

    fun setReviewStatus(message: String, isError: Boolean) {
        reviewStatusView.visibility = View.VISIBLE
        reviewStatusView.text = if (isError) VoiceCommandErrorMapper.toUserMessage(message) else message
        reviewStatusView.setTextColor(if (isError) 0xFFF87171.toInt() else 0xFF94A3B8.toInt())
        reviewStatusView.textSize = if (isError) 13f else 11f
    }

    fun showExecuteSuccess() {
        reviewHasError = false
        setReviewLoading(false)
        transcriptInput.visibility = View.GONE
        charCountView.visibility = View.GONE
        sendButton.visibility = View.GONE
        reviewActions.visibility = View.GONE
        reviewCard.findViewById<TextView>(R.id.command_execute_result)?.visibility = View.GONE
        setReviewStatus("Done", isError = false)
        reviewStatusView.setTextColor(0xFF4ADE80.toInt())
        reviewStatusView.textSize = 13f
        mainHandler.postDelayed({
            animateOut(reviewCard) {
                setOverlayFocusable(false)
                callbacks.onReviewClose()
            }
        }, 1200)
    }

    fun showReviewError(message: String) {
        reviewHasError = true
        setReviewLoading(false)
        transcriptInput.visibility = View.GONE
        transcriptInput.isEnabled = false
        charCountView.visibility = View.GONE
        sendButton.visibility = View.GONE
        sendButton.isEnabled = false
        setReviewStatus(message, isError = true)
        repositionCard(reviewCard, fullWidth = true)
        callbacks.onReviewLayoutChanged()
    }

    fun dismissReviewPanel() {
        if (reviewCard.visibility == View.VISIBLE) {
            reviewCard.visibility = View.GONE
        }
        reviewHasError = false
        currentVoiceAssetId = null
        originalTranscript = ""
    }

    fun dismissAll() {
        dismissRecordingBar()
        dismissReviewPanel()
        restoreFabOnlyLayout()
        setOverlayFocusable(false)
    }

    private fun restoreFabOnlyLayout() {
        anchorContainer.removeAllViews()
        anchorContainer.orientation = LinearLayout.HORIZONTAL
        anchorContainer.gravity = android.view.Gravity.CENTER_VERTICAL
        anchorContainer.addView(fabContainer)
        recordingCard.visibility = View.GONE
        reviewCard.visibility = View.GONE
    }

    /** Re-layout card relative to bubble after drag or show. */
    fun repositionIfNeeded() {
        when {
            recordingCard.visibility == View.VISIBLE -> repositionCard(recordingCard, fullWidth = false)
            reviewCard.visibility == View.VISIBLE -> repositionCard(reviewCard, fullWidth = reviewHasError)
        }
    }

    private fun repositionCard(card: View, fullWidth: Boolean) {
        val rootParams = floatingRoot.layoutParams as? WindowManager.LayoutParams
        val dm = context.resources.displayMetrics
        val screenW = dm.widthPixels
        val horizontalMargin = dp(12)

        if (fullWidth && card === reviewCard) {
            rootParams?.x = horizontalMargin
            anchorContainer.orientation = LinearLayout.VERTICAL
            anchorContainer.gravity = android.view.Gravity.CENTER_HORIZONTAL
            recordingCard.visibility = View.GONE
            reviewCard.visibility = View.VISIBLE

            anchorContainer.removeAllViews()
            val cardWidth = screenW - horizontalMargin * 2
            val cardLp = LinearLayout.LayoutParams(cardWidth, LinearLayout.LayoutParams.WRAP_CONTENT)
            anchorContainer.addView(reviewCard, cardLp)
            val fabLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) }
            anchorContainer.addView(fabContainer, fabLp)
            rootParams?.let { windowManager.updateViewLayout(floatingRoot, it) }
            callbacks.onReviewLayoutChanged()
            return
        }

        val params = rootParams ?: return
        val bubbleCenterX = params.x + floatingRoot.width / 2
        val nearBottom = params.y > dm.heightPixels * 0.62f
        val expandLeft = bubbleCenterX > screenW / 2

        recordingCard.visibility = if (card === recordingCard) View.VISIBLE else View.GONE
        reviewCard.visibility = if (card === reviewCard) View.VISIBLE else View.GONE

        // Reset compact card width (max ~280dp beside bubble)
        val compactReviewWidth = dp(280).coerceAtMost(screenW - dp(32))
        if (card === reviewCard) {
            reviewCard.minimumWidth = 0
        }

        anchorContainer.removeAllViews()
        anchorContainer.orientation = if (nearBottom) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
        anchorContainer.gravity = if (nearBottom) {
            android.view.Gravity.CENTER_HORIZONTAL or android.view.Gravity.BOTTOM
        } else {
            android.view.Gravity.CENTER_VERTICAL
        }

        val cardLp = if (card === reviewCard) {
            LinearLayout.LayoutParams(compactReviewWidth, LinearLayout.LayoutParams.WRAP_CONTENT)
        } else {
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }.apply {
            if (nearBottom) {
                bottomMargin = dp(8)
            } else {
                marginEnd = dp(8)
            }
        }
        val fabLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )

        when {
            nearBottom -> {
                anchorContainer.addView(card, cardLp)
                anchorContainer.addView(fabContainer, fabLp)
            }
            expandLeft -> {
                anchorContainer.addView(card, cardLp)
                anchorContainer.addView(fabContainer, fabLp)
            }
            else -> {
                anchorContainer.addView(fabContainer, fabLp)
                anchorContainer.addView(card, cardLp)
            }
        }
    }

    private fun animateIn(view: View) {
        view.alpha = 0f
        view.scaleX = 0.88f
        view.scaleY = 0.88f
        view.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(220L)
            .setInterpolator(OvershootInterpolator(0.9f))
            .start()
    }

    private fun animateOut(view: View, onEnd: () -> Unit) {
        view.animate()
            .alpha(0f)
            .scaleX(0.9f)
            .scaleY(0.9f)
            .setDuration(160L)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction {
                view.visibility = View.GONE
                view.alpha = 1f
                view.scaleX = 1f
                view.scaleY = 1f
                onEnd()
            }
            .start()
    }

    private fun startPulse() {
        stopPulse()
        pulseAnimator = ObjectAnimator.ofFloat(pulseDot, View.ALPHA, 1f, 0.35f).apply {
            duration = 600L
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            start()
        }
    }

    private fun stopPulse() {
        pulseAnimator?.cancel()
        pulseAnimator = null
        pulseDot.alpha = 1f
    }

    private fun startTimer() {
        stopTimer()
        timerRunnable = object : Runnable {
            override fun run() {
                val elapsed = System.currentTimeMillis() - recordingStartedAt - pausedElapsedMs
                timerView.text = formatElapsed(elapsed)
                mainHandler.postDelayed(this, 500L)
            }
        }
        mainHandler.post(timerRunnable!!)
    }

    private fun stopTimer() {
        timerRunnable?.let { mainHandler.removeCallbacks(it) }
        timerRunnable = null
    }

    private fun formatElapsed(ms: Long): String {
        val totalSec = (ms / 1000).coerceAtLeast(0)
        val min = totalSec / 60
        val sec = totalSec % 60
        return String.format("%d:%02d", min, sec)
    }

    private fun setOverlayFocusable(focusable: Boolean) {
        callbacks.onOverlayFocusChanged(focusable)
    }

    private fun dp(v: Int): Int =
        (v * context.resources.displayMetrics.density).toInt()
}
