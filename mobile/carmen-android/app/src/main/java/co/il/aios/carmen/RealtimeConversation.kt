package co.il.aios.carmen

import android.content.Context
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Live voice conversation with Carmen after the wake word. It opens the same OpenAI Realtime
 * session as the Command Center (`carmen-realtime-session` mints a short-lived key, so the
 * OpenAI key never reaches the phone) over a WebSocket, streams call audio both ways, and
 * answers the model's `ask_carmen` tool calls with Carmen's brain.
 */
class RealtimeConversation(
    context: Context,
    private val account: AiosAccount,
    private val log: EventLog,
    private val listener: Listener,
    /** When the wake word or the talk button fired; the first audio logs the delay from it. */
    private val activatedAt: Long,
) {
    interface Listener {
        fun onState(state: CarmenSession.State)
        fun onTranscript(line: String)
        fun onEnded(reason: String)
    }

    private val brain = CarmenBrain(account)
    private val worker = Executors.newSingleThreadScheduledExecutor()
    private val tools = Executors.newSingleThreadExecutor()
    private val responses = ResponseGate()
    private val audio = ConversationAudio(context) { pcm -> sendAudio(pcm) }
    private var socket: WebSocket? = null
    private var idleTimer: ScheduledFuture<*>? = null
    @Volatile private var ended = false
    @Volatile private var toolRunning = false
    @Volatile private var heardCarmen = false

    fun start() {
        listener.onState(CarmenSession.State.CONNECTING)
        worker.execute {
            try {
                val (secret, model) = mintSession()
                val request = Request.Builder()
                    .url("wss://api.openai.com/v1/realtime?model=$model")
                    .header("Authorization", "Bearer $secret")
                    .build()
                socket = http.newWebSocket(request, events)
            } catch (e: IOException) {
                end("error: ${e.message}")
            }
        }
    }

    fun stop(reason: String) = end(reason)

    private fun mintSession(): Pair<String, String> =
        account.callFunction("carmen-realtime-session", JSONObject()).use { response ->
            val json = JSONObject(response.body?.string() ?: "{}")
            if (!response.isSuccessful) {
                throw IOException(json.optString("message").ifEmpty { json.optString("error", "HTTP ${response.code}") })
            }
            json.getString("client_secret") to json.optString("model", "gpt-realtime")
        }

    private val events = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            log.record(EventLog.Event.CONVERSATION_STARTED)
            runCatching { audio.start() }.onFailure {
                end("error: audio ${it.message}")
                return
            }
            greet()
            resetIdleTimer()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            runCatching { handle(JSONObject(text)) }
                .onFailure { log.record(EventLog.Event.ERROR, "Realtime event: ${it.message}") }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            end("error: ${t.message}")
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            end("closed $code")
        }
    }

    private fun handle(event: JSONObject) {
        when (event.optString("type")) {
            "input_audio_buffer.speech_started" -> {
                audio.interrupt()
                listener.onState(CarmenSession.State.LISTENING)
                resetIdleTimer()
            }
            "response.created" -> {
                responses.onCreated()
                resetIdleTimer()
            }
            "response.output_audio.delta", "response.audio.delta" -> {
                if (!heardCarmen) {
                    heardCarmen = true
                    log.record(EventLog.Event.VOICE_STARTED, "latency_ms=${System.currentTimeMillis() - activatedAt}")
                }
                listener.onState(CarmenSession.State.SPEAKING)
                audio.play(Base64.decode(event.getString("delta"), Base64.DEFAULT))
            }
            "response.output_audio_transcript.done", "response.audio_transcript.done" ->
                // Only Carmen's words are shown; the user's own speech is not transcribed on screen.
                event.optString("transcript").trim().takeIf { it.isNotEmpty() }?.let { listener.onTranscript(it) }
            "response.output_item.done" -> event.optJSONObject("item")?.let(::maybeCallTool)
            "response.done" -> {
                if (responses.onDone()) send(JSONObject().put("type", "response.create"))
                listener.onState(CarmenSession.State.LISTENING)
                resetIdleTimer()
            }
            "error" -> log.record(EventLog.Event.ERROR, "Realtime: ${event.optJSONObject("error")?.optString("message")}")
        }
    }

    private fun maybeCallTool(item: JSONObject) {
        if (item.optString("type") != "function_call" || item.optString("name") != "ask_carmen") return
        val question = runCatching { JSONObject(item.optString("arguments")).optString("question") }.getOrDefault("")
        listener.onState(CarmenSession.State.THINKING)
        log.record(EventLog.Event.BRAIN_CALLED, question.take(80))
        toolRunning = true
        tools.execute {
            val answer = brain.ask(question)
            toolRunning = false
            if (ended) return@execute
            send(
                JSONObject().put("type", "conversation.item.create").put(
                    "item",
                    JSONObject().put("type", "function_call_output")
                        .put("call_id", item.optString("call_id"))
                        .put("output", answer.take(MAX_TOOL_OUTPUT)),
                ),
            )
            if (responses.requestCreate()) send(JSONObject().put("type", "response.create"))
            resetIdleTimer()
        }
    }

    /** The one opening line of the call, then Carmen waits for the user's request. */
    private fun greet() {
        send(
            JSONObject().put("type", "response.create").put(
                "response",
                JSONObject().put("instructions", "Say exactly \"כן, אני מקשיבה\" in Hebrew, nothing else, then wait."),
            ),
        )
    }

    private fun sendAudio(pcm: ByteArray) {
        send(
            JSONObject().put("type", "input_audio_buffer.append")
                .put("audio", Base64.encodeToString(pcm, Base64.NO_WRAP)),
        )
    }

    private fun send(event: JSONObject) {
        if (!ended) socket?.send(event.toString())
    }

    /** Ends the conversation after a stretch with no speech from either side. */
    private fun resetIdleTimer() {
        idleTimer?.cancel(false)
        if (ended) return
        // A long brain call is not silence: wait for its answer before counting idle time.
        idleTimer = worker.schedule({ if (toolRunning) resetIdleTimer() else end("idle") }, IDLE_MS, TimeUnit.MILLISECONDS)
    }

    @Synchronized
    private fun end(reason: String) {
        if (ended) return
        ended = true
        idleTimer?.cancel(false)
        audio.stop()
        socket?.close(1000, null)
        worker.shutdown()
        tools.shutdownNow()
        log.record(EventLog.Event.CONVERSATION_ENDED, reason)
        listener.onEnded(reason)
    }

    private companion object {
        const val IDLE_MS = 45_000L
        const val MAX_TOOL_OUTPUT = 8_000
        val http: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(20, TimeUnit.SECONDS)
            .build()
    }
}

/**
 * The Realtime API rejects `response.create` while a response is still streaming, so a tool
 * answer that arrives mid-response waits for `response.done` (same rule as the web client).
 */
class ResponseGate {
    private var active = false
    private var pending = false

    @Synchronized
    fun onCreated() {
        active = true
    }

    /** Returns true when a queued `response.create` should be sent now. */
    @Synchronized
    fun onDone(): Boolean {
        active = false
        val send = pending
        pending = false
        return send
    }

    /** Returns true when `response.create` can be sent now; otherwise it is queued. */
    @Synchronized
    fun requestCreate(): Boolean {
        if (active) pending = true
        return !active
    }
}
