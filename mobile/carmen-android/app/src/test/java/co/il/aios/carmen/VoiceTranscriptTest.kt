package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
