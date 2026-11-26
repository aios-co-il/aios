package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Test

/** The cases of the site's `assistantLine`, `assistantVoice.test.ts`. */
class AssistantVoiceTest {

    @Test
    fun namesTheAssistantAndPicksTheFeminineFormForAFemaleVoice() {
        val line = AssistantVoice("כרמן", male = false).line("{name} {אוספת|אוסף} את הנתונים…")

        assertEquals("כרמן אוספת את הנתונים…", line)
    }

    @Test
    fun picksTheMasculineFormForAMaleVoiceInEverySlot() {
        val line = AssistantVoice("מיני מי", male = true).line("{name} {מכינה|מכין} ו{בודקת|בודק}…")

        assertEquals("מיני מי מכין ובודק…", line)
    }

    @Test
    fun leavesALineWithoutSlotsAsItIs() {
        val line = AssistantVoice("מיני מי", male = true).line("עוד רגע הכול על המסך…")

        assertEquals("עוד רגע הכול על המסך…", line)
    }
}
