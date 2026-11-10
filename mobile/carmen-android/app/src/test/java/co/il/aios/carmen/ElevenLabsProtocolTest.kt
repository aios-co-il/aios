package co.il.aios.carmen

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ElevenLabsProtocolTest {

    private fun parse(json: String) = ElevenLabsProtocol.parse(JSONObject(json))

    @Test
    fun readsTheStartWithBothAudioFormats() {
        val event = parse(
            """{"type":"conversation_initiation_metadata","conversation_initiation_metadata_event":
               {"conversation_id":"c1","agent_output_audio_format":"pcm_16000","user_input_audio_format":"pcm_16000"}}""",
        )
        assertEquals(ElevenLabsEvent.Started("pcm_16000", "pcm_16000"), event)
    }

    @Test
    fun readsAudioWordsAndInterruptions() {
        assertEquals(
            ElevenLabsEvent.Audio("AAAA"),
            parse("""{"type":"audio","audio_event":{"audio_base_64":"AAAA","event_id":3}}"""),
        )
        assertEquals(
            ElevenLabsEvent.CarmenSaid("שלום"),
            parse("""{"type":"agent_response","agent_response_event":{"agent_response":"שלום"}}"""),
        )
        assertEquals(
            ElevenLabsEvent.UserSaid("מה המצב"),
            parse("""{"type":"user_transcript","user_transcription_event":{"user_transcript":"מה המצב"}}"""),
        )
        assertEquals(ElevenLabsEvent.Interrupted, parse("""{"type":"interruption","interruption_event":{"event_id":4}}"""))
    }

    @Test
    fun answersPingsWithTheirEventId() {
        val ping = parse("""{"type":"ping","ping_event":{"event_id":7,"ping_ms":50}}""")
        assertEquals(ElevenLabsEvent.Ping(7), ping)
        val pong = ElevenLabsProtocol.pong(7)
        assertEquals("pong", pong.getString("type"))
        assertEquals(7, pong.getInt("event_id"))
    }

    @Test
    fun readsAToolCallAndWritesItsResult() {
        val call = parse(
            """{"type":"client_tool_call","client_tool_call":
               {"tool_name":"ask_carmen","tool_call_id":"t1","parameters":{"question":"כמה לידים היום"}}}""",
        ) as ElevenLabsEvent.ToolCall
        assertEquals("ask_carmen", call.name)
        assertEquals("t1", call.callId)
        assertEquals("כמה לידים היום", call.args.getString("question"))

        val result = ElevenLabsProtocol.toolResult("t1", "שלושה")
        assertEquals("client_tool_result", result.getString("type"))
        assertEquals("t1", result.getString("tool_call_id"))
        assertEquals("שלושה", result.getString("result"))
        assertEquals(false, result.getBoolean("is_error"))
    }

    @Test
    fun unknownEventsAreIgnoredByType() {
        assertEquals(ElevenLabsEvent.Other("vad_score"), parse("""{"type":"vad_score","vad_score_event":{"vad_score":0.2}}"""))
    }

    @Test
    fun theInitiationCarriesThePersonaLanguageAndVoice() {
        val session = ElevenLabsSession.from(
            JSONObject(
                """{"provider":"elevenlabs","signed_url":"wss://x","prompt":"את כרמן","first_message":"כן, אני מקשיבה",
                   "language":"he","voice":{"id":"danit","label":"דנית"},"voice_id":"v123"}""",
            ),
        )
        val override = ElevenLabsProtocol.initiation(session).getJSONObject("conversation_config_override")
        val agent = override.getJSONObject("agent")
        assertEquals("את כרמן", agent.getJSONObject("prompt").getString("prompt"))
        assertEquals("כן, אני מקשיבה", agent.getString("first_message"))
        assertEquals("he", agent.getString("language"))
        assertEquals("v123", override.getJSONObject("tts").getString("voice_id"))
    }

    @Test
    fun `a background result reaches the agent as a user message`() {
        val event = ElevenLabsProtocol.userMessage("[תשובה מ-ask_carmen] 14 לידים")
        assertEquals("user_message", event.getString("type"))
        assertEquals("[תשובה מ-ask_carmen] 14 לידים", event.getString("text"))
    }
}
