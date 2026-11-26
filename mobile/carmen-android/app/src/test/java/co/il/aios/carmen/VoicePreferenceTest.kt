package co.il.aios.carmen

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoicePreferenceTest {

    @Test
    fun readsTheServersVoicesInOrder() {
        val json = JSONObject(
            """{"voices":[{"id":"yael","label":"יעל","provider":"elevenlabs"},{"id":"marin","label":"Marin","provider":"openai"}]}""",
        )
        assertEquals(
            listOf(
                VoicePreference.Choice("yael", "יעל", "elevenlabs"),
                VoicePreference.Choice("marin", "Marin", "openai"),
            ),
            VoicePreference.parseVoices(json),
        )
    }

    @Test
    fun theProviderInTheListPicksTheConnection() {
        assertTrue(VoicePreference.Choice("yael", "יעל", "elevenlabs").usesElevenLabs)
        assertFalse(VoicePreference.Choice("marin", "Marin", "openai").usesElevenLabs)
    }

    @Test
    fun skipsVoicesWithoutAnIdOrAProviderAndToleratesAMissingList() {
        val json = JSONObject(
            """{"voices":[{"label":"x","provider":"openai"},{"id":"danit","label":"דנית"},{"id":"zina","label":"זינה","provider":"elevenlabs"}]}""",
        )
        assertEquals(listOf(VoicePreference.Choice("zina", "זינה", "elevenlabs")), VoicePreference.parseVoices(json))
        assertEquals(emptyList<VoicePreference.Choice>(), VoicePreference.parseVoices(JSONObject("{}")))
    }
}
