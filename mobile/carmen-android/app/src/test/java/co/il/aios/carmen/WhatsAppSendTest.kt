package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WhatsAppSendTest {
    private val draft = WhatsAppDraft("052-123 4567", "דני", "אני מאחר בעשר דקות", WhatsAppLine.ME)

    @Test
    fun `the first call only reads the message back, even when it says confirmed`() {
        val drafts = WhatsAppDrafts()
        assertEquals(WhatsAppDrafts.Step.ReadBack(draft), drafts.step(draft, userConfirmed = true))
    }

    @Test
    fun `the user's yes for the message read back sends it once`() {
        val drafts = WhatsAppDrafts()
        drafts.step(draft, userConfirmed = false)
        val sameNumberOtherFormat = draft.copy(number = "+972521234567")
        assertEquals(WhatsAppDrafts.Step.Send(draft), drafts.step(sameNumberOtherFormat, userConfirmed = true))
        assertEquals(WhatsAppDrafts.Step.ReadBack(draft), drafts.step(draft, userConfirmed = true))
    }

    @Test
    fun `a changed text, line or number is read back again`() {
        for (changed in listOf(
            draft.copy(message = "אני מאחר בחצי שעה"),
            draft.copy(line = WhatsAppLine.CARMEN),
            draft.copy(number = "0549999999"),
        )) {
            val drafts = WhatsAppDrafts()
            drafts.step(draft, userConfirmed = false)
            assertEquals(WhatsAppDrafts.Step.ReadBack(changed), drafts.step(changed, userConfirmed = true))
        }
    }

    @Test
    fun `a call without a line, text or valid number is refused`() {
        val drafts = WhatsAppDrafts()
        for (bad in listOf(draft.copy(line = null), draft.copy(message = ""), draft.copy(number = "דני"))) {
            assertTrue(drafts.step(bad, userConfirmed = true) is WhatsAppDrafts.Step.Invalid)
        }
    }

    @Test
    fun `lines resolve from the model's names to their send functions`() {
        assertEquals("send-green-api-message", WhatsAppLine.fromApiName(" Me ")?.function)
        assertEquals("send-manus-wa-message", WhatsAppLine.fromApiName("carmen")?.function)
        assertNull(WhatsAppLine.fromApiName("green"))
    }
}
