package co.il.aios.carmen

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import kotlin.concurrent.thread

/**
 * Settings and test screen: AIOS sign-in, listening on/off, Carmen's voice, setup shortcuts,
 * counters and log export.
 */
class SettingsActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var log: EventLog
    private lateinit var statusText: TextView
    private lateinit var countersText: TextView
    private lateinit var toggleButton: Button
    private lateinit var accountSection: AccountSection
    private lateinit var voiceButton: Button
    private lateinit var voicePreference: VoicePreference

    private val refresh = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, REFRESH_MS)
        }
    }

    private val permissionRequest =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (hasMicPermission()) WakeWordService.start(this)
            else Toast.makeText(this, R.string.mic_permission_needed, Toast.LENGTH_LONG).show()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        keepClearOfSystemBars()
        Notifications.createChannels(this)
        log = EventLog(this)
        statusText = findViewById(R.id.status_text)
        countersText = findViewById(R.id.counters_text)
        toggleButton = findViewById(R.id.toggle_button)
        toggleButton.setOnClickListener { toggleListening() }
        findViewById<Button>(R.id.battery_button).setOnClickListener {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        findViewById<Button>(R.id.full_screen_button).setOnClickListener { openFullScreenSetting() }
        findViewById<Button>(R.id.export_button).setOnClickListener { exportLog() }
        accountSection = AccountSection(this)
        voicePreference = VoicePreference(this)
        voiceButton = findViewById(R.id.voice_button)
        voiceButton.setOnClickListener { pickVoice() }
        renderVoice()
        findViewById<Button>(R.id.clear_button).setOnClickListener {
            log.clear()
            render()
        }
    }

    override fun onResume() {
        super.onResume()
        WakeWordService.resumeIfEnabled(this)
        accountSection.render()
        handler.post(refresh)
    }

    override fun onPause() {
        handler.removeCallbacks(refresh)
        super.onPause()
    }

    private fun toggleListening() {
        if (WakeWordService.status != WakeWordService.Status.STOPPED) {
            WakeWordService.send(this, WakeWordService.ACTION_STOP)
            return
        }
        val needed = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isEmpty()) WakeWordService.start(this) else permissionRequest.launch(needed.toTypedArray())
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun openFullScreenSetting() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivity(
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, "package:$packageName".toUri()),
            )
        } else {
            Toast.makeText(this, R.string.full_screen_not_needed, Toast.LENGTH_SHORT).show()
        }
    }

    /** Loads the server's voice list and saves the user's pick for the next conversation. */
    private fun pickVoice() {
        val account = AiosAccount(this)
        if (!account.isSignedIn) {
            Toast.makeText(this, R.string.sign_in_to_talk, Toast.LENGTH_SHORT).show()
            return
        }
        Toast.makeText(this, R.string.voice_loading, Toast.LENGTH_SHORT).show()
        thread(name = "carmen-voices") {
            val choices = runCatching { VoicePreference.loadChoices(account, getString(R.string.voice_openai)) }
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                choices.onSuccess(::showVoiceDialog).onFailure {
                    Toast.makeText(this, getString(R.string.voice_load_failed, it.message), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showVoiceDialog(choices: List<VoicePreference.Choice>) {
        val current = choices.indexOfFirst { it.id == voicePreference.selected?.id }
        AlertDialog.Builder(this)
            .setTitle(R.string.voice_title)
            .setSingleChoiceItems(choices.map { it.label }.toTypedArray(), current) { dialog, which ->
                val choice = choices[which]
                voicePreference.select(choice)
                renderVoice()
                Toast.makeText(this, getString(R.string.voice_saved, choice.label), Toast.LENGTH_SHORT).show()
                dialog.dismiss()
            }
            .show()
    }

    private fun renderVoice() {
        val label = voicePreference.selected?.label?.takeIf { it.isNotEmpty() }
        voiceButton.text = if (label == null) getString(R.string.voice_default) else getString(R.string.voice_current, label)
    }

    private fun exportLog() {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, getString(R.string.export_subject))
            .putExtra(Intent.EXTRA_TEXT, log.export())
        startActivity(Intent.createChooser(send, getString(R.string.export_log)))
    }

    private fun render() {
        val status = WakeWordService.status
        statusText.text = getString(
            when (status) {
                WakeWordService.Status.STOPPED -> R.string.status_stopped
                WakeWordService.Status.STARTING -> R.string.status_starting
                WakeWordService.Status.ARMED -> R.string.status_armed
                WakeWordService.Status.ACTIVE -> R.string.status_active
            },
        )
        toggleButton.setText(
            if (status == WakeWordService.Status.STOPPED) R.string.start_listening else R.string.stop_listening,
        )
        countersText.text = getString(
            R.string.counters,
            log.count(EventLog.Event.WAKE_DETECTED),
            log.count(EventLog.Event.FALSE_ACTIVATION),
            log.count(EventLog.Event.WAKE_IGNORED),
            fullScreenAllowedLabel(),
        )
    }

    private fun fullScreenAllowedLabel(): String {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        return getString(if (allowed) R.string.yes else R.string.no)
    }

    private companion object {
        const val REFRESH_MS = 1_000L
    }
}
