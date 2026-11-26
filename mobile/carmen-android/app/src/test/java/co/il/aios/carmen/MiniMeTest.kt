package co.il.aios.carmen

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MiniMeTest {

    /** The cases of the site's rule, `minime-gender.test.ts`. */
    @Test
    fun theUsersChoiceWinsThenTheirAddressGenderThenMale() {
        assertEquals(MiniMeSet.MALE, MiniMeSet.resolve("male", "female"))
        assertEquals(MiniMeSet.FEMALE, MiniMeSet.resolve(null, "female"))
        assertEquals(MiniMeSet.MALE, MiniMeSet.resolve(null, null))
        assertEquals(MiniMeSet.MALE, MiniMeSet.resolve("other", "male"))
    }

    @Test
    fun readsTheSetFromTheUsersProfile() {
        assertEquals(MiniMeSet.FEMALE, MiniMeSet.fromProfile(JSONArray("""[{"minime_gender":"female","gender":"male"}]""")))
        assertEquals(MiniMeSet.FEMALE, MiniMeSet.fromProfile(JSONArray("""[{"minime_gender":null,"gender":"female"}]""")))
        assertEquals(MiniMeSet.MALE, MiniMeSet.fromProfile(JSONArray("""[{"minime_gender":null,"gender":null}]""")))
        assertEquals(MiniMeSet.MALE, MiniMeSet.fromProfile(JSONArray("[]")))
    }

    @Test
    fun eachSetShowsItsOwnRender() {
        assertEquals(R.drawable.minime_male, MiniMeSet.MALE.render)
        assertEquals(R.drawable.minime_female, MiniMeSet.FEMALE.render)
    }

    @Test
    fun aStoredSetIsReadBackAndAnythingElseIsNone() {
        assertEquals(MiniMeSet.FEMALE, MiniMeSet.of(MiniMeSet.FEMALE.value))
        assertNull(MiniMeSet.of("null"))
        assertNull(MiniMeSet.of(null))
    }

    @Test
    fun speakingPulsesBetweenFullSizeAndFivePercentLarger() {
        assertEquals(MiniMePose(scale = 1f), MiniMePose.at(CarmenClips.Clip.SPEAKING, 0.0))
        assertEquals(1.05f, MiniMePose.at(CarmenClips.Clip.SPEAKING, 0.5).scale, 1e-4f)
        assertEquals(1f, MiniMePose.at(CarmenClips.Clip.SPEAKING, 1.0).scale, 1e-4f)
    }

    @Test
    fun listeningTiltsSlowlyAndWorkingFast() {
        assertEquals(-3f, MiniMePose.at(CarmenClips.Clip.LISTENING, 0.0).tilt, 1e-4f)
        assertEquals(3f, MiniMePose.at(CarmenClips.Clip.LISTENING, 2.6).tilt, 1e-4f)
        assertEquals(3f, MiniMePose.at(CarmenClips.Clip.WORKING, 1.2).tilt, 1e-4f)
        assertEquals(1f, MiniMePose.at(CarmenClips.Clip.WORKING, 1.2).scale, 0f)
    }

    @Test
    fun aChangeOfStateEasesInsteadOfJumping() {
        val next = MiniMePose(scale = 1f, tilt = 3f).toward(MiniMePose(scale = 1.05f, tilt = 0f), 0.5f)

        assertEquals(1.025f, next.scale, 1e-4f)
        assertEquals(1.5f, next.tilt, 1e-4f)
    }
}
