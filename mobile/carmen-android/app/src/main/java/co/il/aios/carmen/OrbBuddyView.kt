package co.il.aios.carmen

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ComposeShader
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.Choreographer
import android.view.View
import androidx.core.graphics.withRotation
import androidx.core.graphics.withTranslation
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Carmen as the humanised glass orb on the call screen (AIO-543), drawn the way the web draws
 * it (`CarmenOrbBuddy.tsx`, `orb-buddy.css`, dark glass): the sphere with a face, floating hands
 * and feet, and a soft shadow. Every move is gentle and follows her [state]: listening blinks
 * and nods, working looks aside while the hands tap, speaking opens the mouth with her voice
 * and the hands gesture. Each part eases into the next state, never jumps.
 *
 * Shaders are built once per size in local coordinates; frames only move the canvas.
 */
class OrbBuddyView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs), Choreographer.FrameCallback {

    var state = CarmenSession.State.ACKNOWLEDGING

    private var running = false
    private var seconds = 0.0

    // Eased toward the state's targets every frame.
    private var lookX = 0f
    private var lookY = 0f
    private var typing = 0f
    private var gesture = 0f
    private var mouth = 0f
    private var glowPulse = 0f

    // Figure geometry and shaders for the current size (onSizeChanged).
    private var fw = 0f
    private var fh = 0f
    private var ox = 0f
    private var oy = 0f
    private var r = 0f
    private var backdrop: Shader? = null
    private var shadow: Shader? = null
    private var bodyLayers: List<Shader> = emptyList()
    private var specular: Shader? = null
    private var handGlass: Shader? = null
    private var footGlass: Shader? = null
    private val footPath = Path()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val face = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = alpha(Color.WHITE, 0.88f) }
    private val path = Path()
    private val rect = RectF()

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
        seconds = frameTimeNanos / 1_000_000_000.0
        ease()
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return
        // The figure keeps the web's proportions (1.9 : 1.75) and fills 90% of the height.
        fw = min(w * 0.9f, h * 0.9f / FIGURE_RATIO)
        fh = fw * FIGURE_RATIO
        ox = (w - fw) / 2f
        oy = (h - fh) / 2f
        r = 0.263f * fw
        backdrop = RadialGradient(w / 2f, h * 0.45f, max(w, h) * 0.65f, BACKDROP_CENTER, BACKDROP_EDGE, Shader.TileMode.CLAMP)
        val sw = 0.474f * fw
        shadow = RadialGradient(0f, 0f, sw / 2f, intArrayOf(alpha(TINT, 0.28f), Color.TRANSPARENT), floatArrayOf(0f, 0.7f), Shader.TileMode.CLAMP)
        bodyLayers = bodyShaders(r)
        specular = LinearGradient(0f, -r + 0.14f * r, 0f, -r + 0.54f * r, alpha(Color.WHITE, 0.32f), Color.TRANSPARENT, Shader.TileMode.CLAMP)
        glow.maskFilter = BlurMaskFilter(r * 0.16f, BlurMaskFilter.Blur.OUTER)
        val hw = HAND_W * fw
        handGlass = limbGlass(hw, hw * HAND_RATIO)
        val footW = FOOT_W * fw
        val footH = footW * FOOT_RATIO
        footGlass = limbGlass(footW, footH)
        footOutline(footW, footH)
    }

    private fun ease() {
        val working = state == CarmenSession.State.THINKING || state == CarmenSession.State.CONNECTING
        val speaking = state == CarmenSession.State.SPEAKING
        lookX += ((if (working) 2.6f else 0f) - lookX) * EASE
        lookY += ((if (working) -2.4f else 0f) - lookY) * EASE
        typing += ((if (working) 1f else 0f) - typing) * EASE
        gesture += ((if (speaking) 1f else 0f) - gesture) * EASE
        val voice = if (speaking) CarmenSession.voiceLevel.coerceIn(0f, 1f) else 0f
        mouth += (voice - mouth) * if (voice > mouth) MOUTH_ATTACK else MOUTH_RELEASE
        glowPulse += ((if (working) 1f else 0f) - glowPulse) * EASE
    }

    override fun onDraw(canvas: Canvas) {
        if (fw <= 0f) return
        val t = seconds
        fill.shader = backdrop
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fill)
        drawShadow(canvas, wave(t, 0.0))
        drawFoot(canvas, ox + 0.311f * fw, oy + 0.714f * fh - 0.012f * fw * wave(t, 1.2))
        drawFoot(canvas, ox + 0.521f * fw, oy + 0.714f * fh - 0.012f * fw * wave(t, 1.6))
        drawBody(canvas, ox + 0.5f * fw, oy + 0.04f * fh + r - 0.03f * fw * wave(t, 0.0) + nod(t))
        drawHand(canvas, ox + 0.037f * fw, oy + 0.337f * fh, t, start = true)
        drawHand(canvas, ox + 0.826f * fw, oy + 0.337f * fh, t, start = false)
        fill.shader = null
    }

    private fun drawShadow(canvas: Canvas, bob: Float) {
        val sw = 0.474f * fw
        val cx = ox + 0.5f * fw
        val cy = oy + fh - sw / 18f
        fill.shader = shadow
        fill.alpha = (255 * (1f - 0.3f * bob)).toInt()
        canvas.withTranslation(cx, cy) {
            scale(1f - 0.15f * bob, (1f - 0.15f * bob) / 9f)
            drawCircle(0f, 0f, sw / 2f, fill)
        }
        fill.alpha = 255
    }

    private fun drawBody(canvas: Canvas, cx: Float, cy: Float) {
        val glowAlpha = 0.45f + 0.18f * glowPulse * sin(seconds * 4.0).toFloat() + 0.35f * mouth
        glow.color = alpha(TINT, glowAlpha)
        canvas.withTranslation(cx, cy) {
            drawCircle(0f, 0f, r, glow)
            for (layer in bodyLayers) {
                fill.shader = layer
                drawCircle(0f, 0f, r, fill)
            }
            drawFace(this)
            drawSpecular(this)
            stroke.color = alpha(Color.WHITE, 0.06f)
            stroke.strokeWidth = max(1f, r * 0.006f)
            drawCircle(0f, 0f, r, stroke)
        }
    }

    /** Eyes and mouth in the web's 100×100 box over the sphere, centred on the canvas origin. */
    private fun drawFace(canvas: Canvas) {
        val u = 2f * r / 100f
        val idle = 1f - max(typing, gesture)
        val ex = (lookX + idle * 1.2f * sin(seconds * 0.55).toFloat()) * u
        val ey = lookY * u
        val eyeOpen = blink(seconds)
        for (x in EYES_X) {
            rect.set((x - 3.2f - 50f) * u + ex, (1f - 5f * eyeOpen) * u + ey, (x + 3.2f - 50f) * u + ex, (1f + 5f * eyeOpen) * u + ey)
            canvas.drawOval(rect, face)
        }
        val mx = ex * 0.4f
        path.reset()
        if (mouth > 0.06f) {
            // The open mouth, scaled from its top edge as she moves between syllables.
            val scale = 0.35f + 0.65f * mouth
            path.moveTo(-4.5f * u + mx, 12f * u)
            path.quadTo(mx, (12f + 7f * scale) * u, 4.5f * u + mx, 12f * u)
            path.close()
            canvas.drawPath(path, face)
        } else {
            stroke.color = alpha(Color.WHITE, 0.85f)
            stroke.strokeWidth = 2.4f * u
            path.moveTo(-2.5f * u + mx, 13.5f * u)
            path.quadTo(mx, 15.5f * u, 2.5f * u + mx, 13.5f * u)
            canvas.drawPath(path, stroke)
        }
    }

    /** The sharp reflection near the top edge, over the face so it reads as inside the glass. */
    private fun drawSpecular(canvas: Canvas) {
        val d = 2f * r
        rect.set(-r + 0.22f * d, -r + 0.07f * d, -r + 0.6f * d, -r + 0.27f * d)
        fill.shader = specular
        canvas.withRotation(-18f, rect.centerX(), rect.centerY()) {
            drawRoundRect(rect, rect.height() / 2f, rect.height() / 2f, fill)
        }
    }

    /**
     * A floating hand with its thumb toward the sphere. It bobs with the body, taps while she
     * works, and lifts and turns in small gestures while she speaks.
     */
    private fun drawHand(canvas: Canvas, left: Float, top: Float, t: Double, start: Boolean) {
        val hw = HAND_W * fw
        val hh = hw * HAND_RATIO
        val side = if (start) 1f else -1f
        val phase = if (start) 0.0 else PI
        val tap = typing * max(0f, sin(t * 2 * PI * 2.4 + phase).toFloat())
        val talk = gesture * (0.5f + 0.5f * sin(t * 2 * PI * 0.7 + phase).toFloat()) * (0.6f + 0.6f * mouth)
        val dy = -0.03f * fw * wave(t, if (start) 0.5 else 0.9) - 0.018f * fw * tap - 0.035f * fw * talk
        val thumb = hw * 0.42f
        val thumbLeft = if (start) hw - thumb + 0.24f * hw else -0.24f * hw
        fill.shader = handGlass
        edge()
        canvas.withTranslation(left + side * 0.02f * fw * talk, top + dy) {
            rotate(-side * 14f + side * 22f * talk, hw / 2f, hh / 2f)
            rect.set(thumbLeft, 0.3f * hh, thumbLeft + thumb, 0.3f * hh + thumb)
            drawOval(rect, fill)
            rect.set(0f, 0f, hw, hh)
            drawOval(rect, fill)
            drawOval(rect, stroke)
        }
    }

    private fun drawFoot(canvas: Canvas, left: Float, top: Float) {
        fill.shader = footGlass
        edge()
        canvas.withTranslation(left, top) {
            drawPath(footPath, fill)
            drawPath(footPath, stroke)
        }
    }

    private fun edge() {
        stroke.color = alpha(Color.WHITE, 0.16f)
        stroke.strokeWidth = max(1f, fw * 0.002f)
    }

    /** A dome: rounded on top, flat underneath with small corners. */
    private fun footOutline(w: Float, h: Float) {
        val corner = h * 0.18f
        footPath.reset()
        footPath.arcTo(RectF(0f, 0f, w, h * 1.6f), 180f, 180f, true)
        footPath.lineTo(w, h - corner)
        footPath.quadTo(w, h, w - corner, h)
        footPath.lineTo(corner, h)
        footPath.quadTo(0f, h, 0f, h - corner)
        footPath.close()
    }

    /** A small nod while she listens, still otherwise. */
    private fun nod(t: Double): Float = (1f - max(typing, gesture)) * fh * 0.006f * sin(t * 2 * PI / 2.6).toFloat()

    companion object {
        private const val FIGURE_RATIO = 1.75f / 1.9f
        private const val HAND_W = 0.137f
        private const val HAND_RATIO = 1.154f
        private const val FOOT_W = 0.168f
        private const val FOOT_RATIO = 0.531f
        private const val EASE = 0.08f
        private const val MOUTH_ATTACK = 0.55f
        private const val MOUTH_RELEASE = 0.14f
        private val EYES_X = floatArrayOf(40f, 60f)
        private const val TINT = 0xFF22B573.toInt()
        private const val BACKDROP_CENTER = 0xFF1C334C.toInt()
        private const val BACKDROP_EDGE = 0xFF0A1526.toInt()

        /**
         * Dark glass around the origin, bottom to top: a see-through core with a tinted rim,
         * the tint pooling low on the right, a soft highlight top-left, light on the lower rim.
         */
        private fun bodyShaders(r: Float): List<Shader> {
            val d = 2f * r
            return listOf(
                RadialGradient(0f, 0f, r, intArrayOf(alpha(Color.WHITE, 0.03f), alpha(Color.WHITE, 0.06f), alpha(TINT, 0.36f), alpha(Color.WHITE, 0.14f)), floatArrayOf(0f, 0.7f, 0.93f, 1f), Shader.TileMode.CLAMP),
                RadialGradient(-r + 0.68f * d, -r + 0.76f * d, 2.04f * r, intArrayOf(alpha(TINT, 0.78f), alpha(TINT, 0.25f), Color.TRANSPARENT), floatArrayOf(0f, 0.3f, 0.6f), Shader.TileMode.CLAMP),
                RadialGradient(-r + 0.3f * d, -r + 0.24f * d, 2.07f * r, intArrayOf(alpha(Color.WHITE, 0.28f), alpha(Color.WHITE, 0.06f), Color.TRANSPARENT), floatArrayOf(0f, 0.16f, 0.36f), Shader.TileMode.CLAMP),
                RadialGradient(0f, -r + 1.08f * d, 2.38f * r, intArrayOf(alpha(Color.WHITE, 0.18f), Color.TRANSPARENT), floatArrayOf(0f, 0.38f), Shader.TileMode.CLAMP),
            )
        }

        /** Milky dark glass in the sphere's tint, lit from the top left, in a [w]×[h] box. */
        private fun limbGlass(w: Float, h: Float): Shader {
            val tint = RadialGradient(0.6f * w, 0.7f * h, max(w, h) * 0.9f, intArrayOf(alpha(TINT, 0.62f), alpha(TINT, 0.22f)), floatArrayOf(0f, 0.7f), Shader.TileMode.CLAMP)
            val light = RadialGradient(0.32f * w, 0.26f * h, max(w, h) * 0.6f, intArrayOf(alpha(Color.WHITE, 0.55f), Color.TRANSPARENT), floatArrayOf(0f, 0.75f), Shader.TileMode.CLAMP)
            return ComposeShader(tint, light, PorterDuff.Mode.SCREEN)
        }

        /** 0 → 1 → 0 over the web's 3.2 s bob, eased in and out; [delay] in seconds. */
        fun wave(t: Double, delay: Double): Float = ((1 - cos((t + delay) * 2 * PI / 3.2)) / 2).toFloat()

        /** Eyes open (1) with a quick blink every 3.7 s. */
        fun blink(t: Double): Float {
            val inCycle = t % 3.7
            return if (inCycle < 0.14) (1 - sin(inCycle / 0.14 * PI)).toFloat().coerceAtLeast(0.1f) else 1f
        }

        fun alpha(color: Int, a: Float): Int =
            Color.argb((a.coerceIn(0f, 1f) * 255).toInt(), Color.red(color), Color.green(color), Color.blue(color))
    }
}
