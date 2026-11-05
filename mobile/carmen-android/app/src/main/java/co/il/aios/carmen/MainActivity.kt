package co.il.aios.carmen

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat

/**
 * Carmen's home on the phone: her portrait, "דברו עם כרמן" for a live conversation right
 * away, and the "היי כרמן" listening switch. The system's chat opens from here.
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var listenSwitch: SwitchCompat
    private lateinit var portrait: CarmenPortrait
    private var afterPermission: (() -> Unit)? = null

    private val refresh = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, REFRESH_MS)
        }
    }

    private val permissionRequest =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (micGranted()) afterPermission?.invoke()
            else Toast.makeText(this, R.string.mic_permission_needed, Toast.LENGTH_LONG).show()
            afterPermission = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!AiosAccount(this).isSignedIn) {
            startActivity(Intent(this, SignInActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_home)
        Notifications.createChannels(this)
        status = findViewById(R.id.home_status)
        listenSwitch = findViewById(R.id.listen_switch)
        portrait = CarmenPortrait(findViewById(R.id.home_portrait), findViewById(R.id.home_glow))
        findViewById<Button>(R.id.talk_button).setOnClickListener { withMic { WakeWordService.talk(this) } }
        findViewById<android.view.View>(R.id.home_portrait_frame).setOnClickListener {
            withMic { WakeWordService.talk(this) }
        }
        listenSwitch.setOnClickListener { toggleListening(listenSwitch.isChecked) }
        findViewById<Button>(R.id.chat_button).setOnClickListener {
            startActivity(Intent(this, ChatActivity::class.java))
        }
        findViewById<Button>(R.id.command_center_button).setOnClickListener {
            startActivity(Intent(this, CommandCenterActivity::class.java))
        }
        findViewById<Button>(R.id.home_settings_button).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        // First open after sign-in: turn on "היי כרמן" listening, as the app is for.
        if (!ListeningPrefs.wasChosen(this)) withMic { WakeWordService.start(this) }
    }

    override fun onResume() {
        super.onResume()
        WakeWordService.resumeIfEnabled(this)
        portrait.start()
        handler.post(refresh)
    }

    override fun onPause() {
        handler.removeCallbacks(refresh)
        portrait.stop()
        super.onPause()
    }

    private fun toggleListening(on: Boolean) {
        if (on) {
            withMic { WakeWordService.start(this) }
        } else {
            WakeWordService.send(this, WakeWordService.ACTION_STOP)
        }
    }

    /** Runs [action] once the microphone (and, on Android 13+, notifications) are allowed. */
    private fun withMic(action: () -> Unit) {
        val needed = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isEmpty()) {
            action()
        } else {
            afterPermission = action
            permissionRequest.launch(needed.toTypedArray())
        }
    }

    private fun micGranted() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun render() {
        val serviceStatus = WakeWordService.status
        listenSwitch.isChecked = serviceStatus != WakeWordService.Status.STOPPED
        status.setText(
            when (serviceStatus) {
                WakeWordService.Status.STOPPED -> R.string.home_off
                WakeWordService.Status.STARTING -> R.string.home_starting
                WakeWordService.Status.ARMED -> R.string.home_listening
                WakeWordService.Status.ACTIVE -> R.string.home_active
            },
        )
        portrait.state = when (serviceStatus) {
            WakeWordService.Status.STOPPED -> CarmenSession.State.ENDED
            WakeWordService.Status.ACTIVE -> CarmenSession.snapshot.state
            else -> CarmenSession.State.LISTENING
        }
    }

    private companion object {
        const val REFRESH_MS = 500L
    }
}
