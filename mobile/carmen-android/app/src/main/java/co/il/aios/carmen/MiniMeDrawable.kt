package co.il.aios.carmen

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.view.Choreographer
import androidx.core.graphics.withSave
import kotlin.math.min

/**
 * The Mini Me as the site crops it (`mini-me.css`): the render sits on white, and a circle
 * keeps only its frosted disc. With [tile] it stands on the call tile's dark glass, as the orb
 * does; without, the circle fills the drawable (the small picture in the chat).
 */
class MiniMeDrawable private constructor(
    private val render: Bitmap,
    private val tile: Boolean,
    private val width: Int,
    private val height: Int,
) : Drawable() {

    /** How the figure sits now; [MiniMeMotion] moves it on the call screen. */
    var pose = MiniMePose.REST
        set(value) {
            field = value
            invalidateSelf()
        }

    private val figure = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
        shader = BitmapShader(render, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    private val backdrop = Paint()

    override fun getIntrinsicWidth(): Int = width

    override fun getIntrinsicHeight(): Int = height

    override fun onBoundsChange(bounds: Rect) {
        if (tile) backdrop.shader = OrbBuddyView.tileBackdrop(bounds.width().toFloat(), bounds.height().toFloat())
    }

    override fun draw(canvas: Canvas) {
        val area = bounds
        val radius = render.width / 2f
        val size = min(area.width(), area.height()) * if (tile) TILE_SHARE else 1f
        val zoom = pose.scale * size / render.width

        canvas.withSave {
            translate(area.left.toFloat(), area.top.toFloat())
            if (tile) drawRect(0f, 0f, area.width().toFloat(), area.height().toFloat(), backdrop)
            translate(area.width() / 2f, area.height() / 2f)
            rotate(pose.tilt)
            scale(zoom, zoom)
            // Drawn in the render's own pixels around its centre, so the shader needs no matrix.
            translate(-radius, -render.height / 2f)
            drawCircle(radius, render.height / 2f, radius, figure)
        }
    }

    override fun setAlpha(alpha: Int) {
        figure.alpha = alpha
        backdrop.alpha = alpha
    }

    override fun setColorFilter(filter: ColorFilter?) {
        figure.colorFilter = filter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    companion object {
        /** The share of the tile's short side the figure takes, close to the orb's. */
        private const val TILE_SHARE = 0.8f

        /** The large picture: the Mini Me on dark glass, the size of the other looks' stills. */
        fun tile(context: Context, set: MiniMeSet): MiniMeDrawable {
            val still = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeResource(context.resources, R.drawable.carmen_orb_call, still)
            return MiniMeDrawable(render(context, set), tile = true, still.outWidth, still.outHeight)
        }

        /** The small round picture: the circle alone. */
        fun avatar(context: Context, set: MiniMeSet): MiniMeDrawable {
            val render = render(context, set)
            return MiniMeDrawable(render, tile = false, render.width, render.height)
        }

        private fun render(context: Context, set: MiniMeSet): Bitmap =
            BitmapFactory.decodeResource(context.resources, set.render)
    }
}

/**
 * Moves the Mini Me with Carmen's state on the call screen ([MiniMePose.of]). It stays still
 * when the phone has animations turned off, as the site does for reduced motion.
 */
class MiniMeMotion(private val figure: MiniMeDrawable) : Choreographer.FrameCallback {

    var state = CarmenSession.State.ACKNOWLEDGING
    private var running = false

    fun start() {
        if (running || !ValueAnimator.areAnimatorsEnabled()) return
        running = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val target = MiniMePose.of(state, frameTimeNanos / 1_000_000_000.0)
        figure.pose = figure.pose.toward(target, EASE)
        Choreographer.getInstance().postFrameCallback(this)
    }

    private companion object {
        const val EASE = 0.15f
    }
}
