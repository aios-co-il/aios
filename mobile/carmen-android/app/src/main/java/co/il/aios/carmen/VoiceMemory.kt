package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject

/** What was said in one voice conversation, in order: the user's words and Carmen's. */
class VoiceTranscript {
    private val turns = mutableListOf<Pair<String, String>>()

    @Synchronized
    fun user(text: String) = add("user", text)

    @Synchronized
    fun carmen(text: String) = add("assistant", text)

    /** The conversation so far as (role, text) pairs, the shape the brain's history takes. */
    @Synchronized
    fun turns(): List<Pair<String, String>> = turns.toList()

    /** Worth remembering only once the user said something. */
    @Synchronized
    fun worthSaving(): Boolean = turns.any { it.first == "user" }

    private fun add(role: String, text: String) {
        text.trim().takeIf { it.isNotEmpty() }?.let { turns += role to it }
    }

    /** The transcript as `ai_conversations.messages`. */
    fun messages(): JSONArray =
        JSONArray(turns().map { (role, content) -> JSONObject().put("role", role).put("content", content) })

    /** A chat title from the user's first words, like the web chat's first-message title. */
    fun title(): String = "שיחה קולית · " + (turns().firstOrNull { it.first == "user" }?.second.orEmpty()).take(TITLE_CHARS)

    private companion object {
        const val TITLE_CHARS = 50
    }
}

/**
 * Keeps a finished voice conversation in Carmen's memory. The full transcript goes to the
 * user's conversation row (the one her brain answered in during the call, or a new one),
 * then `carmen-learn-from-session` turns it into memory, as the web chat does when a chat ends.
 * Without this only the questions relayed to her brain were stored, so she forgot the call.
 */
class VoiceMemory(private val account: AiosAccount, private val log: EventLog) {

    /** Blocking: call off the main thread. Failures are logged, never thrown. */
    fun save(transcript: VoiceTranscript, conversationId: String?) {
        if (!transcript.worthSaving()) return
        runCatching {
            val id = conversationId?.also { update(it, transcript) } ?: insert(transcript)
            account.callFunction("carmen-learn-from-session", JSONObject().put("ai_conversation_id", id)).use { response ->
                if (!response.isSuccessful) log.record(EventLog.Event.ERROR, "Voice memory learn: HTTP ${response.code}")
            }
            log.record(EventLog.Event.MEMORY_SAVED, "turns=${transcript.turns().size}")
        }.onFailure { log.record(EventLog.Event.ERROR, "Voice memory: ${it.message.orEmpty().take(160)}") }
    }

    private fun update(conversationId: String, transcript: VoiceTranscript) {
        val rows = account.restWrite(
            "PATCH",
            "ai_conversations?id=eq.$conversationId",
            JSONObject().put("messages", transcript.messages()),
        )
        if (rows.length() == 0) throw IllegalStateException("conversation $conversationId not found")
    }

    private fun insert(transcript: VoiceTranscript): String {
        val session = account.session()
        val row = JSONObject()
            .put("user_id", session.userId)
            .put("tenant_id", session.tenantId)
            .put("title", transcript.title())
            .put("messages", transcript.messages())
        return account.restWrite("POST", "ai_conversations", row).getJSONObject(0).getString("id")
    }
}
