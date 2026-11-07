package co.il.aios.carmen

/**
 * A live voice conversation with Carmen after the wake word: OpenAI Realtime
 * ([RealtimeConversation]) or ElevenLabs ([ElevenLabsConversation]), as the voice picker chose.
 */
interface LiveConversation {
    fun start()
    fun stop(reason: String)

    interface Listener {
        fun onState(state: CarmenSession.State)
        fun onTranscript(line: String)
        fun onEnded(reason: String)
    }
}
