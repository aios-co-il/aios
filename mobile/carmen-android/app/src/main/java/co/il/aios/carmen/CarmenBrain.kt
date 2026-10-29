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

    /**
     * Blocking: streams the brain's answer and returns it as text. [history] is the earlier
     * typed conversation (role to text), sent like the web chat sends it.
     */
    fun ask(question: String, history: List<Pair<String, String>> = emptyList()): String {
        if (question.isBlank()) return "לא התקבלה שאלה."
        val session = runCatching { account.session() }.getOrElse { return "שגיאת התחברות למערכת." }
        val body = JSONObject()
            .put("command_text", question)
            .put("tenant_id", session.tenantId)
            .put("surface", "internal_chat")
            .put("stream", true)
            .put("conversation_id", conversationId ?: JSONObject.NULL)
            .put(
                "conversation_history",
                JSONArray(history.takeLast(MAX_HISTORY).map { (role, content) -> JSONObject().put("role", role).put("content", content) }),
            )
        return runCatching {
            account.callFunction("run-ai-agent", body, streamingHttp).use { response ->
                val source = response.body?.source()
                if (!response.isSuccessful || source == null) return "לא הצלחתי לגשת למערכת כרגע."
                val stream = BrainStream()
                while (!source.exhausted()) stream.accept(source.readUtf8Line() ?: break)
                stream.conversationId?.let { conversationId = it }
                stream.answer()
            }
        }.getOrElse { "לא הצלחתי לגשת למערכת כרגע: ${it.message.orEmpty().take(120)}" }
    }

    private companion object {
        const val MAX_HISTORY = 24

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
    private var error: String? = null
    var conversationId: String? = null
        private set

    fun accept(line: String) {
        if (!line.startsWith("data: ")) return
        val payload = line.removePrefix("data: ")
        if (payload == "[DONE]") return
        val event = runCatching { JSONObject(payload) }.getOrNull() ?: return
        when (event.optString("type")) {
            "token" -> tokens.append(event.optString("content"))
            "conversation_id" -> event.optString("id").takeIf { it.isNotEmpty() }?.let { conversationId = it }
            // The function answers 200 and reports failures inside the stream.
            "error" -> error = event.optString("message").ifEmpty { event.optString("error", "שגיאה במערכת") }
            "done" -> if (!event.optBoolean("success", true) && error == null) error = "הפעולה נכשלה"
        }
    }

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
