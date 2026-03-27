package com.typeeasy

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.sin

/**
 * Compact equalizer-style bars for floating mic recording feedback (replaces long text overlay).
 */
class SoundWaveOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF00D16B.toInt()
        style = Paint.Style.FILL
    }

    private var waveAnimator: ValueAnimator? = null
    private var phase = 0f

    fun startWave() {
        stopWave()
        waveAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 720L
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                phase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        invalidate()
    }

    fun stopWave() {
        waveAnimator?.cancel()
        waveAnimator = null
        phase = 0f
        invalidate()
    }

    override fun onDetachedFromWindow() {
        stopWave()
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (waveAnimator == null && phase == 0f) return

        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        val bars = 5
        val barW = w / (bars * 2f + 1f)
        val t = phase * (Math.PI * 2).toFloat()
        val radius = barW * 0.35f

        for (i in 0 until bars) {
            val offset = i * 0.85f
            val s = (sin((t + offset).toDouble()) * 0.5 + 0.5).toFloat()
            val barH = h * (0.2f + 0.8f * s)
            val left = barW + i * (barW * 1.35f)
            val top = h - barH
            canvas.drawRoundRect(left, top, left + barW, h, radius, radius, barPaint)
        }
    }
}
