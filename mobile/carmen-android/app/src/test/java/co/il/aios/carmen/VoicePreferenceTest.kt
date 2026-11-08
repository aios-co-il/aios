package co.il.aios.carmen

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class VoicePreferenceTest {

    @Test
    fun readsTheServersVoicesInOrder() {
        val json = JSONObject("""{"voices":[{"id":"yael","label":"יעל"},{"id":"danit","label":"דנית"}]}""")
        assertEquals(
            listOf(VoicePreference.Choice("yael", "יעל"), VoicePreference.Choice("danit", "דנית")),
            VoicePreference.parseVoices(json),
        )
    }

    @Test
    fun skipsVoicesWithoutAnIdAndToleratesAMissingList() {
        assertEquals(
            listOf(VoicePreference.Choice("zina", "זינה")),
            VoicePreference.parseVoices(JSONObject("""{"voices":[{"label":"x"},{"id":"zina","label":"זינה"}]}""")),
        )
        assertEquals(emptyList<VoicePreference.Choice>(), VoicePreference.parseVoices(JSONObject("{}")))
    }
}
