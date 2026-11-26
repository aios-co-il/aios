package co.il.aios.carmen

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The stored voice pick: reading the row, the phone's cache of it, and the one-time move of an old pick. */
class StoredVoiceTest {

    private val yael = VoicePreference.Choice("yael", "יעל", "elevenlabs")
    private val marin = VoicePreference.Choice("marin", "Marin", "openai")
    private val voices = listOf(yael, marin)

    @Test
    fun readsTheVoiceOfTheUsersRow() {
        assertEquals("marin", StoredVoice.voiceOf(JSONArray("""[{"voice":"marin"}]""")))
    }

    @Test
    fun noRowOrAnEmptyVoiceIsNoPick() {
        assertNull(StoredVoice.voiceOf(JSONArray("[]")))
        assertNull(StoredVoice.voiceOf(JSONArray("""[{"voice":null}]""")))
        assertNull(StoredVoice.voiceOf(JSONArray("""[{"voice":""}]""")))
        assertNull(StoredVoice.voiceOf(JSONArray("""[{}]""")))
    }

    @Test
    fun theServersListGivesAStoredVoiceItsProvider() {
        assertEquals(yael, StoredVoice.find("yael", voices))
        assertEquals(marin, StoredVoice.find("marin", voices))
    }

    @Test
    fun aVoiceTheServerDoesNotListReadsAsNoPick() {
        assertNull(StoredVoice.find("someone-new", voices))
        assertNull(StoredVoice.find(null, voices))
    }

    @Test
    fun anOldPickMovesOnlyOntoAnEmptyRow() {
        assertEquals(yael, StoredVoice.adoption(rowVoice = null, legacyVoice = "yael", voices = voices))

        // The row wins, whatever the phone held.
        assertNull(StoredVoice.adoption(rowVoice = "marin", legacyVoice = "yael", voices = voices))
        assertNull(StoredVoice.adoption(rowVoice = "someone-new", legacyVoice = "yael", voices = voices))
    }

    @Test
    fun theOldOpenAiChoiceAndUnknownVoicesMoveNothing() {
        assertNull(StoredVoice.adoption(rowVoice = null, legacyVoice = "openai", voices = voices))
        assertNull(StoredVoice.adoption(rowVoice = null, legacyVoice = "someone-new", voices = voices))
        assertNull(StoredVoice.adoption(rowVoice = null, legacyVoice = null, voices = voices))
    }

    @Test
    fun theCachedPickIsOnlyForTheUserAndOrganizationItWasReadFor() {
        val owner = StoredVoice.owner(userId = "user-1", tenantId = "tenant-1")
        val cache = StoredVoice.Cache(owner, "yael", "יעל", "elevenlabs")

        assertEquals(yael, cache.pickFor(owner))
        assertNull(cache.pickFor(StoredVoice.owner(userId = "user-2", tenantId = "tenant-1")))
        assertNull(cache.pickFor(StoredVoice.owner(userId = "user-1", tenantId = "tenant-2")))
        assertNull(cache.pickFor(null))
    }

    @Test
    fun aCacheWithoutAnOwnerOrAVoiceGivesNoPick() {
        val owner = StoredVoice.owner(userId = "user-1", tenantId = "tenant-1")

        // What a build before the stamp left behind, and a row read with no voice in it.
        assertNull(StoredVoice.Cache(owner = null, id = "yael", label = "יעל", provider = null).pickFor(owner))
        assertNull(StoredVoice.Cache(owner, id = null, label = null, provider = null).pickFor(owner))
    }

    @Test
    fun theWriteNamesTheOrganizationAndTheVoiceOnly() {
        val body = StoredVoice.rowBody("tenant-1", "marin")

        assertEquals(setOf("tenant_id", "voice"), body.keys().asSequence().toSet())
        assertEquals("tenant-1", body.getString("tenant_id"))
        assertEquals("marin", body.getString("voice"))
    }

    @Test
    fun carmensDefaultWritesANullVoice() {
        val body = StoredVoice.rowBody("tenant-1", null)

        assertTrue(body.has("voice"))
        assertTrue(body.isNull("voice"))
        assertFalse(body.has("brain_slug"))
    }
}
