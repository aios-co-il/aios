package co.il.aios.carmen

import org.json.JSONObject

/**
 * A live voice conversation with Carmen after the wake word: OpenAI Realtime
 * ([RealtimeConversation]) or ElevenLabs ([ElevenLabsConversation]), as the provider of the
 * user's stored voice says ([VoicePreference]).
 */
interface LiveConversation {
    fun start()
    fun stop(reason: String)

    interface Listener {
        fun onState(state: CarmenSession.State)
        fun onTranscript(line: String)
        fun onEnded(reason: String)
    }

    companion object {
        /** The provider value, in the server's voice list and in the session request, that means ElevenLabs. */
        const val ELEVENLABS = "elevenlabs"

        /**
         * The `carmen-realtime-session` body for a call: always the app's organization, so the
         * voice, the brain and the stored row agree on one; the picked voice when there is one
         * (none = Carmen's configured voice); and [provider] unless it is OpenAI, the server's default.
         */
        fun sessionRequest(tenantId: String, voice: String?, provider: String? = null): JSONObject {
            val body = JSONObject().put("tenant_id", tenantId)
            if (provider != null) body.put("provider", provider)
            if (voice != null) body.put("voice", voice)
            return body
        }
    }
}
