package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceTranscriptTest {
    @Test
    fun `both sides of the call are kept in order for memory`() {
        val transcript = VoiceTranscript()
        transcript.carmen("כן, אני מקשיבה")
        transcript.user("  תזכרי שעדווה היא המעצבת החדשה ")
        transcript.carmen("רשמתי.")
        transcript.user("   ")

        assertEquals(
            listOf("assistant" to "כן, אני מקשיבה", "user" to "תזכרי שעדווה היא המעצבת החדשה", "assistant" to "רשמתי."),
            transcript.turns(),
        )
        val messages = transcript.messages()
        assertEquals(3, messages.length())
        assertEquals("user", messages.getJSONObject(1).getString("role"))
        assertEquals("שיחה קולית · תזכרי שעדווה היא המעצבת החדשה", transcript.title())
    }

    @Test
    fun `a call where the user said nothing is not saved`() {
        val transcript = VoiceTranscript()
        transcript.carmen("כן, אני מקשיבה")
        assertFalse(transcript.worthSaving())
        transcript.user("היי")
        assertTrue(transcript.worthSaving())
    }

    @Test
    fun `a call without a conversation is saved as a new titled one in the app organization`() {
        val transcript = VoiceTranscript()
        transcript.user("מה המצב")

        val body = VoiceMemory.saveRequest("org-m", transcript, null)

        assertEquals("org-m", body.getString("p_tenant_id"))
        assertEquals("שיחה קולית · מה המצב", body.getString("p_title"))
        assertEquals(1, body.getJSONArray("p_messages").length())
        assertFalse(body.has("p_conversation_id"))
    }

    @Test
    fun `a call the brain answered in replaces that conversation's messages`() {
        val transcript = VoiceTranscript()
        transcript.user("מה המצב")

        val body = VoiceMemory.saveRequest("org-m", transcript, "conv-1")

        assertEquals("conv-1", body.getString("p_conversation_id"))
        assertEquals("org-m", body.getString("p_tenant_id"))
        assertFalse(body.has("p_title"))
    }

    @Test
    fun `the saved conversation id is read from the function reply`() {
        assertEquals("0b7c", VoiceMemory.conversationId("\"0b7c\""))
        assertThrows(IllegalStateException::class.java) { VoiceMemory.conversationId("null") }
        assertThrows(IllegalStateException::class.java) { VoiceMemory.conversationId("{\"code\":\"P0002\"}") }
    }
}
