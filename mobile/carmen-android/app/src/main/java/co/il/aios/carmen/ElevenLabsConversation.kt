package co.il.aios.carmen

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.io.IOException
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Live voice conversation with Carmen on ElevenLabs Agents (AIO-505), in the voice picked in
 * settings. `carmen-realtime-session` mints a signed URL and Carmen's persona, so the API key
 * never reaches the phone; the agent itself declares the client tools this class answers.
 * When ElevenLabs is not available for this user or environment, [onUnavailable] gets the
 * reason instead of the listener ending the session, so the caller can start OpenAI.
 */
class ElevenLabsConversation(
    context: Context,
    private val account: AiosAccount,
    private val log: EventLog,
    private val listener: LiveConversation.Listener,
    /** When the wake word or the talk button fired; the first audio logs the delay from it. */
    private val activatedAt: Long,
    /** The picked voice key, or null for Carmen's configured voice. */
    private val voice: String?,
    private val onUnavailable: (reason: String) -> Unit,
) : LiveConversation {
    private val toolbox = ConversationTools(context, account, log)
    private val memory = VoiceMemory(account, log)
    private val transcript = VoiceTranscript()
    private val worker = Executors.newSingleThreadScheduledExecutor()
    private val tools = Executors.newSingleThreadExecutor()

    /**
     * Brain questions run here, one after another, while the conversation goes on: Carmen keeps
     * listening and answering, and each result reaches her when it is ready. One at a time, so
     * two answers never race to save the same brain conversation.
     */
    private val brainQueue = Executors.newSingleThreadExecutor()
    private val brainPending = AtomicInteger(0)

    /** Bumped when the user calls off the checks; queued questions from before it are skipped. */
    private val brainEpoch = AtomicInteger(0)
    private val audio = ConversationAudio(context, ConversationAudio.ELEVENLABS_SAMPLE_RATE) { pcm -> sendAudio(pcm) }
    @Volatile private var socket: WebSocket? = null
    private var idleTimer: ScheduledFuture<*>? = null
    private var quietTimer: ScheduledFuture<*>? = null
    @Volatile private var ended = false
    @Volatile private var toolRunning = false
    @Volatile private var heardCarmen = false
    @Volatile private var lastAudioAt = 0L

    /** A call or media start waiting for Carmen's last line, then the end of the conversation. */
    @Volatile private var afterConversation: (() -> Unit)? = null
    @Volatile private var finishAfterNextLine = false

    override fun start() {
        listener.onState(CarmenSession.State.CONNECTING)
        worker.execute {
            try {
                val session = mintSession() ?: return@execute
                if (ended) return@execute
                socket = http.newWebSocket(Request.Builder().url(session.signedUrl).build(), events(session))
            } catch (e: Exception) {
                // IO, a malformed mint response or a refused token: never leave the call stuck connecting.
                end("error: ${e.message}")
            }
        }
    }

    override fun stop(reason: String) = end(reason)

    /** The session, or null after handing an unavailable ElevenLabs to [onUnavailable]. */
    private fun mintSession(): ElevenLabsSession? {
        val body = JSONObject().put("provider", "elevenlabs")
        voice?.let { body.put("voice", it) }
        return account.callFunction("carmen-realtime-session", body).use { response ->
            val json = JSONObject(response.body?.string() ?: "{}")
            when {
                response.isSuccessful -> ElevenLabsSession.from(json)
                response.code in FALLBACK_CODES -> {
                    fallBack(json.optString("error", "HTTP ${response.code}"))
                    null
                }
                else -> throw IOException(json.optString("error", "HTTP ${response.code}"))
            }
        }
    }

    private fun events(session: ElevenLabsSession) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send(ElevenLabsProtocol.initiation(session).toString())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            runCatching { handle(ElevenLabsProtocol.parse(JSONObject(text))) }
                .onFailure { log.record(EventLog.Event.ERROR, "ElevenLabs event: ${it.message}") }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            end("error: ${t.message}")
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            end("closed $code $reason".trim())
        }
    }

    private fun handle(event: ElevenLabsEvent) {
        when (event) {
            is ElevenLabsEvent.Started -> onStarted(event)
            is ElevenLabsEvent.Audio -> onAudio(event.base64)
            is ElevenLabsEvent.CarmenSaid -> onCarmenSaid(event.text)
            is ElevenLabsEvent.UserSaid -> {
                transcript.user(event.text)
                listener.onState(CarmenSession.State.LISTENING)
                answerPendingSend(event.text)
                cancelChecksIfAsked(event.text)
                resetIdleTimer()
            }
            ElevenLabsEvent.Interrupted -> {
                audio.interrupt()
                listener.onState(CarmenSession.State.LISTENING)
                resetIdleTimer()
            }
            is ElevenLabsEvent.Ping -> send(ElevenLabsProtocol.pong(event.eventId))
            is ElevenLabsEvent.ToolCall -> callTool(event)
            is ElevenLabsEvent.Other -> Unit
        }
    }

    private fun onStarted(event: ElevenLabsEvent.Started) {
        // The phone records and plays one rate; any other agent format would sound wrong.
        if (event.inputFormat != ElevenLabsProtocol.AUDIO_FORMAT || event.outputFormat != ElevenLabsProtocol.AUDIO_FORMAT) {
            end("error: agent audio ${event.inputFormat}/${event.outputFormat}, expected ${ElevenLabsProtocol.AUDIO_FORMAT}")
            return
        }
        log.record(EventLog.Event.CONVERSATION_STARTED, "elevenlabs")
        runCatching { audio.start() }.onFailure {
            end("error: audio ${it.message}")
            return
        }
        resetIdleTimer()
    }

    private fun onAudio(base64: String) {
        if (base64.isEmpty()) return
        if (!heardCarmen) {
            heardCarmen = true
            log.record(EventLog.Event.VOICE_STARTED, "latency_ms=${System.currentTimeMillis() - activatedAt}")
        }
        lastAudioAt = System.currentTimeMillis()
        listener.onState(CarmenSession.State.SPEAKING)
        audio.play(Base64.getDecoder().decode(base64))
        listenWhenQuiet()
        resetIdleTimer()
    }

    /** ElevenLabs sends no end-of-speech event: Carmen is listening once her audio stops. */
    private fun listenWhenQuiet() {
        quietTimer?.cancel(false)
        quietTimer = schedule(QUIET_MS) {
            if (audio.isIdle() && !toolRunning) listener.onState(quietState()) else listenWhenQuiet()
        }
    }

    /** While brain checks run in the background she is shown working, else listening (AIO-543). */
    private fun quietState() =
        if (brainPending.get() > 0) CarmenSession.State.THINKING else CarmenSession.State.LISTENING

    private fun onCarmenSaid(text: String) {
        // Only Carmen's words are shown; the user's words are kept for memory, not displayed.
        text.trim().takeIf { it.isNotEmpty() }?.let {
            transcript.carmen(it)
            listener.onTranscript(it)
        }
        if (finishAfterNextLine) {
            finishAfterNextLine = false
            finishForPhoneAction()
        }
        resetIdleTimer()
    }

    private fun callTool(call: ElevenLabsEvent.ToolCall) {
        if (!toolbox.handles(call.name)) {
            log.record(EventLog.Event.ERROR, "ElevenLabs asked for unknown tool ${call.name}")
            send(ElevenLabsProtocol.toolResult(call.callId, "הכלי ${call.name} לא קיים באפליקציה.", isError = true))
            return
        }
        if (call.name == ConversationTools.ASK_CARMEN) {
            askInBackground(call)
            return
        }
        toolRunning = true
        tools.execute {
            // The call so far, so the brain's conversation starts with what was already said.
            val result = toolbox.run(call.name, call.args, transcript.turns())
            toolRunning = false
            if (ended) return@execute
            result.afterConversation?.let {
                afterConversation = it
                finishAfterNextLine = true
                // If Carmen says nothing after the tool, the call or media still starts.
                schedule(MAX_WAIT_FOR_LAST_LINE_MS) { finishForPhoneAction() }
            }
            send(ElevenLabsProtocol.toolResult(call.callId, result.output.take(MAX_TOOL_OUTPUT)))
            resetIdleTimer()
        }
    }

    /**
     * Frees Carmen at once and asks her brain in the background (seen in Production: a 33 s brain
     * call during which she could not hear the user). The tool answers "checking"; the result
     * comes back as a message once it is ready and she is quiet.
     */
    private fun askInBackground(call: ElevenLabsEvent.ToolCall) {
        val question = call.args.optString("question")
        val ahead = brainPending.getAndIncrement()
        val epoch = brainEpoch.get()
        send(ElevenLabsProtocol.toolResult(call.callId, backgroundAck(ahead)))
        resetIdleTimer()
        brainQueue.execute {
            if (epoch != brainEpoch.get()) {
                brainPending.decrementAndGet()
                return@execute
            }
            val result = runCatching { toolbox.run(call.name, call.args, transcript.turns()) }
            brainPending.decrementAndGet()
            if (ended) return@execute
            if (audio.isIdle()) listener.onState(quietState())
            if (epoch != brainEpoch.get()) return@execute
            val answer = result.getOrNull()?.output ?: "הבדיקה נכשלה: ${result.exceptionOrNull()?.message.orEmpty().take(120)}"
            deliver(
                "[תשובה מ-ask_carmen לשאלה \"${question.take(160)}\"]\n${answer.take(MAX_TOOL_OUTPUT)}\n" +
                    "מסרי למשתמש עכשיו את השורה התחתונה בקצרה, לפי כללי האורך.",
            )
        }
    }

    /**
     * The user called off the checks Carmen is running: queued ones are skipped, the running one
     * is stopped on the server, and she is told so.
     */
    private fun cancelChecksIfAsked(spoken: String) {
        if (ended || brainPending.get() == 0 || !SpokenCancel.matches(spoken)) return
        brainEpoch.incrementAndGet()
        log.record(EventLog.Event.PHONE_TOOL, "brain checks cancelled by voice")
        tools.execute {
            runCatching { toolbox.brain.stop() }
            deliver(
                "[הודעת מערכת, לא מהמשתמש] הבדיקות שרצו ברקע בוטלו לבקשת המשתמש. " +
                    "אמרי במשפט אחד שעצרת, ואם משהו כבר בוצע לפני העצירה, אל תמציאי: אמרי שתבדקי.",
            )
        }
    }

    /** A spoken yes or no to a WhatsApp message waiting for approval; the app acts on it itself. */
    private fun answerPendingSend(spoken: String) {
        if (ended) return
        tools.execute {
            val note = runCatching { toolbox.answerPendingSend(spoken) }
                .onFailure { log.record(EventLog.Event.ERROR, "Spoken approval: ${it.message}") }
                .getOrNull()
            if (note != null && !ended) deliver(note)
        }
    }

    /**
     * Hands Carmen a message once she is quiet, so a result does not cut her off mid-sentence;
     * after [MAX_DELIVER_WAIT_MS] it goes anyway.
     */
    private fun deliver(text: String, waitedMs: Long = 0) {
        if (ended) return
        val speaking = !audio.isIdle() || System.currentTimeMillis() - lastAudioAt < QUIET_MS
        if (speaking && waitedMs < MAX_DELIVER_WAIT_MS) {
            schedule(POLL_MS) { deliver(text, waitedMs + POLL_MS) }
            return
        }
        send(ElevenLabsProtocol.userMessage(text))
        resetIdleTimer()
    }

    /** What Carmen hears right after handing a question to her brain. */
    private fun backgroundAck(ahead: Int): String {
        val queue = if (ahead > 0) " יש לפניה עוד $ahead בדיקות בתור." else ""
        return "הבדיקה התחילה ברקע.$queue אמרי במשפט קצר שאת בודקת ושאפשר להמשיך לדבר בינתיים. " +
            "אל תמסרי נתונים עד שתגיע הודעה שמתחילה ב-[תשובה מ-ask_carmen]."
    }

    /**
     * Lets Carmen's last words play out, ends the conversation, then dials or starts the media.
     * Her audio keeps streaming after her text arrives, so it waits for a quiet stretch too.
     */
    private fun finishForPhoneAction(waitedMs: Long = 0) {
        if (ended || afterConversation == null) return
        val stillSpeaking = !audio.isIdle() || System.currentTimeMillis() - lastAudioAt < QUIET_MS
        if (stillSpeaking && waitedMs < MAX_LAST_LINE_MS) {
            schedule(POLL_MS) { finishForPhoneAction(waitedMs + POLL_MS) }
            return
        }
        val action = afterConversation
        afterConversation = null
        schedule(PLAYBACK_TAIL_MS) {
            end("phone action")
            runCatching { action?.invoke() }.onFailure { log.record(EventLog.Event.ERROR, "Phone action: ${it.message}") }
        }
    }

    /** Runs [task] on the worker after [delayMs]; null once the conversation has ended. */
    private fun schedule(delayMs: Long, task: () -> Unit): ScheduledFuture<*>? {
        if (ended || worker.isShutdown) return null
        // The worker can shut down between the check and the call (another thread ended the call).
        return runCatching { worker.schedule(Runnable { task() }, delayMs, TimeUnit.MILLISECONDS) }.getOrNull()
    }

    private fun sendAudio(pcm: ByteArray) {
        if (CarmenSession.micMuted) return
        send(ElevenLabsProtocol.userAudio(Base64.getEncoder().encodeToString(pcm)))
    }

    private fun send(event: JSONObject) {
        if (!ended) socket?.send(event.toString())
    }

    /** Ends the conversation after a stretch with no speech from either side. */
    private fun resetIdleTimer() {
        idleTimer?.cancel(false)
        // A long brain call is not silence: wait for its answer before counting idle time.
        idleTimer = schedule(IDLE_MS) {
            if (toolRunning || brainPending.get() > 0) resetIdleTimer() else end("idle")
        }
    }

    /** Stops without ending the session, so the caller can start the OpenAI conversation instead. */
    @Synchronized
    private fun fallBack(reason: String) {
        if (ended) return
        ended = true
        worker.shutdown()
        tools.shutdownNow()
        brainQueue.shutdownNow()
        log.record(EventLog.Event.ERROR, "ElevenLabs unavailable ($reason), using OpenAI")
        onUnavailable(reason)
    }

    @Synchronized
    private fun end(reason: String) {
        if (ended) return
        ended = true
        idleTimer?.cancel(false)
        quietTimer?.cancel(false)
        audio.stop()
        socket?.close(1000, null)
        worker.shutdown()
        tools.shutdownNow()
        brainQueue.shutdownNow()
        log.record(EventLog.Event.CONVERSATION_ENDED, reason)
        thread(name = "carmen-memory") { memory.save(transcript, toolbox.brain.conversationId) }
        listener.onEnded(reason)
    }

    private companion object {
        /** Not allowed for this user, not configured here, or ElevenLabs refused: use OpenAI. */
        val FALLBACK_CODES = setOf(403, 502, 503)
        const val IDLE_MS = 45_000L
        const val POLL_MS = 200L
        const val QUIET_MS = 600L
        const val MAX_LAST_LINE_MS = 6_000L
        const val MAX_WAIT_FOR_LAST_LINE_MS = 8_000L
        const val PLAYBACK_TAIL_MS = 700L
        const val MAX_TOOL_OUTPUT = 8_000
        const val MAX_DELIVER_WAIT_MS = 10_000L
        val http: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(20, TimeUnit.SECONDS)
            .build()
    }
}
