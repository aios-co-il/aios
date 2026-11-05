package co.il.aios.carmen

import android.view.Choreographer
import android.view.View
import kotlin.math.sin

/**
 * Carmen's approved character (`src/assets/carmenCharacterImage.ts`, the marketing-manager
 * skin's portrait) on the phone: a slow breathing scale, and a glow behind her that pulses while
 * she listens or thinks and follows her voice while she speaks (smoothed, so it reacts to
 * "is she speaking" rather than every syllable).
 */
class CarmenPortrait(private val portrait: View, private val glow: View) : Choreographer.FrameCallback {

    var state = CarmenSession.State.ACKNOWLEDGING
    private var running = false
    private var speech = 0f

    fun start() {
        if (running) return
        running = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val seconds = frameTimeNanos / 1_000_000_000.0
        val target = if (state == CarmenSession.State.SPEAKING) CarmenSession.voiceLevel else 0f
        speech += (target - speech) * SMOOTHING
        val breath = 1f + 0.012f * sin(seconds * 1.6).toFloat()
        portrait.scaleX = breath + speech * 0.03f
        portrait.scaleY = portrait.scaleX
        val pulse = when (state) {
            CarmenSession.State.THINKING, CarmenSession.State.CONNECTING -> 0.35f + 0.25f * sin(seconds * 6).toFloat()
            CarmenSession.State.SPEAKING -> 0.35f + speech * 0.65f
            CarmenSession.State.ENDED -> 0.15f
            else -> 0.4f + 0.15f * sin(seconds * 2.2).toFloat()
        }
        glow.alpha = pulse.coerceIn(0f, 1f)
        glow.scaleX = 0.9f + glow.alpha * 0.2f
        glow.scaleY = glow.scaleX
        Choreographer.getInstance().postFrameCallback(this)
    }

    private companion object {
        const val SMOOTHING = 0.15f
    }
}
