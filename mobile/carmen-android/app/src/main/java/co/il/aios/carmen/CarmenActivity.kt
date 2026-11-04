package co.il.aios.carmen

import android.os.Bundle
import android.view.WindowManager
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/** Basic Carmen screen shown on activation, over the lock screen when needed. */
class CarmenActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContentView(R.layout.activity_carmen)
        findViewById<android.view.View>(R.id.listening_indicator).startAnimation(pulse())
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

    private fun pulse() = AlphaAnimation(1f, 0.3f).apply {
        duration = 700
        repeatMode = Animation.REVERSE
        repeatCount = Animation.INFINITE
    }

    override fun onDestroy() {
        if (isFinishing) WakeWordService.send(this, WakeWordService.ACTION_SESSION_ENDED)
        super.onDestroy()
    }
}
