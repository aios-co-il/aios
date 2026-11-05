package co.il.aios.carmen

import android.view.Choreographer
import android.view.View
import kotlin.math.sin

/**
 * Animates Carmen's picture and the glow around it. Home: a slow breathing scale and a glow that
 * pulses and grows with her state. Call screen ([fixedFrame]): nothing moves or resizes; the
 * frame stays put and only its glow beats with her speech, rising at once on each syllable and
 * fading softly between them, steady while she listens.
 */
class CarmenPortrait(
    private val portrait: View,
    private val glow: View,
    private val fixedFrame: Boolean = false,
) : Choreographer.FrameCallback {

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
        if (fixedFrame) {
            beatFrame(target, seconds)
            Choreographer.getInstance().postFrameCallback(this)
            return
        }
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

    /** Fast attack, soft release: the glow follows the beat of her words, not a slow average. */
    private fun beatFrame(target: Float, seconds: Double) {
        speech += (target - speech) * if (target > speech) ATTACK else RELEASE
        glow.alpha = when (state) {
            CarmenSession.State.SPEAKING -> 0.3f + speech * 0.7f
            CarmenSession.State.THINKING, CarmenSession.State.CONNECTING -> 0.3f + 0.15f * sin(seconds * 4).toFloat()
            CarmenSession.State.ENDED -> 0.1f
            else -> 0.3f
        }.coerceIn(0f, 1f)
    }

    private companion object {
        const val SMOOTHING = 0.15f
        const val ATTACK = 0.6f
        const val RELEASE = 0.12f
    }
}
