package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Where the chat's pictures are stored, how they are shrunk, and what the brain's request carries (AIO-684). */
class ChatPicturesTest {

    private val user = "0f8fad5b-d9cb-469f-a165-70867728950e"

    /** The server's rule for a picture's path (`OWN_FILE` in `run-ai-agent/attachments/picture-request.ts`). */
    private val serverPath = Regex("^([0-9a-f-]{36})/([A-Za-z0-9._-]{1,300})$", RegexOption.IGNORE_CASE)

    @Test
    fun aPictureIsStoredInTheUsersOwnFolderAsTheServerReadsIt() {
        val path = ChatPictures.storagePath(user, "תמונה של לקוח (1).HEIC", now = 1700000000000, index = 0)

        assertEquals("$user/1700000000000-0-_______________1_.jpg", path)
        assertTrue(serverPath.matches(path))
        assertTrue(ChatPictures.inOwnFolder(user, path))
    }

    @Test
    fun aLongNameIsCutToWhatTheServerAccepts() {
        val path = ChatPictures.storagePath(user, "a".repeat(500) + ".png", now = 1, index = 3)

        assertEquals(300, path.substringAfter('/').length)
        assertTrue(path.endsWith(".jpg"))
        assertTrue(serverPath.matches(path))
    }

    @Test
    fun twoPicturesOfOneNamePickedTogetherNeverShareAPath() {
        val first = ChatPictures.storagePath(user, "IMG.jpg", now = 5, index = 0)
        val second = ChatPictures.storagePath(user, "IMG.jpg", now = 5, index = 1)

        assertNotEquals(first, second)
    }

    @Test
    fun aNameWithoutLettersStillGetsAFile() {
        assertEquals("$user/5-0-picture.jpg", ChatPictures.storagePath(user, ".jpg", now = 5, index = 0))
    }

    @Test
    fun onlyAFileDirectlyInTheSignedInUsersFolderIsTheirs() {
        val other = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"

        assertFalse(ChatPictures.inOwnFolder(user, "$other/5-0-a.jpg"))
        assertFalse(ChatPictures.inOwnFolder(user, "$user/nested/a.jpg"))
        assertFalse(ChatPictures.inOwnFolder(user, "$user/"))
        assertFalse(ChatPictures.inOwnFolder(user, "$user/.."))
        assertFalse(ChatPictures.inOwnFolder(user, "${user}0/a.jpg"))
        assertFalse(ChatPictures.inOwnFolder("", "/a.jpg"))
        assertTrue(ChatPictures.inOwnFolder(user, "$user/5-0-a.jpg"))
    }

    @Test
    fun aLargePictureShrinksToItsLongestSideAndKeepsItsShape() {
        assertEquals(2048 to 1536, ChatPictures.targetSize(4000, 3000, 2048))
        assertEquals(1152 to 2048, ChatPictures.targetSize(2250, 4000, 2048))
        assertEquals(800 to 600, ChatPictures.targetSize(800, 600, 2048))
        assertEquals(2048 to 1, ChatPictures.targetSize(20000, 2, 2048))
    }

    @Test
    fun eachPictureGetsAShareThatKeepsAFullMessageInsideTheTotal() {
        val contract = PictureLimits(maxPictures = 4, maxPictureBytes = 5 * MB, maxTurnBytes = 8 * MB)

        assertEquals(2 * MB, contract.perPictureBudget)
        assertEquals(5 * MB, PictureLimits(maxPictures = 1, maxPictureBytes = 5 * MB, maxTurnBytes = 8 * MB).perPictureBudget)
    }

    @Test
    fun theAppsLimitsFitTheContractItWasBuiltFrom() {
        val limits = PictureLimits.CONTRACT

        assertTrue(limits.perPictureBudget <= limits.maxPictureBytes)
        assertTrue(limits.perPictureBudget.toLong() * limits.maxPictures <= limits.maxTurnBytes)
        assertEquals(limits.maxPictures, ChatPictures.room(0))
        assertEquals(0, ChatPictures.room(limits.maxPictures + 1))
    }

    @Test
    fun theShrinkStepsOnlyEverGetSmaller() {
        ChatPictures.ENCODE_STEPS.zipWithNext().forEach { (before, after) ->
            assertTrue(after.longestSide <= before.longestSide && after.quality <= before.quality)
            assertNotEquals(before, after)
        }
    }

    @Test
    fun picturesAloneAreSentWithTheSitesLabelAndTypedTextAsTyped() {
        assertEquals("📎 קבצים מצורפים (2)", ChatPictures.turnText("  ", 2))
        assertEquals("מה רואים כאן?", ChatPictures.turnText(" מה רואים כאן? ", 2))
        assertEquals("", ChatPictures.turnText(" ", 0))
    }

    @Test
    fun aQuestionWithPicturesNamesThemByPathOnly() {
        val pictures = listOf(TurnPicture("a.jpg", "$user/5-0-a.jpg", 1200), TurnPicture("b.png", "$user/5-1-b.jpg", 900))

        val body = CarmenBrain.requestBody("מה זה?", "tenant-1", null, "run-1", emptyList(), pictures)

        val sent = body.getJSONArray("attachments")
        assertEquals(2, sent.length())
        val first = sent.getJSONObject(0)
        assertEquals(setOf("name", "path", "type", "size"), first.keys().asSequence().toSet())
        assertEquals("image", first.getString("type"))
        assertEquals("$user/5-0-a.jpg", first.getString("path"))
        assertEquals(1200, first.getInt("size"))
        assertEquals("מה זה?", body.getString("command_text"))
    }

    @Test
    fun aQuestionWithoutPicturesSendsNoAttachments() {
        val body = CarmenBrain.requestBody("מה חדש?", "tenant-1", null, "run-1", emptyList())

        assertFalse(body.has("attachments"))
    }

    private companion object {
        const val MB = 1024 * 1024
    }
}
