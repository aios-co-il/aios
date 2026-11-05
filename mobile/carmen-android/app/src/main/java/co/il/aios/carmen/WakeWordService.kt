package co.il.aios.carmen

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Microphone foreground service: keeps the wake word engine running with the app in the
 * background or the screen locked, and activates Carmen when the phrase is heard.
 */
class WakeWordService : Service(), WakeWordEngine.Listener {

    private val handler = Handler(Looper.getMainLooper())
    private val gate = ActivationGate()
    private lateinit var log: EventLog
    private lateinit var voice: CarmenVoice
    private lateinit var account: AiosAccount
    private var engine: WakeWordEngine? = null
    private var conversation: RealtimeConversation? = null
    private var talkWhenReady = false
    private var wakeLock: PowerManager.WakeLock? = null

    private val endSessionOnTimeout = Runnable { endSession("timeout") }
    private val sampleBattery = object : Runnable {
        override fun run() {
            log.record(EventLog.Event.BATTERY_SAMPLE)
            renewWakeLock()
            handler.postDelayed(this, BATTERY_SAMPLE_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        log = EventLog(this)
        voice = CarmenVoice(this, log)
        account = AiosAccount(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopListening()
            ACTION_TALK -> talk()
            ACTION_SESSION_ENDED -> endSession("closed")
            ACTION_APP_MIC -> lendMicrophoneToApp(true)
            ACTION_APP_MIC_DONE -> lendMicrophoneToApp(false)
            else -> startListening()
        }
        return START_NOT_STICKY
    }

    private fun startListening() {
        if (engine != null) return
        try {
            ServiceCompat.startForeground(
                this, Notifications.LISTENING_ID, Notifications.listening(this),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } catch (e: RuntimeException) {
            // Android refuses a microphone service started from the background; ask for a tap.
            log.record(EventLog.Event.ERROR, "Foreground start refused: ${e.message}")
            getSystemService(NotificationManager::class.java)
                .notify(Notifications.RESUME_ID, Notifications.resume(this))
            stopSelf()
            return
        }
        ListeningPrefs.setEnabled(this, true)
        acquireWakeLock()
        status = Status.STARTING
        engine = VoskWakeWordEngine(this).also { it.start(this) }
    }

    override fun onReady() {
        gate.arm()
        status = Status.ARMED
        log.record(EventLog.Event.LISTENING_STARTED)
        handler.post(sampleBattery)
        if (talkWhenReady) {
            talkWhenReady = false
            activate("manual")
        }
    }

    /** "דברו עם כרמן" on the home screen: the same activation as the wake word, by tap. */
    private fun talk() {
        if (engine == null) {
            talkWhenReady = true
            startListening()
        } else {
            // IDLE only while the Command Center holds the microphone; a running session stays as is.
            if (gate.state == ActivationGate.State.IDLE) gate.arm()
            activate("manual")
        }
    }

    override fun onWakeWord(words: List<RecognizedWord>) {
        activate(words.joinToString(" ") { "${it.word}:${"%.2f".format(it.confidence)}" })
    }

    private fun activate(detail: String) {
        if (!gate.tryActivate(System.currentTimeMillis())) {
            log.record(EventLog.Event.WAKE_IGNORED, detail)
            return
        }
        engine?.setPaused(true)
        status = Status.ACTIVE
        log.record(EventLog.Event.WAKE_DETECTED, detail)
        CarmenSession.begin()
        showCarmen()
        voice.acknowledge(
            onStart = { ms -> log.record(EventLog.Event.VOICE_STARTED, "latency_ms=$ms") },
            onDone = { handler.post { startConversation() } },
        )
        handler.postDelayed(endSessionOnTimeout, ActivationGate.DEFAULT_MAX_SESSION_MS)
    }

    /** After "כן, אני מקשיבה", opens the live conversation with Carmen's brain. */
    private fun startConversation() {
        if (gate.state != ActivationGate.State.ACTIVE || conversation != null) return
        if (!account.isSignedIn) {
            CarmenSession.notice(getString(R.string.sign_in_to_talk))
            handler.removeCallbacks(endSessionOnTimeout)
            handler.postDelayed(endSessionOnTimeout, SIGNED_OUT_SESSION_MS)
            return
        }
        conversation = RealtimeConversation(this, account, log, conversationListener).also { it.start() }
    }

    private val conversationListener = object : RealtimeConversation.Listener {
        override fun onState(state: CarmenSession.State) = CarmenSession.setState(state)
        override fun onTranscript(line: String) = CarmenSession.addLine(line)
        override fun onEnded(reason: String) {
            if (reason.startsWith("error")) CarmenSession.notice(getString(R.string.conversation_failed, reason))
            handler.post {
                conversation = null
                endSession(reason)
            }
        }
    }

    private fun showCarmen() {
        getSystemService(NotificationManager::class.java)
            .notify(Notifications.WAKE_ID, Notifications.wake(this))
        // Opens directly when the app is visible; otherwise the full-screen notification does.
        startActivity(Intent(this, CarmenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun endSession(reason: String) {
        if (gate.state != ActivationGate.State.ACTIVE) return
        handler.removeCallbacks(endSessionOnTimeout)
        conversation?.also { conversation = null }?.stop(reason)
        CarmenSession.setState(CarmenSession.State.ENDED)
        getSystemService(NotificationManager::class.java).cancel(Notifications.WAKE_ID)
        gate.endSession()
        engine?.setPaused(false)
        status = Status.ARMED
        log.record(EventLog.Event.SESSION_ENDED, reason)
    }

    /**
     * The in-app Command Center's live voice needs the microphone: the wake word steps aside
     * while the app screen holds it and listens again when the user leaves that screen.
     */
    private fun lendMicrophoneToApp(lend: Boolean) {
        if (gate.state == ActivationGate.State.ACTIVE) return
        if (lend && gate.state == ActivationGate.State.ARMED) {
            gate.disarm()
            engine?.setPaused(true)
            log.record(EventLog.Event.MIC_LENT_TO_APP)
        } else if (!lend && gate.state == ActivationGate.State.IDLE && engine != null) {
            engine?.setPaused(false)
            gate.arm()
        }
    }

    override fun onError(message: String, error: Throwable?) {
        log.record(EventLog.Event.ERROR, "$message: ${error?.message.orEmpty()}")
        stopListening()
    }

    private fun stopListening() {
        ListeningPrefs.setEnabled(this, false)
        stopSelf()
    }

    private fun acquireWakeLock() {
        // Keeps the CPU processing microphone audio while the screen is off.
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "carmen:wakeword")
            .apply { setReferenceCounted(false) }
        renewWakeLock()
    }

    /** Re-acquired on each battery sample, so a lost service cannot hold the CPU for long. */
    private fun renewWakeLock() {
        wakeLock?.acquire(WAKE_LOCK_TIMEOUT_MS)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        conversation?.also { conversation = null }?.stop("listening stopped")
        engine?.stop()
        if (engine != null) log.record(EventLog.Event.LISTENING_STOPPED)
        engine = null
        gate.disarm()
        voice.shutdown()
        wakeLock?.takeIf { it.isHeld }?.release()
        status = Status.STOPPED
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    enum class Status { STOPPED, STARTING, ARMED, ACTIVE }

    companion object {
        const val ACTION_START = "co.il.aios.carmen.START"
        const val ACTION_STOP = "co.il.aios.carmen.STOP"
        const val ACTION_TALK = "co.il.aios.carmen.TALK"
        const val ACTION_SESSION_ENDED = "co.il.aios.carmen.SESSION_ENDED"
        const val ACTION_APP_MIC = "co.il.aios.carmen.APP_MIC"
        const val ACTION_APP_MIC_DONE = "co.il.aios.carmen.APP_MIC_DONE"
        private const val BATTERY_SAMPLE_MS = 15 * 60 * 1000L
        private const val SIGNED_OUT_SESSION_MS = 8_000L
        private const val WAKE_LOCK_TIMEOUT_MS = BATTERY_SAMPLE_MS + 5 * 60 * 1000L

        @Volatile
        var status: Status = Status.STOPPED
            private set

        fun intent(context: Context, action: String): Intent =
            Intent(context, WakeWordService::class.java).setAction(action)

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, intent(context, ACTION_START))
        }

        /** Resumes listening after a reboot or a refused background start, once the app is visible. */
        fun resumeIfEnabled(context: Context) {
            val micGranted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            if (ListeningPrefs.isEnabled(context) && status == Status.STOPPED && micGranted) start(context)
        }

        /** Opens a conversation now, starting the microphone service first if it is off. */
        fun talk(context: Context) {
            val intent = intent(context, ACTION_TALK)
            if (status == Status.STOPPED) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }

        fun send(context: Context, action: String) {
            if (status != Status.STOPPED) context.startService(intent(context, action))
        }
    }
}
