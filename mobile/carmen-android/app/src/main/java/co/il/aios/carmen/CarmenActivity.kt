package co.il.aios.carmen

import android.os.Bundle
import android.view.WindowManager
import android.view.View
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/** Carmen screen shown on activation, over the lock screen when needed: state and live transcript. */
class CarmenActivity : AppCompatActivity() {

    private var face: CarmenPortrait? = null

    private val closeAfterEnd = Runnable { if (!isFinishing) finish() }

    private val render: (CarmenSession.Snapshot) -> Unit = { snapshot ->
        face?.state = snapshot.state
        // The session is over: leave the lock screen so the display can turn off again.
        val view = findViewById<View>(R.id.state_text)
        view.removeCallbacks(closeAfterEnd)
        if (snapshot.state == CarmenSession.State.ENDED) view.postDelayed(closeAfterEnd, CLOSE_AFTER_END_MS)
        findViewById<TextView>(R.id.state_text).setText(stateLabel(snapshot.state))
        findViewById<TextView>(R.id.notice_text).apply {
            text = snapshot.notice
            visibility = if (snapshot.notice == null) View.GONE else View.VISIBLE
        }
        findViewById<TextView>(R.id.transcript_text).text = snapshot.lines.joinToString("\n\n")
        findViewById<ScrollView>(R.id.transcript_scroll).post {
            findViewById<ScrollView>(R.id.transcript_scroll).fullScroll(View.FOCUS_DOWN)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContentView(R.layout.activity_carmen)
        face = CarmenPortrait(findViewById(R.id.carmen_portrait), findViewById(R.id.portrait_glow))
        CarmenSession.observe(render)
        findViewById<Button>(R.id.close_button).setOnClickListener { finish() }
        findViewById<Button>(R.id.false_activation_button).setOnClickListener {
            EventLog(this).record(EventLog.Event.FALSE_ACTIVATION)
            Toast.makeText(this, R.string.false_activation_recorded, Toast.LENGTH_SHORT).show()
            finish()
        }
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
    }

    override fun onPause() {
        face?.stop()
        super.onPause()
    }

    override fun onDestroy() {
        findViewById<View>(R.id.state_text)?.removeCallbacks(closeAfterEnd)
        CarmenSession.unobserve(render)
        if (isFinishing) WakeWordService.send(this, WakeWordService.ACTION_SESSION_ENDED)
        super.onDestroy()
    }

    private companion object {
        const val CLOSE_AFTER_END_MS = 3_000L
    }
}
