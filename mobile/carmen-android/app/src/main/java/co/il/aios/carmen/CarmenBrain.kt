package co.il.aios.carmen

import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Carmen's full brain (`run-ai-agent`), called as the signed-in user — the same call the
 * Command Center's live voice makes for its `ask_carmen` tool, so tenant scoping and
 * per-user permissions are enforced server-side.
 */
class CarmenBrain(private val account: AiosAccount) {

    /** The server conversation this session's questions went to, once the first answer arrives. */
    @Volatile var conversationId: String? = null
        private set

    /** The question being answered now, so the chat's stop button can stop it. */
    @Volatile private var runId: String? = null

    /**
     * Blocking: streams the brain's answer and returns it as text. [history] is the earlier
     * typed conversation (role to text), sent like the web chat sends it. [onPartial] gets the
     * answer so far as it streams in (at most every [PARTIAL_EVERY_MS]), so a chat can show it live.
     */
    fun ask(
        question: String,
        history: List<Pair<String, String>> = emptyList(),
        onPartial: ((String) -> Unit)? = null,
    ): String {
        if (question.isBlank()) return "לא התקבלה שאלה."
        val session = runCatching { account.session() }.getOrElse { return "שגיאת התחברות למערכת." }
        val body = JSONObject()
            .put("command_text", question)
            .put("tenant_id", session.tenantId)
            .put("surface", "internal_chat")
            .put("stream", true)
            .put("conversation_id", conversationId ?: JSONObject.NULL)
            .put("run_id", java.util.UUID.randomUUID().toString().also { runId = it })
            .put(
                "conversation_history",
                JSONArray(history.takeLast(MAX_HISTORY).map { (role, content) -> JSONObject().put("role", role).put("content", content) }),
            )
        return runCatching {
            account.callFunction("run-ai-agent", body, streamingHttp).use { response ->
                val source = response.body?.source()
                if (!response.isSuccessful || source == null) return "לא הצלחתי לגשת למערכת כרגע."
                val stream = BrainStream()
                var lastPartialAt = 0L
                while (!source.exhausted()) {
                    val grew = stream.accept(source.readUtf8Line() ?: break)
                    val now = System.currentTimeMillis()
                    if (grew && onPartial != null && now - lastPartialAt >= PARTIAL_EVERY_MS) {
                        lastPartialAt = now
                        onPartial(stream.partial())
                    }
                }
                stream.conversationId?.let { conversationId = it }
                stream.answer()
            }
        }.getOrElse { "לא הצלחתי לגשת למערכת כרגע: ${it.message.orEmpty().take(120)}" }
            .also { runId = null }
    }

    /**
     * Blocking. Stops the answer in progress: the brain stops before its next step and says what
     * it already did (`carmen_run_cancellations`). False when nothing runs or the stop failed.
     */
    fun stop(): Boolean {
        val running = runId ?: return false
        return runCatching {
            account.restWrite(
                "POST",
                "carmen_run_cancellations",
                JSONObject().put("run_id", running).put("tenant_id", account.session().tenantId),
                prefer = "return=minimal",
            )
            true
        }.getOrDefault(false)
    }

    private companion object {
        const val MAX_HISTORY = 24
        const val PARTIAL_EVERY_MS = 80L

        // Long tool runs stream for minutes; the SSE stream keeps the connection alive.
        val streamingHttp: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(120, TimeUnit.SECONDS)
            .callTimeout(180, TimeUnit.SECONDS)
            .build()
    }
}

/** Parses `run-ai-agent` server-sent events (`data: {...}` lines) into one answer. */
class BrainStream {
    private val tokens = StringBuilder()
    private var status = ""
    private var error: String? = null
    var conversationId: String? = null
        private set

    /** Reads one stream line; true when it changed what a chat should show (text or progress). */
    fun accept(line: String): Boolean {
        if (!line.startsWith("data: ")) return false
        val payload = line.removePrefix("data: ")
        if (payload == "[DONE]") return false
        val event = runCatching { JSONObject(payload) }.getOrNull() ?: return false
        when (event.optString("type")) {
            "token" -> {
                tokens.append(event.optString("content"))
                return true
            }
            "status" -> {
                status = event.optString("content").trim()
                return status.isNotEmpty()
            }
            // Tool names are internal: progress is shown in plain words.
            "tool_call" -> {
                status = "בודקת במערכת…"
                return true
            }
            "conversation_id" -> event.optString("id").takeIf { it.isNotEmpty() }?.let { conversationId = it }
            // The function answers 200 and reports failures inside the stream.
            "error" -> error = event.optString("message").ifEmpty { event.optString("error", "שגיאה במערכת") }
            "done" -> if (!event.optBoolean("success", true) && error == null) error = "הפעולה נכשלה"
        }
        return false
    }

    /** What to show while it streams: the answer so far, else the latest progress line. */
    fun partial(): String = tokens.toString().trim().ifEmpty { status }

    fun answer(): String {
        val text = tokens.toString().trim()
        val failure = error?.take(200)
        return when {
            failure == null -> text.ifEmpty { "לא נמצאה תשובה." }
            text.isEmpty() -> "נתקלתי בשגיאה במערכת: $failure"
            else -> "$text\n(שים לב: הפעולה נקטעה בשגיאה: $failure)"
        }
    }
}
