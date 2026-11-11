package co.il.aios.carmen

import android.content.Context
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import androidx.core.net.toUri

/**
 * The character's silent loops on the call screen, one per state (AIO-543): listening, working
 * on a check, and speaking with her hands. All start from the same frame, so the screen
 * cross-fades between them. Each clip restarts from that frame when it comes in.
 *
 * Leaving the speaking clip waits [SPEECH_HOLD_MS], so the short pauses between her sentences
 * do not flip the picture back and forth. Call everything on the main thread.
 */
class CarmenClips(private val container: FrameLayout) {

    enum class Clip(val raw: Int) {
        LISTENING(R.raw.carmen_idle),
        WORKING(R.raw.carmen_thinking),
        SPEAKING(R.raw.carmen_speaking),
    }

    private val players = Clip.entries.associateWith { Player(container.context, it) }
    private var shown: Clip? = null
    private var pending: Clip? = null
    private val showPending = Runnable { pending?.let { show(it) } }

    init {
        players.values.forEach { container.addView(it.view, FrameLayout.LayoutParams(MATCH, MATCH)) }
    }

    /** Shows the clip for [state]. */
    fun setState(state: CarmenSession.State) {
        val clip = clipFor(state)
        container.removeCallbacks(showPending)
        pending = clip
        if (clip == shown) return
        if (shown == Clip.SPEAKING) container.postDelayed(showPending, SPEECH_HOLD_MS) else show(clip)
    }

    fun resume() = shown?.let { players.getValue(it).play() }

    fun pause() = players.values.forEach { it.pause() }

    fun release() {
        container.removeCallbacks(showPending)
        players.values.forEach { it.release() }
    }

    private fun show(clip: Clip) {
        val previous = shown
        shown = clip
        players.getValue(clip).restart()
        players.getValue(clip).view.animate().alpha(1f).setDuration(FADE_MS).start()
        if (previous != null) {
            players.getValue(previous).view.animate().alpha(0f).setDuration(FADE_MS)
                .withEndAction { if (shown != previous) players.getValue(previous).pause() }.start()
        }
    }

    /** One looping, muted clip on a TextureView, so it can fade (a VideoView cannot). */
    private class Player(context: Context, private val clip: Clip) : TextureView.SurfaceTextureListener {
        val view = TextureView(context).apply { alpha = 0f }
        private var player: MediaPlayer? = null
        private var prepared = false
        private var wanted = false

        init {
            view.surfaceTextureListener = this
        }

        fun restart() {
            wanted = true
            player?.takeIf { prepared }?.apply {
                seekTo(0)
                start()
            }
        }

        fun play() {
            wanted = true
            player?.takeIf { prepared && !it.isPlaying }?.start()
        }

        fun pause() {
            wanted = false
            player?.takeIf { prepared && it.isPlaying }?.pause()
        }

        fun release() {
            player?.release()
            player = null
            prepared = false
        }

        override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
            val uri = "android.resource://${view.context.packageName}/${clip.raw}".toUri()
            player = MediaPlayer().apply {
                runCatching {
                    setDataSource(view.context, uri)
                    setSurface(Surface(texture))
                    isLooping = true
                    setVolume(0f, 0f)
                    setOnPreparedListener {
                        prepared = true
                        if (wanted) it.start()
                    }
                    setOnErrorListener { _, what, extra ->
                        // The still image behind stays on screen, which is fine.
                        Log.w(TAG, "Clip ${clip.name} failed: $what/$extra")
                        true
                    }
                    prepareAsync()
                }.onFailure { Log.w(TAG, "Clip ${clip.name} could not load", it) }
            }
        }

        override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) = Unit

        override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
            release()
            return true
        }

        override fun onSurfaceTextureUpdated(texture: SurfaceTexture) = Unit
    }

    companion object {
        private const val TAG = "CarmenClips"
        private const val MATCH = FrameLayout.LayoutParams.MATCH_PARENT
        private const val FADE_MS = 280L
        private const val SPEECH_HOLD_MS = 700L

        /** Connecting or checking shows her working; speaking her talking; anything else listening. */
        fun clipFor(state: CarmenSession.State): Clip = when (state) {
            CarmenSession.State.CONNECTING, CarmenSession.State.THINKING -> Clip.WORKING
            CarmenSession.State.SPEAKING -> Clip.SPEAKING
            else -> Clip.LISTENING
        }
    }
}
