package co.il.aios.carmen

import android.media.AudioManager
import androidx.core.net.toUri
import androidx.core.view.isVisible
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.WindowManager
import android.widget.Chronometer
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity

/**
 * The call screen shown on activation, over the lock screen when needed: Carmen's video tile in
 * her office, as on a video call, with a call timer, her latest words as captions, mute and end.
 */
class CarmenActivity : AppCompatActivity() {

    private var face: CarmenPortrait? = null
    private lateinit var stateText: TextView
    private val closeAfterEnd = Runnable { if (!isFinishing) finish() }

    private val render: (CarmenSession.Snapshot) -> Unit = { snapshot ->
        face?.state = snapshot.state
        stateText.setText(stateLabel(snapshot.state))
        // The session is over: leave the lock screen so the display can turn off again.
        stateText.removeCallbacks(closeAfterEnd)
        if (snapshot.state == CarmenSession.State.ENDED) stateText.postDelayed(closeAfterEnd, CLOSE_AFTER_END_MS)
        findViewById<TextView>(R.id.notice_text).apply {
            text = snapshot.notice
            visibility = if (snapshot.notice == null) View.GONE else View.VISIBLE
        }
        findViewById<TextView>(R.id.caption_text).text = snapshot.lines.lastOrNull().orEmpty()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContentView(R.layout.activity_carmen)
        stateText = findViewById(R.id.state_text)
        // Rounded tile corners (the XML attribute needs API 31; minSdk is 30).
        findViewById<View>(R.id.call_tile).clipToOutline = true
        face = CarmenPortrait(findViewById(R.id.carmen_portrait), findViewById(R.id.portrait_glow), fixedFrame = true)
        findViewById<Chronometer>(R.id.call_timer).apply {
            base = SystemClock.elapsedRealtime()
            start()
        }
        startVideo()
        CarmenSession.observe(render)
        findViewById<ImageButton>(R.id.close_button).setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.mute_button).setOnClickListener { toggleMute(it as ImageButton) }
        findViewById<TextView>(R.id.false_activation_button).setOnClickListener {
            EventLog(this).record(EventLog.Event.FALSE_ACTIVATION)
            Toast.makeText(this, R.string.false_activation_recorded, Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    /** Loops the silent clip of Carmen listening; it must never take audio focus from the call. */
    private fun startVideo() {
        // Looked up by name so the screen works with the still alone until the clip ships.
        @Suppress("DiscouragedApi")
        val clip = resources.getIdentifier("carmen_idle", "raw", packageName)
        if (clip == 0) return
        val video = findViewById<VideoView>(R.id.carmen_video)
        video.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)
        video.setVideoURI("android.resource://$packageName/$clip".toUri())
        video.setOnPreparedListener { player ->
            player.isLooping = true
            player.setVolume(0f, 0f)
            video.visibility = View.VISIBLE
            video.start()
        }
        // Without the clip the still image stays, which is fine.
        video.setOnErrorListener { _, _, _ -> true }
    }

    private fun toggleMute(button: ImageButton) {
        CarmenSession.micMuted = !CarmenSession.micMuted
        button.isSelected = CarmenSession.micMuted
        button.setImageResource(if (CarmenSession.micMuted) R.drawable.ic_mic_off else R.drawable.ic_mic)
    }

    private fun showOverLockScreen() {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun stateLabel(state: CarmenSession.State) = when (state) {
        CarmenSession.State.ACKNOWLEDGING -> R.string.state_acknowledging
        CarmenSession.State.CONNECTING -> R.string.state_connecting
        CarmenSession.State.LISTENING -> R.string.state_listening
        CarmenSession.State.THINKING -> R.string.state_thinking
        CarmenSession.State.SPEAKING -> R.string.state_speaking
        CarmenSession.State.ENDED -> R.string.state_ended
    }

    override fun onResume() {
        super.onResume()
        face?.start()
        findViewById<VideoView>(R.id.carmen_video).takeIf { it.isVisible }?.start()
    }

    override fun onPause() {
        face?.stop()
        super.onPause()
    }

    override fun onDestroy() {
        stateText.removeCallbacks(closeAfterEnd)
        CarmenSession.unobserve(render)
        if (isFinishing) WakeWordService.send(this, WakeWordService.ACTION_SESSION_ENDED)
        super.onDestroy()
    }

    private companion object {
        const val CLOSE_AFTER_END_MS = 3_000L
    }
}
