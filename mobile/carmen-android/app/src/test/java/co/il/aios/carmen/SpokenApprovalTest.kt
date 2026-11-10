package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Test

class SpokenApprovalTest {
    @Test
    fun `a short yes approves`() {
        for (yes in listOf("כן, מאשרים. קרמן, מאשרים.", "כן", "יאללה תשלחי", "סבבה", "אוקיי")) {
            assertEquals(yes, SpokenApproval.Answer.YES, SpokenApproval.parse(yes))
        }
    }

    @Test
    fun `a no or a wait drops it`() {
        for (no in listOf("לא", "אל תשלחי", "רגע, תחכי", "כן... לא, תבטלי")) {
            assertEquals(no, SpokenApproval.Answer.NO, SpokenApproval.parse(no))
        }
    }

    @Test
    fun `a change or a long sentence is left to Carmen`() {
        assertEquals(SpokenApproval.Answer.NONE, SpokenApproval.parse("כן אבל תשני את הנוסח"))
        assertEquals(SpokenApproval.Answer.NONE, SpokenApproval.parse("כן תוסיפי בסוף שאני מתקשר מחר בבוקר"))
        assertEquals(
            SpokenApproval.Answer.NONE,
            SpokenApproval.parse("כן אני חושב שזה בסדר בגדול אבל בוא נחשוב על זה עוד קצת"),
        )
        assertEquals(SpokenApproval.Answer.NONE, SpokenApproval.parse("מה השעה"))
    }

    @Test
    fun `calling off a running check is recognised`() {
        for (cancel in listOf("תבטלי את זה", "עזבי, שיניתי את דעתי", "לא צריך כבר", "עצרי")) {
            assertEquals(cancel, true, SpokenCancel.matches(cancel))
        }
        for (other in listOf("כן", "מה המצב של פסגות", "לא, התכוונתי לאקו")) {
            assertEquals(other, false, SpokenCancel.matches(other))
        }
    }
}
