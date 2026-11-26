package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the app sends so the server runs the stored brain and the call speaks the stored voice. */
class StoredPickRequestsTest {

    @Test
    fun aQuestionAsksForTheStoredBrainAndNamesNone() {
        val body = CarmenBrain.requestBody("מה חדש?", "tenant-1", conversationId = null, runId = "run-1", history = emptyList())

        assertTrue(body.getBoolean("use_brain_pick"))
        assertFalse(body.has("brain_slug"))
        assertEquals("tenant-1", body.getString("tenant_id"))
        assertEquals("מה חדש?", body.getString("command_text"))
        assertEquals("run-1", body.getString("run_id"))
        assertTrue(body.isNull("conversation_id"))
    }

    @Test
    fun aQuestionCarriesItsConversationAndHistory() {
        val body = CarmenBrain.requestBody(
            "ומה עוד?",
            "tenant-1",
            conversationId = "conversation-1",
            runId = "run-2",
            history = listOf("user" to "מה חדש?", "assistant" to "הכול טוב"),
        )

        assertEquals("conversation-1", body.getString("conversation_id"))
        val history = body.getJSONArray("conversation_history")
        assertEquals(2, history.length())
        assertEquals("assistant", history.getJSONObject(1).getString("role"))
        assertEquals("הכול טוב", history.getJSONObject(1).getString("content"))
    }

    @Test
    fun anOpenAiCallSendsTheOrganizationAndThePickedVoice() {
        val body = LiveConversation.sessionRequest("tenant-1", "marin")

        assertEquals(setOf("tenant_id", "voice"), body.keys().asSequence().toSet())
        assertEquals("tenant-1", body.getString("tenant_id"))
        assertEquals("marin", body.getString("voice"))
    }

    @Test
    fun aCallWithoutAPickSendsNoVoice() {
        val body = LiveConversation.sessionRequest("tenant-1", voice = null)

        assertEquals(setOf("tenant_id"), body.keys().asSequence().toSet())
    }

    @Test
    fun anElevenLabsCallNamesItsProvider() {
        val body = LiveConversation.sessionRequest("tenant-1", "yael", LiveConversation.ELEVENLABS)

        assertEquals(setOf("tenant_id", "voice", "provider"), body.keys().asSequence().toSet())
        assertEquals("elevenlabs", body.getString("provider"))
        assertEquals("yael", body.getString("voice"))
    }
}
