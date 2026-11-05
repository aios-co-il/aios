package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Test

class BrainStreamTest {
    private fun parse(vararg lines: String) = BrainStream().apply { lines.forEach(::accept) }

    @Test
    fun `joins streamed tokens into the answer`() {
        val stream = parse(
            """data: {"type":"token","content":"יש "}""",
            """data: {"type":"token","content":"3 לידים"}""",
            "data: [DONE]",
        )
        assertEquals("יש 3 לידים", stream.answer())
    }

    @Test
    fun `keeps the conversation id for the next question`() {
        val stream = parse("""data: {"type":"conversation_id","id":"c-1"}""")
        assertEquals("c-1", stream.conversationId)
    }

    @Test
    fun `reports an error sent inside a 200 stream`() {
        val stream = parse("""data: {"type":"error","message":"no tenant"}""")
        assertEquals("נתקלתי בשגיאה במערכת: no tenant", stream.answer())
    }

    @Test
    fun `keeps the partial answer when the run fails midway`() {
        val stream = parse(
            """data: {"type":"token","content":"התחלתי"}""",
            """data: {"type":"done","success":false}""",
        )
        assertEquals("התחלתי\n(שים לב: הפעולה נקטעה בשגיאה: הפעולה נכשלה)", stream.answer())
    }

    @Test
    fun `ignores keep-alives and broken lines`() {
        val stream = parse(": ping", "data: {broken", "")
        assertEquals("לא נמצאה תשובה.", stream.answer())
    }
}
