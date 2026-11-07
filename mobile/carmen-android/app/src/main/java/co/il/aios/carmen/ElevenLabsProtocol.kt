package co.il.aios.carmen

import org.json.JSONObject

/** What `carmen-realtime-session` returns for an ElevenLabs conversation. */
data class ElevenLabsSession(
    val signedUrl: String,
    val prompt: String,
    val firstMessage: String,
    val language: String,
    val voiceId: String,
) {
    companion object {
        fun from(json: JSONObject) = ElevenLabsSession(
            signedUrl = json.getString("signed_url"),
            prompt = json.getString("prompt"),
            firstMessage = json.optString("first_message"),
            language = json.optString("language", "he"),
            voiceId = json.getString("voice_id"),
        )
    }
}

/** An event from the ElevenLabs Agents WebSocket, reduced to what the conversation acts on. */
sealed interface ElevenLabsEvent {
    /** The conversation is live; both formats must be PCM at [ElevenLabsProtocol.AUDIO_FORMAT]. */
    data class Started(val inputFormat: String, val outputFormat: String) : ElevenLabsEvent
    data class Audio(val base64: String) : ElevenLabsEvent
    data class CarmenSaid(val text: String) : ElevenLabsEvent
    data class UserSaid(val text: String) : ElevenLabsEvent
    data object Interrupted : ElevenLabsEvent
    data class Ping(val eventId: Int) : ElevenLabsEvent
    data class ToolCall(val name: String, val callId: String, val args: JSONObject) : ElevenLabsEvent
    data class Other(val type: String) : ElevenLabsEvent
}

/** Reads and writes the ElevenLabs Agents WebSocket messages. Pure, so it is unit-tested. */
object ElevenLabsProtocol {
    /** The agent is set to PCM 16 kHz both ways ([ConversationAudio.ELEVENLABS_SAMPLE_RATE]). */
    const val AUDIO_FORMAT = "pcm_16000"

    fun parse(event: JSONObject): ElevenLabsEvent = when (val type = event.optString("type")) {
        "conversation_initiation_metadata" -> event.optJSONObject("conversation_initiation_metadata_event").let {
            ElevenLabsEvent.Started(
                inputFormat = it?.optString("user_input_audio_format").orEmpty(),
                outputFormat = it?.optString("agent_output_audio_format").orEmpty(),
            )
        }
        "audio" -> ElevenLabsEvent.Audio(event.optJSONObject("audio_event")?.optString("audio_base_64").orEmpty())
        "agent_response" ->
            ElevenLabsEvent.CarmenSaid(event.optJSONObject("agent_response_event")?.optString("agent_response").orEmpty())
        "user_transcript" ->
            ElevenLabsEvent.UserSaid(event.optJSONObject("user_transcription_event")?.optString("user_transcript").orEmpty())
        "interruption" -> ElevenLabsEvent.Interrupted
        "ping" -> ElevenLabsEvent.Ping(event.optJSONObject("ping_event")?.optInt("event_id") ?: 0)
        "client_tool_call" -> event.optJSONObject("client_tool_call").let {
            ElevenLabsEvent.ToolCall(
                name = it?.optString("tool_name").orEmpty(),
                callId = it?.optString("tool_call_id").orEmpty(),
                args = it?.optJSONObject("parameters") ?: JSONObject(),
            )
        }
        else -> ElevenLabsEvent.Other(type)
    }

    /**
     * The first message on the socket: Carmen's persona, opening line, language and voice for
     * this call. The agent must allow these overrides (Security → Overrides).
     */
    fun initiation(session: ElevenLabsSession): JSONObject = JSONObject()
        .put("type", "conversation_initiation_client_data")
        .put(
            "conversation_config_override",
            JSONObject()
                .put(
                    "agent",
                    JSONObject()
                        .put("prompt", JSONObject().put("prompt", session.prompt))
                        .put("first_message", session.firstMessage)
                        .put("language", session.language),
                )
                .put("tts", JSONObject().put("voice_id", session.voiceId)),
        )

    fun userAudio(base64: String): JSONObject = JSONObject().put("user_audio_chunk", base64)

    fun pong(eventId: Int): JSONObject = JSONObject().put("type", "pong").put("event_id", eventId)

    fun toolResult(callId: String, result: String, isError: Boolean = false): JSONObject = JSONObject()
        .put("type", "client_tool_result")
        .put("tool_call_id", callId)
        .put("result", result)
        .put("is_error", isError)
}
