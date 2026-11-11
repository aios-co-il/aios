package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        drafts.markSent(draft)
        assertEquals(WhatsAppDrafts.Step.AlreadySent(draft), drafts.step(draft, userConfirmed = true))
    }

    @Test
    fun `a spoken yes takes the waiting message once, and a no drops it`() {
        val drafts = WhatsAppDrafts()
        drafts.step(draft, userConfirmed = false)
        assertEquals(draft, drafts.takePending())
        assertNull(drafts.takePending())
        drafts.step(draft, userConfirmed = false)
        drafts.cancel()
        assertNull(drafts.pending())
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

    @Test
    fun `a confirmed first call sends when the user said yes to the text just read aloud`() {
        // Production, AIO-566: she read the text back, the user said "כן, תשלחי", and the first
        // call only prepared it; later she said it was sent when it was not.
        val message = "היי אדווה, זאת כרמן. תשמרי את הטלפון כגיבוי."
        val draft = WhatsAppDraft("050-871-7428", "אדוה יפה שלי", message, WhatsAppLine.CARMEN)
        val turns = listOf(
            "assistant" to "הנוסח: \"היי אדווה, זאת כרמן. תשמרי את הטלפון כגיבוי\". מאשרים את השליחה?",
            "user" to "כן, תשלחי.",
            "assistant" to "שולחת את ההודעה.",
        )
        assertTrue(WhatsAppDrafts.yesToReadBack(draft, turns))
        assertEquals(WhatsAppDrafts.Step.Send(draft), WhatsAppDrafts().step(draft, userConfirmed = true, confirmedAloud = true))
    }

    @Test
    fun `no yes, or a different text read aloud, still only prepares the message`() {
        val draft = WhatsAppDraft("0508717428", "אדוה", "נפגש בשמונה", WhatsAppLine.ME)
        val unclear = listOf("assistant" to "הנוסח: נפגש בשמונה. לשלוח?", "user" to "את חוזרת על עצמך? שלחת כבר?")
        val otherText = listOf("assistant" to "הנוסח: נפגש בתשע. לשלוח?", "user" to "כן")
        assertFalse(WhatsAppDrafts.yesToReadBack(draft, unclear))
        assertFalse(WhatsAppDrafts.yesToReadBack(draft, otherText))
        assertFalse(WhatsAppDrafts.yesToReadBack(draft, emptyList()))
        assertEquals(WhatsAppDrafts.Step.ReadBack(draft), WhatsAppDrafts().step(draft, userConfirmed = true))
    }
}
