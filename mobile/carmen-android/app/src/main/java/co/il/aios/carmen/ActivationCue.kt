package co.il.aios.carmen

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log

/**
 * What the user hears the moment Carmen is activated, before her live call connects (AIO-543):
 * a soft burst of typing, then "אני כבר איתך" recorded in the voice the phone is set to. Once
 * connected she greets herself with a varied line from the server.
 *
 * Her live voice wins: [silence] stops the typing and skips the line if it has not started yet.
 */
class ActivationCue(context: Context, private val voiceId: String?) {

    private val app = context.applicationContext
    private val attributes: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private var player: MediaPlayer? = null
    private var typingPlaying = false
    private var silenced = false
    private var onDone: (() -> Unit)? = null

    /**
     * Plays the typing, then the line. [onDone] runs once on the main thread when the cue ended,
     * failed or was silenced. Call from the main thread.
     */
    fun play(onDone: () -> Unit = {}) {
        this.onDone = onDone
        playClip(R.raw.carmen_typing, TYPING_VOLUME) {
            if (silenced) finish() else playClip(lineFor(voiceId), 1f) { finish() }
        }
    }

    /** Carmen's live voice started: stop the typing, and skip the line if it has not begun. */
    fun silence() {
        silenced = true
        if (!typingPlaying) return
        release()
        finish()
    }

    private fun finish() {
        val done = onDone ?: return
        onDone = null
        done()
    }

    fun release() {
        player?.runCatching { stop() }
        player?.release()
        player = null
        typingPlaying = false
    }

    private fun playClip(clip: Int, volume: Float, then: () -> Unit) {
        release()
        val next = runCatching { MediaPlayer.create(app, clip, attributes, 0) }
            .onFailure { Log.w(TAG, "Activation cue failed to load", it) }
            .getOrNull()
        if (next == null) {
            then()
            return
        }
        next.setVolume(volume, volume)
        next.setOnCompletionListener {
            if (player === it) release()
            then()
        }
        next.setOnErrorListener { _, what, extra ->
            Log.w(TAG, "Activation cue playback error $what/$extra")
            if (player === next) release()
            then()
            true
        }
        player = next
        typingPlaying = clip == R.raw.carmen_typing
        next.start()
    }

    companion object {
        private const val TAG = "ActivationCue"
        private const val TYPING_VOLUME = 0.6f

        /**
         * "אני כבר איתך" in the picked voice. Keys match `elevenlabs-voices.ts`; OpenAI, no pick
         * or a voice without a recording uses the default voice's.
         */
        fun lineFor(voiceId: String?): Int = when (voiceId) {
            "danit" -> R.raw.carmen_with_you_danit
            "zina" -> R.raw.carmen_with_you_zina
            else -> R.raw.carmen_with_you_yael
        }
    }
}
